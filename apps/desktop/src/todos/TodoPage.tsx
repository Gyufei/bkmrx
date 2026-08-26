import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { CreateTodo, Todo, TodoTag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import TodoDialog from './TodoDialog';
import TodoListItem from './TodoListItem';
import TodoSidebar from './TodoSidebar';
import TodoTagDialogs from './TodoTagDialogs';
import { STATUS_TABS, useTodoController, type StatusFilter } from './use-todo-controller';

export default function TodoPage() {
  const controller = useTodoController();
  const [quickTitle, setQuickTitle] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [renaming, setRenaming] = useState<TodoTag | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deletingTag, setDeletingTag] = useState<TodoTag | null>(null);
  const saveDialog = async (input: CreateTodo) => {
    await controller.saveTodo(editing, input);
  };

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <TodoSidebar
        tags={controller.tags.data ?? []}
        total={controller.overview.data?.total ?? 0}
        selectedTagId={controller.tagId}
        onSelectTag={controller.setTagId}
        onExportTag={controller.exportTag}
        onRenameTag={(tag) => {
          setRenaming(tag);
          setRenameValue(tag.name);
        }}
        onDeleteTag={(tag) => {
          controller.deleteTagMutation.reset();
          setDeletingTag(tag);
        }}
        onArchiveDeleteTag={controller.archiveDelete.prepareArchive}
      />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <header className="flex items-center justify-between px-8 py-5">
          <h1 className="text-2xl font-semibold">{controller.selectedTag?.name ?? '所有任务'}</h1>
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus data-icon="inline-start" />
            新建任务
          </Button>
        </header>
        <div className="px-8 pb-4">
          <Input
            value={quickTitle}
            disabled={controller.createMutation.isPending}
            onChange={(event) => setQuickTitle(event.target.value)}
            onKeyDown={async (event) => {
              if (
                event.key !== 'Enter' ||
                !quickTitle.trim() ||
                controller.createMutation.isPending
              )
                return;
              try {
                await controller.createMutation.mutateAsync({
                  title: quickTitle,
                  description: '',
                  tags: controller.selectedTag ? [controller.selectedTag.name] : [],
                  is_high_priority: false,
                });
                setQuickTitle('');
              } catch {
                /* toast handled by mutation */
              }
            }}
            placeholder="快速添加任务，按 Enter 提交…"
            className="h-12 bg-muted/60"
          />
        </div>
        <Tabs
          value={controller.status}
          onValueChange={(value) => controller.setStatus(value as StatusFilter)}
          className="px-8 pb-3"
        >
          <TabsList variant="line">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Separator />
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-4">
          {controller.todos.isLoading ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2 py-10 text-muted-foreground"
            >
              <Spinner />
              正在加载任务…
            </div>
          ) : controller.todos.isError ? (
            <Alert variant="destructive" className="mx-auto max-w-md text-center">
              <AlertTitle>任务加载失败</AlertTitle>
            </Alert>
          ) : controller.todos.data?.items.length === 0 ? (
            <Empty className="py-10">
              <EmptyDescription>{controller.emptyText}</EmptyDescription>
            </Empty>
          ) : (
            <div className="flex flex-col gap-1">
              {controller.todos.data?.items.map((todo) => (
                <TodoListItem
                  key={todo.id}
                  todo={todo}
                  tags={controller.tags.data ?? []}
                  statusPending={controller.statusMutation.isPending}
                  deletePending={controller.deleteMutation.isPending}
                  deleteError={controller.deleteMutation.error}
                  onEdit={(item) => {
                    setEditing(item);
                    setDialogOpen(true);
                  }}
                  onSelectTag={controller.setTagId}
                  onSetStatus={(id, next) => controller.statusMutation.mutate({ id, next })}
                  onPrepareDelete={() => controller.deleteMutation.reset()}
                  onDelete={(id) => controller.deleteMutation.mutateAsync(id)}
                />
              ))}
            </div>
          )}
        </div>
        <Separator />
        <footer className="mt-auto shrink-0 bg-background px-8 py-2 text-sm text-muted-foreground">
          {controller.todos.data?.total ?? 0} 个任务 · {controller.todos.data?.completed ?? 0}{' '}
          个已完成
        </footer>
      </main>
      <TodoDialog
        open={dialogOpen}
        todo={editing}
        availableTags={controller.tags.data ?? []}
        defaultTag={controller.selectedTag?.name}
        onOpenChange={setDialogOpen}
        onSave={saveDialog}
      />
      <TodoTagDialogs
        renaming={renaming}
        renameValue={renameValue}
        renamePending={controller.renameMutation.isPending}
        deleting={deletingTag}
        deletePending={controller.deleteTagMutation.isPending}
        deleteError={controller.deleteTagMutation.error}
        archiving={controller.archiveDelete.archivingTag}
        archivePending={controller.archiveDelete.archivePending}
        archiveError={controller.archiveDelete.archiveError}
        onRenameValueChange={setRenameValue}
        onCloseRename={() => setRenaming(null)}
        onRename={async () => {
          if (!renaming) return;
          try {
            await controller.renameMutation.mutateAsync({ id: renaming.id, name: renameValue });
            setRenaming(null);
          } catch {
            /* toast handled */
          }
        }}
        onCloseDelete={() => setDeletingTag(null)}
        onDelete={async () => {
          if (!deletingTag) return;
          try {
            await controller.deleteTagMutation.mutateAsync(deletingTag.id);
            setDeletingTag(null);
          } catch {
            /* toast handled */
          }
        }}
        onCloseArchive={controller.archiveDelete.closeArchive}
        onArchive={controller.archiveDelete.archive}
      />
    </div>
  );
}
