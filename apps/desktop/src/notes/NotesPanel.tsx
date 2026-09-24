import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { FileText, Settings } from 'lucide-react';
import NoteEditor from './NoteEditor';
import HtmlDocumentViewer from './HtmlDocumentViewer';
import NoteNameDialog from './NoteNameDialog';
import NotesList from './NotesList';
import NotesSidebar from './NotesSidebar';
import { useNotesWorkspaceScreen } from './use-notes-workspace-screen';
import { workspaceFileDisplayName } from './workspace-file';

export default function NotesPanel() {
  const { view, send } = useNotesWorkspaceScreen();

  if (!view.notesDir) {
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {view.problem && (
        <Alert
          variant="destructive"
          className="shrink-0 rounded-none border-x-0 border-t-0 px-4 py-2"
        >
          <AlertDescription>{view.problem.message}</AlertDescription>
          {view.problem.retryable && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => void send({ type: 'retry.requested' })}
            >
              重试
            </Button>
          )}
        </Alert>
      )}

      <div className="flex-1 flex overflow-hidden">
        {view.root && (
          <NotesSidebar
            workspaceKey={view.notesDir}
            root={view.root}
            selectedFolder={view.selectedFolder}
            onSelectFolder={(path) => void send({ type: 'folder.selected', path })}
            onDeleteFolder={(folder) => void send({ type: 'folder.delete-requested', folder })}
          />
        )}
        <NotesList
          files={view.entries}
          loading={view.loading}
          selectedFilePath={view.selectedEntry?.relative_path ?? null}
          onSelectDocument={(entry) => void send({ type: 'entry.activated', entry })}
          onOpenExternal={(entry) => void send({ type: 'entry.open-external-requested', entry })}
          onCreateNote={() => void send({ type: 'entry.create-requested' })}
          onRenameNote={(entry) => void send({ type: 'entry.rename-requested', entry })}
          onDeleteNote={(entry) => void send({ type: 'entry.delete-requested', entry })}
        />

        <div className="flex flex-1 flex-col overflow-hidden bg-background">
          {view.selectedEntry?.kind === 'markdown' ? (
            <NoteEditor
              key={`${view.workspaceRevision}:${view.selectedEntry.relative_path}`}
              revision={view.workspaceRevision!}
              filePath={view.selectedEntry.relative_path}
              onSessionChange={(session) =>
                void send({ type: 'document-session.changed', session })
              }
            />
          ) : view.selectedEntry?.kind === 'html' ? (
            <HtmlDocumentViewer
              key={`${view.workspaceRevision}:${view.selectedEntry.relative_path}`}
              revision={view.workspaceRevision!}
              filePath={view.selectedEntry.relative_path}
            />
          ) : (
            <Empty className="flex-1">
              <EmptyDescription>选择左侧笔记查看内容</EmptyDescription>
            </Empty>
          )}
        </div>
      </div>

      <NoteNameDialog
        open={view.nameDialog !== null}
        note={view.nameDialog?.mode === 'rename' ? view.nameDialog.entry : null}
        pending={view.nameDialogPending}
        error={view.nameDialogError}
        onOpenChange={(open) => !open && void send({ type: 'dialog.dismissed', dialog: 'name' })}
        onSubmit={(name) => send({ type: 'name.submitted', name })}
      />

      <ConfirmDeleteDialog
        open={view.deletingEntry !== null}
        title={`删除笔记“${view.deletingEntry ? workspaceFileDisplayName(view.deletingEntry.name) : ''}”？`}
        description="此操作不可撤销。"
        pending={view.entryDeletionPending}
        error={view.entryDeletionError}
        onOpenChange={(open) =>
          !open && void send({ type: 'dialog.dismissed', dialog: 'entry-deletion' })
        }
        onConfirm={() => send({ type: 'entry.deletion-confirmed' })}
      />

      <ConfirmDeleteDialog
        open={view.deletingFolder !== null}
        title={`删除文件夹“${view.deletingFolder?.name}”？`}
        description={
          view.deletingFolder && (
            <span className="space-y-2">
              <span className="block">
                将递归删除 {view.deletingFolder.summary.file_count} 个文件和{' '}
                {view.deletingFolder.summary.directory_count} 个子文件夹，此操作不可撤销。
              </span>
              {view.deletingFolder.summary.invisible_entry_count > 0 && (
                <span className="block font-medium text-destructive">
                  其中有 {view.deletingFolder.summary.invisible_entry_count}{' '}
                  个未在列表中展示的项目（隐藏项或符号链接），也会被删除。
                </span>
              )}
            </span>
          )
        }
        pending={view.folderDeletionPending}
        error={view.folderDeletionError}
        onOpenChange={(open) =>
          !open && void send({ type: 'dialog.dismissed', dialog: 'folder-deletion' })
        }
        onConfirm={() => send({ type: 'folder.deletion-confirmed' })}
      />
    </div>
  );
}
