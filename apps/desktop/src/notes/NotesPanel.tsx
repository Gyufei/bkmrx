import { useState } from 'react';

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

type NameDialogState = { mode: 'create' } | { mode: 'rename'; note: NoteFile };

export default function NotesPanel() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [deletingNote, setDeletingNote] = useState<NoteFile | null>(null);
  const { notesDir, notes, loading, error, createNote, deleteNote, renameNote } =
    useNotesWorkspace();

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

  const submitName = (name: string) => {
    if (nameDialog?.mode === 'rename') {
      const note = nameDialog.note;
      const separatorIndex = Math.max(note.path.lastIndexOf('/'), note.path.lastIndexOf('\\'));
      const fileName = name.endsWith('.md') ? name : `${name}.md`;
      const newPath = `${note.path.slice(0, separatorIndex + 1)}${fileName}`;
      if (newPath === note.path) {
        setNameDialog(null);
        return;
      }
      renameNote.mutate(
        { oldPath: note.path, newPath },
        {
          onSuccess: (_, { oldPath }) => {
            setSelectedFilePath((current) => (current === oldPath ? newPath : current));
            setNameDialog(null);
          },
        },
      );
      return;
    }

    const targetDir = selectedFolder ? `${notesDir}/${selectedFolder}` : notesDir;
    createNote.mutate(
      { dir: targetDir, name },
      {
        onSuccess: (filePath) => {
          setSelectedFilePath(filePath);
          setNameDialog(null);
        },
      },
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {error && (
        <Alert
          variant="destructive"
          className="shrink-0 rounded-none border-x-0 border-t-0 px-4 py-2"
        >
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex-1 flex overflow-hidden">
        <NotesSidebar
          notes={notes}
          selectedFolder={selectedFolder}
          onSelectFolder={(path) => {
            setSelectedFolder(path);
            setSelectedFilePath(null);
          }}
        />
        <NotesList
          notes={notes}
          loading={loading}
          selectedFolder={selectedFolder}
          selectedFilePath={selectedFilePath}
          onSelectNote={(note) => setSelectedFilePath(note.path)}
          onCreateNote={() => {
            createNote.reset();
            setNameDialog({ mode: 'create' });
          }}
          onRenameNote={(note) => {
            renameNote.reset();
            setNameDialog({ mode: 'rename', note });
          }}
          onDeleteNote={(note) => {
            deleteNote.reset();
            setDeletingNote(note);
          }}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedFilePath ? (
            <NoteEditor filePath={selectedFilePath} />
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
        pending={createNote.isPending || renameNote.isPending}
        error={nameDialog?.mode === 'rename' ? renameNote.error : createNote.error}
        onOpenChange={(open) => !open && setNameDialog(null)}
        onSubmit={submitName}
      />

      <ConfirmDeleteDialog
        open={deletingNote !== null}
        title={`删除笔记“${deletingNote?.title}”？`}
        description="此操作不可撤销。"
        pending={deleteNote.isPending}
        error={deleteNote.error}
        onOpenChange={(open) => !open && setDeletingNote(null)}
        onConfirm={() => {
          if (!deletingNote) return;
          deleteNote.mutate(deletingNote.path, {
            onSuccess: (_, deletedPath) => {
              setSelectedFilePath((current) => (current === deletedPath ? null : current));
              setDeletingNote(null);
            },
          });
        }}
      />
    </div>
  );
}
