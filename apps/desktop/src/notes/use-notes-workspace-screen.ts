import { useEffect, useMemo, useRef, useState } from 'react';

import type { FolderDeletionSummary, WorkspaceDirectory, WorkspaceFile } from '../types';
import type { NoteDocumentCommands } from './use-note-document';
import { useNotesWorkspace } from './use-notes-workspace';

type NameDialogState = { mode: 'create' } | { mode: 'rename'; entry: WorkspaceFile };
type DeletingFolder = {
  path: string;
  name: string;
  revision: number;
  summary: FolderDeletionSummary;
};

export type NotesWorkspaceEvent =
  | { type: 'retry.requested' }
  | { type: 'folder.selected'; path: string }
  | { type: 'folder.delete-requested'; folder: { path: string; name: string } }
  | { type: 'entry.activated'; entry: WorkspaceFile }
  | { type: 'entry.open-external-requested'; entry: WorkspaceFile }
  | { type: 'entry.create-requested' }
  | { type: 'entry.rename-requested'; entry: WorkspaceFile }
  | { type: 'entry.delete-requested'; entry: WorkspaceFile }
  | { type: 'name.submitted'; name: string }
  | { type: 'entry.deletion-confirmed' }
  | { type: 'folder.deletion-confirmed' }
  | { type: 'dialog.dismissed'; dialog: 'name' | 'entry-deletion' | 'folder-deletion' }
  | { type: 'document-session.changed'; session: NoteDocumentCommands | null };

const SELECTED_FOLDER_STORAGE_PREFIX = 'bkmrx:notes:selected-folder:';

function selectedFolderStorageKey(notesDir: string) {
  return `${SELECTED_FOLDER_STORAGE_PREFIX}${notesDir}`;
}

function readSelectedFolder(notesDir: string) {
  try {
    return localStorage.getItem(selectedFolderStorageKey(notesDir));
  } catch {
    return null;
  }
}

function writeSelectedFolder(notesDir: string, path: string | null) {
  try {
    const key = selectedFolderStorageKey(notesDir);
    if (path) localStorage.setItem(key, path);
    else localStorage.removeItem(key);
  } catch {
    // Persistence is optional; the Notes Workspace remains usable without it.
  }
}

function findDirectory(root: WorkspaceDirectory, path: string): WorkspaceDirectory | null {
  if (root.relative_path === path) return root;
  for (const directory of root.directories) {
    const found = findDirectory(directory, path);
    if (found) return found;
  }
  return null;
}

function nearestExistingDirectory(root: WorkspaceDirectory, path: string) {
  let candidate = path;
  while (candidate) {
    if (findDirectory(root, candidate)) return candidate;
    candidate = candidate.split('/').slice(0, -1).join('/');
  }
  return '';
}

function renamedFileName(entry: WorkspaceFile, name: string) {
  const currentName = entry.relative_path.split('/').pop();
  const extensionIndex = currentName?.lastIndexOf('.') ?? -1;
  const currentExtension = extensionIndex > 0 ? currentName!.slice(extensionIndex) : '';
  const submittedExtensionIndex = name.lastIndexOf('.');
  const withoutDocumentExtension =
    submittedExtensionIndex > 0 ? name.slice(0, submittedExtensionIndex) : name;
  return { currentName, fileName: `${withoutDocumentExtension}${currentExtension}` };
}

