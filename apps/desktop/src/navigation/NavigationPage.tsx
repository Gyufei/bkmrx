import { useState } from 'react';
import { ArrowUpDown, BookOpen, Pencil, Plus } from 'lucide-react';
import type { NavigationCategory, NavigationSection } from '@/types';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import BookmarkPickerDialog from './BookmarkPickerDialog';
import NavigationCategoryDialog from './NavigationCategoryDialog';
import NavigationCategorySortDialog from './NavigationCategorySortDialog';
import NavigationSectionView from './NavigationSectionView';
import { useNavigationController } from './use-navigation-controller';

export default function NavigationPage() {
  const controller = useNavigationController();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [addingTo, setAddingTo] = useState<NavigationSection | null>(null);
  const [deleting, setDeleting] = useState<NavigationSection | null>(null);
  const [categoryEditor, setCategoryEditor] = useState<NavigationCategory | 'new' | null>(null);
  const [sorting, setSorting] = useState(false);
  const manageable = mode === 'edit';
  const editingCategory =
    categoryEditor === 'new' || categoryEditor === null ? null : categoryEditor;

  const leaveEditMode = () => {
    setMode('view');
    setAddingTo(null);
    setDeleting(null);
    setCategoryEditor(null);
    setSorting(false);
  };

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {manageable ? (
        <Button
          variant="outline"
          size="icon-sm"
          className="absolute right-4 bottom-14 z-10"
          aria-label="排序分类"
          title="排序分类"
          disabled={controller.sections.length < 2}
          onClick={() => setSorting(true)}
        >
          <ArrowUpDown aria-hidden="true" />
        </Button>
      ) : null}
      <Button
        variant="outline"
        size="icon-sm"
        className="absolute bottom-4 right-4 z-10"
        aria-label={manageable ? '查看' : '编辑'}
        title={manageable ? '查看' : '编辑'}
        onClick={() => (manageable ? leaveEditMode() : setMode('edit'))}
      >
        {manageable ? <BookOpen aria-hidden="true" /> : <Pencil aria-hidden="true" />}
      </Button>
      <NavigationSections
        controller={controller}
        manageable={manageable}
        onAdd={setAddingTo}
        onEdit={setCategoryEditor}
        onCreate={() => setCategoryEditor('new')}
        onDelete={setDeleting}
      />
      <NavigationCategoryDialog
        open={categoryEditor !== null}
        category={editingCategory}
        pending={controller.category.saving}
        onOpenChange={(open) => !open && setCategoryEditor(null)}
        onSubmit={async (name) => {
          if (categoryEditor === 'new') {
            const result = await controller.category.create(name);
            if (!result.ok) return;
          } else if (categoryEditor) {
            const result = await controller.category.rename(categoryEditor.id, name);
            if (!result.ok) return;
          }
          setCategoryEditor(null);
        }}
      />
      <NavigationCategorySortDialog
        open={sorting}
        categories={controller.sections.map((section) => section.category)}
        pending={controller.category.reordering}
        onOpenChange={setSorting}
        onSubmit={controller.category.reorder}
      />
      <BookmarkPickerDialog
        categoryId={addingTo?.category.id ?? null}
        categoryName={addingTo?.category.name ?? ''}
        assigned={addingTo?.cards ?? []}
        pending={controller.placement.adding}
        onOpenChange={(open) => !open && setAddingTo(null)}
        onAdd={async (bookmarkIds) => {
          if (!addingTo) return;
          const result = await controller.placement.add(addingTo.category.id, bookmarkIds);
          if (result.ok) setAddingTo(null);
        }}
      />
      <ConfirmDeleteDialog
        open={deleting !== null}
        title="删除导航分类？"
        description={
          deleting
            ? `将删除“${deleting.category.name}”及其中 ${deleting.cards.length} 个导航关联，不会删除书签。`
            : ''
        }
        pending={controller.category.deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          const result = await controller.category.remove(deleting.category.id);
          if (result.ok) setDeleting(null);
        }}
      />
    </main>
  );
}

type Controller = ReturnType<typeof useNavigationController>;

function NavigationSections({
  controller,
  manageable,
  onAdd,
  onEdit,
  onCreate,
  onDelete,
}: {
  controller: Controller;
  manageable: boolean;
  onAdd(section: NavigationSection): void;
  onEdit(category: NavigationCategory): void;
  onCreate(): void;
  onDelete(section: NavigationSection): void;
}) {
  if (controller.loadState === 'loading')
    return (
      <div
        role="status"
        className="flex flex-1 items-center justify-center gap-2 text-muted-foreground"
      >
        <Spinner />
        <span>正在加载导航分类…</span>
      </div>
    );
  if (controller.loadState === 'error')
    return (
      <div className="flex flex-1 items-center justify-center p-5">
        <Alert variant="destructive" className="max-w-md text-center">
          <AlertTitle>加载导航分类失败</AlertTitle>
        </Alert>
      </div>
    );
  const sections = controller.sections;
  if (sections.length === 0 && !manageable)
    return (
      <Empty className="flex-1 p-5">
        <EmptyTitle>还没有导航分类</EmptyTitle>
        <EmptyDescription>创建一个分类，开始整理常用书签。</EmptyDescription>
        <Button size="sm" onClick={onCreate}>
          <Plus data-icon="inline-start" />
          创建
        </Button>
      </Empty>
    );
  return (
    <div className="flex-1 overflow-y-auto p-5 pr-14">
      <div className="flex flex-wrap content-start items-start gap-4">
        {sections.map((section) => (
          <NavigationSectionView
            key={section.category.id}
            section={section}
            manageable={manageable}
            removing={
              controller.placement.removing?.categoryId === section.category.id
                ? controller.placement.removing.card
                : undefined
            }
            onEdit={onEdit}
            onAdd={() => onAdd(section)}
            onDelete={() => onDelete(section)}
            onOpen={(card) => void controller.placement.open(card)}
            onRemove={(category, card) =>
              void controller.placement.remove({ categoryId: category.id, card })
            }
          />
        ))}
        {manageable ? <AddCategoryCard onClick={onCreate} /> : null}
      </div>
    </div>
  );
}

function AddCategoryCard({ onClick }: { onClick(): void }) {
  return (
    <button
      type="button"
      aria-label="新建分类"
      onClick={onClick}
      className="flex h-20.5 w-12 items-center justify-center rounded-lg border text-muted-foreground transition-transform hover:-translate-px hover:border-ring hover:text-foreground"
    >
      <Plus aria-hidden="true" />
    </button>
  );
}
