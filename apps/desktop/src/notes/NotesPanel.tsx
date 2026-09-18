import { useEffect, useMemo, useRef, useState } from 'react';

import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { FileText, Settings } from 'lucide-react';
import type { FolderDeletionSummary, WorkspaceDirectory, WorkspaceFile } from '../types';
import NoteEditor from './NoteEditor';
import NoteNameDialog from './NoteNameDialog';
import NotesList from './NotesList';
import NotesSidebar from './NotesSidebar';
import { useNotesWorkspace } from './use-notes-workspace';
import type { NoteDocumentCommands } from './use-note-document';
import { workspaceFileDisplayName } from './workspace-file';

type NameDialogState = { mode: 'create' } | { mode: 'rename'; note: WorkspaceFile };
type DeletingFolder = {
  path: string;
  name: string;
  revision: number;
  summary: FolderDeletionSummary;
};

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
    // Local storage can be unavailable; folder selection still works for this render.
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

export default function NotesPanel() {
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [deletingNote, setDeletingNote] = useState<WorkspaceFile | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<DeletingFolder | null>(null);
  const [documentActionError, setDocumentActionError] = useState<Error | null>(null);
  const [navigationError, setNavigationError] = useState<Error | null>(null);
  const [openingExternalFile, setOpeningExternalFile] = useState<WorkspaceFile | null>(null);
  const [documentActionPending, setDocumentActionPending] = useState(false);
  const documentSessionRef = useRef<NoteDocumentCommands | null>(null);
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
  } = useNotesWorkspace();

  const leaveActiveDocument = async (navigate: () => void) => {
    setNavigationError(null);
    try {
      await documentSessionRef.current?.flush();
      navigate();
    } catch (error) {
      setNavigationError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  useEffect(() => {
    if (!notesDir) return;
    setSelectedFolder(readSelectedFolder(notesDir) ?? '');
  }, [notesDir]);

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

  const displayedError = navigationError
    ? { message: `无法切换笔记：${navigationError.message}`, retryable: false }
    : openExternalFile.error && openingExternalFile
      ? {
          message: `无法打开“${openingExternalFile.name}”：${openExternalFile.error.message}`,
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

  if (!notesDir) {
    return (
      <Empty className="flex-1 text-muted-foreground">
        <EmptyMedia>
          <FileText className="size-10 opacity-40" />
        </EmptyMedia>
        <EmptyTitle>未设置笔记目录</EmptyTitle>
        <EmptyDescription className="flex items-center">
          请点击右上角齿轮
          <Settings className="size-4 mx-1" />
          打开设置
        </EmptyDescription>
      </Empty>
    );
  }

  const submitName = async (name: string) => {
    if (nameDialog?.mode === 'rename') {
      const note = nameDialog.note;
      const currentName = note.relative_path.split('/').pop();
      const currentExtension = currentName?.toLowerCase().endsWith('.markdown')
        ? '.markdown'
        : '.md';
      const withoutMarkdownExtension = name.replace(/\.(?:md|markdown)$/i, '');
      const fileName = `${withoutMarkdownExtension}${currentExtension}`;
      if (fileName === currentName) {
        setNameDialog(null);
        return;
      }
      const activeSession =
        selectedFilePath === note.relative_path ? documentSessionRef.current : null;
      let renamedPath: string;
      if (activeSession) {
        setDocumentActionPending(true);
        setDocumentActionError(null);
        try {
          renamedPath = await activeSession.rename(fileName);
        } catch (error) {
          setDocumentActionError(error instanceof Error ? error : new Error(String(error)));
          return;
        } finally {
          setDocumentActionPending(false);
        }
      } else {
        renamedPath = await renameNote.mutateAsync({
          relativePath: note.relative_path,
          name: fileName,
        });
      }
      setSelectedFilePath((current) => (current === note.relative_path ? renamedPath : current));
      setNameDialog(null);
      if (activeSession) void refreshNotes().catch(() => undefined);
      return;
    }

    const filePath = await createNote.mutateAsync({ directory: selectedFolder, name });
    setSelectedFilePath(filePath);
    setNameDialog(null);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {displayedError && (
        <Alert
          variant="destructive"
          className="shrink-0 rounded-none border-x-0 border-t-0 px-4 py-2"
        >
          <AlertDescription>{displayedError.message}</AlertDescription>
          {displayedError.retryable && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => void refreshNotes().catch(() => undefined)}
            >
              重试
            </Button>
          )}
        </Alert>
      )}

      <div className="flex-1 flex overflow-hidden">
        {root && (
          <NotesSidebar
            workspaceKey={notesDir}
            root={root}
            selectedFolder={selectedFolder}
            onSelectFolder={(path) => {
              void leaveActiveDocument(() => {
                setSelectedFolder(path);
                writeSelectedFolder(notesDir, path);
                setSelectedFilePath(null);
              });
            }}
            onDeleteFolder={(folder) => {
              if (workspaceRevision === null) return;
              const revision = workspaceRevision;
              deleteFolder.reset();
              preflightFolderDeletion.reset();
              preflightFolderDeletion.mutate(folder.path, {
                onSuccess: (summary) => {
                  setDeletingFolder({ ...folder, revision, summary });
                },
              });
            }}
          />
        )}
        <NotesList
          files={selectedDirectory?.files ?? []}
          loading={loading}
          selectedFilePath={selectedFilePath}
          onSelectMarkdown={(note) => {
            void leaveActiveDocument(() => {
              setSelectedFilePath(note.relative_path);
            });
          }}
          onOpenExternal={(file) => {
            openExternalFile.reset();
            setOpeningExternalFile(file);
            openExternalFile.mutate(file.relative_path);
          }}
          onCreateNote={() => {
            createNote.reset();
            setNameDialog({ mode: 'create' });
          }}
          onRenameNote={(note) => {
            renameNote.reset();
            setDocumentActionError(null);
            setNameDialog({ mode: 'rename', note });
          }}
          onDeleteNote={(note) => {
            deleteNote.reset();
            setDocumentActionError(null);
            setDeletingNote(note);
          }}
        />

        <div className="flex flex-1 flex-col overflow-hidden bg-background">
          {selectedFilePath ? (
            <NoteEditor
              key={`${workspaceRevision}:${selectedFilePath}`}
              revision={workspaceRevision!}
              filePath={selectedFilePath}
              onSessionChange={(session) => {
                documentSessionRef.current = session;
              }}
            />
          ) : (
            <Empty className="flex-1">
              <EmptyDescription>选择左侧笔记查看内容</EmptyDescription>
            </Empty>
          )}
        </div>
      </div>

      <NoteNameDialog
        open={nameDialog !== null}
        note={nameDialog?.mode === 'rename' ? nameDialog.note : null}
        pending={createNote.isPending || renameNote.isPending || documentActionPending}
        error={
          nameDialog?.mode === 'rename'
            ? (documentActionError ?? renameNote.error)
            : createNote.error
        }
        onOpenChange={(open) => !open && setNameDialog(null)}
        onSubmit={submitName}
      />

      <ConfirmDeleteDialog
        open={deletingNote !== null}
        title={`删除笔记“${deletingNote ? workspaceFileDisplayName(deletingNote.name) : ''}”？`}
        description="此操作不可撤销。"
        pending={deleteNote.isPending || documentActionPending}
        error={documentActionError ?? deleteNote.error}
        onOpenChange={(open) => !open && setDeletingNote(null)}
        onConfirm={() =>
          void (async () => {
            if (!deletingNote) return;
            const activeSession =
              selectedFilePath === deletingNote.relative_path ? documentSessionRef.current : null;
            if (activeSession) {
              setDocumentActionPending(true);
              setDocumentActionError(null);
              try {
                await activeSession.delete();
              } catch (error) {
                setDocumentActionError(error instanceof Error ? error : new Error(String(error)));
                return;
              } finally {
                setDocumentActionPending(false);
              }
            } else {
              await deleteNote.mutateAsync(deletingNote.relative_path);
            }
            setSelectedFilePath((current) =>
              current === deletingNote.relative_path ? null : current,
            );
            setDeletingNote(null);
            if (activeSession) void refreshNotes().catch(() => undefined);
          })().catch(() => undefined)
        }
      />

      <ConfirmDeleteDialog
        open={deletingFolder !== null}
        title={`删除文件夹“${deletingFolder?.name}”？`}
        description={
          deletingFolder && (
            <span className="space-y-2">
              <span className="block">
                将递归删除 {deletingFolder.summary.file_count} 个文件和{' '}
                {deletingFolder.summary.directory_count} 个子文件夹，此操作不可撤销。
              </span>
              {deletingFolder.summary.invisible_entry_count > 0 && (
                <span className="block font-medium text-destructive">
                  其中有 {deletingFolder.summary.invisible_entry_count}{' '}
                  个未在列表中展示的项目（隐藏项或符号链接），也会被删除。
                </span>
              )}
            </span>
          )
        }
        pending={deleteFolder.isPending}
        error={deleteFolder.error}
        onOpenChange={(open) => !open && setDeletingFolder(null)}
        onConfirm={() => {
          if (!deletingFolder) return;
          deleteFolder.mutate(deletingFolder.summary.receipt, {
            onSuccess: () => {
              const deletedPath = deletingFolder.path;
              const parentPath = deletedPath.split('/').slice(0, -1).join('/');
              setSelectedFolder((current) => {
                if (current !== deletedPath && !current.startsWith(`${deletedPath}/`))
                  return current;
                writeSelectedFolder(notesDir, parentPath);
                return parentPath;
              });
              setSelectedFilePath((current) =>
                current?.startsWith(`${deletedPath}/`) ? null : current,
              );
              setDeletingFolder(null);
            },
          });
        }}
      />
    </div>
  );
}
