import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { CreateTodo, Todo, TodoTag } from '@/types';
import { toast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Separator } from '@/components/ui/separator';
import { PageError, PageLoading } from '@/components/PageStatus';
import PageShell from '@/components/PageShell';
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
      <PageShell>
        <header className="flex items-end justify-between px-8 pt-6 pb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-[-0.025em]">
              {controller.selectedTag?.name ?? '所有任务'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">集中处理、筛选和归档你的任务。</p>
          </div>
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
        <div className="border-b border-border bg-card/50 px-8 py-3">
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
                  start_date: null,
                  due_date: null,
                });
                setQuickTitle('');
              } catch (error) {
                toast.add({ title: getErrorMessage(error, '创建任务失败'), type: 'error' });
              }
            }}
            placeholder="快速添加任务，按 Enter 提交…"
            className="h-9 border-border/70 bg-background/80 shadow-none"
          />
        </div>
        <Tabs
          value={controller.status}
          onValueChange={(value) => controller.setStatus(value as StatusFilter)}
          className="px-8 pt-3 pb-3"
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
            <PageLoading text="正在加载任务…" className="py-10" />
          ) : controller.todos.isError ? (
            <PageError title="任务加载失败" />
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
      </PageShell>
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
          } catch (error) {
            toast.add({ title: getErrorMessage(error, '重命名失败'), type: 'error' });
          }
        }}
        onCloseDelete={() => setDeletingTag(null)}
        onDelete={async () => {
          if (!deletingTag) return;
          try {
            await controller.deleteTagMutation.mutateAsync(deletingTag.id);
            setDeletingTag(null);
          } catch (error) {
            toast.add({ title: getErrorMessage(error, '删除失败'), type: 'error' });
          }
        }}
        onCloseArchive={controller.archiveDelete.closeArchive}
        onArchive={controller.archiveDelete.archive}
      />
    </div>
  );
}