export function useNotesWorkspaceScreen() {
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<WorkspaceFile | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<WorkspaceFile | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<DeletingFolder | null>(null);
  const [documentActionError, setDocumentActionError] = useState<Error | null>(null);
  const [navigationError, setNavigationError] = useState<Error | null>(null);
  const [openingExternalEntry, setOpeningExternalEntry] = useState<WorkspaceFile | null>(null);
  const [documentActionPending, setDocumentActionPending] = useState(false);
  const documentSessionRef = useRef<NoteDocumentCommands | null>(null);
  const workspace = useNotesWorkspace();
  const {
    notesDir,
    workspaceRevision,
    root,
    loading,
    error,
    createNote,
    deleteNote,
    deleteFolder,
    preflightFolderDeletion,
    renameNote,
    openExternalFile,
    refreshNotes,
  } = workspace;

  useEffect(() => {
    if (!notesDir) return;
    setSelectedFolder(readSelectedFolder(notesDir) ?? '');
    setSelectedEntry(null);
    setNameDialog(null);
    setDeletingEntry(null);
    setDeletingFolder(null);
    documentSessionRef.current = null;
  }, [notesDir, workspaceRevision]);

  useEffect(() => {
    if (!notesDir || loading || !root) return;
    const fallback = nearestExistingDirectory(root, selectedFolder);
    if (fallback === selectedFolder) return;
    setSelectedFolder(fallback);
    writeSelectedFolder(notesDir, fallback);
  }, [loading, notesDir, root, selectedFolder]);

  useEffect(() => {
    if (deletingFolder?.revision === workspaceRevision) return;
    setDeletingFolder(null);
  }, [deletingFolder?.revision, workspaceRevision]);

  const selectedDirectory = useMemo(
    () => (root ? (findDirectory(root, selectedFolder) ?? root) : null),
    [root, selectedFolder],
  );

  const problem = navigationError
    ? { message: `无法切换笔记：${navigationError.message}`, retryable: false }
    : openExternalFile.error && openingExternalEntry
      ? {
          message: `无法打开“${openingExternalEntry.name}”：${openExternalFile.error.message}`,
          retryable: false,
        }
      : preflightFolderDeletion.error
        ? {
            message: `无法检查文件夹内容：${preflightFolderDeletion.error.message}`,
            retryable: false,
          }
        : error
          ? { message: error.message, retryable: true }
          : null;

  const leaveActiveDocument = async (transition: () => void) => {
    setNavigationError(null);
    try {
      await documentSessionRef.current?.flush();
      transition();
    } catch (cause) {
      setNavigationError(cause instanceof Error ? cause : new Error(String(cause)));
    }
  };

  const submitName = async (name: string) => {
    if (nameDialog?.mode === 'rename') {
      const entry = nameDialog.entry;
      const { currentName, fileName } = renamedFileName(entry, name);
      if (fileName === currentName) {
        setNameDialog(null);
        return;
      }
      const activeSession =
        selectedEntry?.relative_path === entry.relative_path ? documentSessionRef.current : null;
      let renamedPath: string;
      if (activeSession) {
        setDocumentActionPending(true);
        setDocumentActionError(null);
        try {
          renamedPath = await activeSession.rename(fileName);
        } catch (cause) {
          setDocumentActionError(cause instanceof Error ? cause : new Error(String(cause)));
          return;
        } finally {
          setDocumentActionPending(false);
        }
      } else {
        renamedPath = await renameNote.mutateAsync({
          relativePath: entry.relative_path,
          name: fileName,
        });
      }
      setSelectedEntry((current) =>
        current?.relative_path === entry.relative_path
          ? { ...current, name: fileName, relative_path: renamedPath }
          : current,
      );
      setNameDialog(null);
      if (activeSession) void refreshNotes().catch(() => undefined);
      return;
    }

    const filePath = await createNote.mutateAsync({ directory: selectedFolder, name });
    setSelectedEntry({
      name: filePath.split('/').pop() ?? filePath,
      relative_path: filePath,
      kind: 'markdown',
      capabilities: {
        primary_interaction: 'edit',
        can_rename: true,
        can_delete: true,
        can_open_with_system: false,
      },
    });
    setNameDialog(null);
  };

  const send = async (event: NotesWorkspaceEvent): Promise<void> => {
    switch (event.type) {
      case 'retry.requested':
        await refreshNotes();
        return;
      case 'folder.selected':
        await leaveActiveDocument(() => {
          setSelectedFolder(event.path);
          if (notesDir) writeSelectedFolder(notesDir, event.path);
          setSelectedEntry(null);
        });
        return;
      case 'entry.activated':
        await leaveActiveDocument(() => setSelectedEntry(event.entry));
        return;
      case 'entry.open-external-requested':
        openExternalFile.reset();
        setOpeningExternalEntry(event.entry);
        await openExternalFile.mutateAsync(event.entry.relative_path).catch(() => undefined);
        return;
      case 'entry.create-requested':
        createNote.reset();
        setNameDialog({ mode: 'create' });
        return;
      case 'entry.rename-requested':
        renameNote.reset();
        setDocumentActionError(null);
        setNameDialog({ mode: 'rename', entry: event.entry });
        return;
      case 'entry.delete-requested':
        deleteNote.reset();
        setDocumentActionError(null);
        setDeletingEntry(event.entry);
        return;
      case 'folder.delete-requested': {
        if (workspaceRevision === null) return;
        const revision = workspaceRevision;
        deleteFolder.reset();
        preflightFolderDeletion.reset();
        preflightFolderDeletion.mutate(event.folder.path, {
          onSuccess: (summary) => setDeletingFolder({ ...event.folder, revision, summary }),
        });
        return;
      }
      case 'name.submitted':
        await submitName(event.name);
        return;
      case 'entry.deletion-confirmed': {
        if (!deletingEntry) return;
        const target = deletingEntry;
        const activeSession =
          selectedEntry?.relative_path === target.relative_path ? documentSessionRef.current : null;
        if (activeSession) {
          setDocumentActionPending(true);
          setDocumentActionError(null);
          try {
            await activeSession.delete();
          } catch (cause) {
            setDocumentActionError(cause instanceof Error ? cause : new Error(String(cause)));
            return;
          } finally {
            setDocumentActionPending(false);
          }
        } else {
          try {
            await deleteNote.mutateAsync(target.relative_path);
          } catch {
            return;
          }
        }
        setSelectedEntry((current) =>
          current?.relative_path === target.relative_path ? null : current,
        );
        setDeletingEntry(null);
        if (activeSession) void refreshNotes().catch(() => undefined);
        return;
      }
      case 'folder.deletion-confirmed': {
        if (!deletingFolder) return;
        const target = deletingFolder;
        try {
          await deleteFolder.mutateAsync(target.summary.receipt);
        } catch {
          return;
        }
        const parentPath = target.path.split('/').slice(0, -1).join('/');
        setSelectedFolder((current) => {
          if (current !== target.path && !current.startsWith(`${target.path}/`)) return current;
          if (notesDir) writeSelectedFolder(notesDir, parentPath);
          return parentPath;
        });
        setSelectedEntry((current) =>
          current?.relative_path.startsWith(`${target.path}/`) ? null : current,
        );
        setDeletingFolder(null);
        return;
      }
      case 'dialog.dismissed':
        if (event.dialog === 'name') setNameDialog(null);
        if (event.dialog === 'entry-deletion') setDeletingEntry(null);
        if (event.dialog === 'folder-deletion') setDeletingFolder(null);
        return;
      case 'document-session.changed':
        documentSessionRef.current = event.session;
        return;
    }
  };

  return {
    view: {
      notesDir,
      workspaceRevision,
      root,
      loading,
      problem,
      selectedFolder,
      entries: selectedDirectory?.files ?? [],
      selectedEntry,
      nameDialog,
      deletingEntry,
      deletingFolder,
      documentActionPending,
      nameDialogPending: createNote.isPending || renameNote.isPending || documentActionPending,
      nameDialogError:
        nameDialog?.mode === 'rename'
          ? (documentActionError ?? renameNote.error)
          : createNote.error,
      entryDeletionPending: deleteNote.isPending || documentActionPending,
      entryDeletionError: documentActionError ?? deleteNote.error,
      folderDeletionPending: deleteFolder.isPending,
      folderDeletionError: deleteFolder.error,
    },
    send,
  };
}
