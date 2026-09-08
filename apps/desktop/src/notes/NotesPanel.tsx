import { useEffect, useRef, useState } from 'react';

import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { FileText } from 'lucide-react';
import type { NoteFile } from '../types';
import NoteEditor from './NoteEditor';
import NoteNameDialog from './NoteNameDialog';
import NotesList from './NotesList';
import NotesSidebar from './NotesSidebar';
import { useNotesWorkspace } from './use-notes-workspace';
import type { NoteDocumentCommands } from './use-note-document';

type NameDialogState = { mode: 'create' } | { mode: 'rename'; note: NoteFile };
type DeletingFolder = { path: string; name: string };

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

export default function NotesPanel() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [deletingNote, setDeletingNote] = useState<NoteFile | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<DeletingFolder | null>(null);
  const [documentActionError, setDocumentActionError] = useState<Error | null>(null);
  const [navigationError, setNavigationError] = useState<Error | null>(null);
  const [documentActionPending, setDocumentActionPending] = useState(false);
  const documentSessionRef = useRef<NoteDocumentCommands | null>(null);
  const {
    notesDir,
    workspaceRevision,
    notes,
    loading,
    error,
    createNote,
    deleteNote,
    deleteFolder,
    renameNote,
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
    setSelectedFolder(readSelectedFolder(notesDir));
  }, [notesDir]);

  useEffect(() => {
    if (!notesDir || loading || !selectedFolder) return;
    const folderExists = notes.some((note) => note.relative_path.startsWith(`${selectedFolder}/`));
    if (folderExists) return;
    setSelectedFolder(null);
    writeSelectedFolder(notesDir, null);
  }, [loading, notes, notesDir, selectedFolder]);

  if (!notesDir) {
    return (
      <Empty className="flex-1 text-muted-foreground">
        <EmptyMedia>
          <FileText className="size-10 opacity-40" />
        </EmptyMedia>
        <EmptyTitle>未设置笔记目录</EmptyTitle>
        <EmptyDescription>请点击右上角齿轮⚙打开设置</EmptyDescription>
      </Empty>
    );
  }

  const submitName = async (name: string) => {
    if (nameDialog?.mode === 'rename') {
      const note = nameDialog.note;
      const fileName = name.endsWith('.md') ? name : `${name}.md`;
      const currentName = note.relative_path.split('/').pop();
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

    const filePath = await createNote.mutateAsync({ directory: selectedFolder ?? '', name });
    setSelectedFilePath(filePath);
    setNameDialog(null);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {(error || navigationError) && (
        <Alert
          variant="destructive"
          className="shrink-0 rounded-none border-x-0 border-t-0 px-4 py-2"
        >
          <AlertDescription>
            {navigationError ? `无法切换笔记：${navigationError.message}` : error!.message}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex-1 flex overflow-hidden">
        <NotesSidebar
          notes={notes}
          selectedFolder={selectedFolder}
          onSelectFolder={(path) => {
            void leaveActiveDocument(() => {
              setSelectedFolder(path);
              writeSelectedFolder(notesDir, path);
              setSelectedFilePath(null);
            });
          }}
          onDeleteFolder={(folder) => {
            deleteFolder.reset();
            setDeletingFolder(folder);
          }}
        />
        <NotesList
          notes={notes}
          loading={loading}
          selectedFolder={selectedFolder}
          selectedFilePath={selectedFilePath}
          onSelectNote={(note) => {
            void leaveActiveDocument(() => {
              setSelectedFilePath(note.relative_path);
            });
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
        title={`删除笔记“${deletingNote?.title}”？`}
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
        description="文件夹及其中所有内容将被删除，此操作不可撤销。"
        pending={deleteFolder.isPending}
        error={deleteFolder.error}
        onOpenChange={(open) => !open && setDeletingFolder(null)}
        onConfirm={() => {
          if (!deletingFolder) return;
          deleteFolder.mutate(deletingFolder.path, {
            onSuccess: () => {
              setSelectedFolder(null);
              writeSelectedFolder(notesDir, null);
              setSelectedFilePath(null);
              setDeletingFolder(null);
            },
          });
        }}
      />
    </div>
  );
}
