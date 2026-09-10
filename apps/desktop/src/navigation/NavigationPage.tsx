import { useState } from 'react';
import type { NavigationSection } from '@/types';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import BookmarkPickerDialog from './BookmarkPickerDialog';
import NavigationCategoryComposer from './NavigationCategoryComposer';
import NavigationSectionView from './NavigationSectionView';
import { useNavigationController } from './use-navigation-controller';

export default function NavigationPage() {
  const controller = useNavigationController();
  const [addingTo, setAddingTo] = useState<NavigationSection | null>(null);
  const [deleting, setDeleting] = useState<NavigationSection | null>(null);
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <NavigationCategoryComposer
        pending={controller.create.isPending}
        onCreate={(name) => controller.create.mutateAsync(name)}
      />
      <NavigationSections controller={controller} onAdd={setAddingTo} onDelete={setDeleting} />
      <BookmarkPickerDialog
        categoryId={addingTo?.category.id ?? null}
        categoryName={addingTo?.category.name ?? ''}
        assigned={addingTo?.cards ?? []}
        pending={controller.addCards.isPending}
        onOpenChange={(open) => !open && setAddingTo(null)}
        onAdd={async (bookmarkIds) => {
          if (!addingTo) return;
          try {
            await controller.addCards.mutateAsync({
              categoryId: addingTo.category.id,
              bookmarkIds,
            });
            setAddingTo(null);
          } catch {
            // The controller reports the error and the picker remains open for retry.
          }
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
        pending={controller.removeCategory.isPending}
        error={controller.removeCategory.error}
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await controller.removeCategory.mutateAsync(deleting.category.id);
            setDeleting(null);
          } catch {
            // The controller reports the error and the confirmation remains open for retry.
          }
        }}
      />
    </main>
  );
}

type Controller = ReturnType<typeof useNavigationController>;

function NavigationSections({
  controller,
  onAdd,
  onDelete,
}: {
  controller: Controller;
  onAdd(section: NavigationSection): void;
  onDelete(section: NavigationSection): void;
}) {
  if (controller.sections.isLoading)
    return (
      <div className="flex-1 p-5">
        <p>正在加载导航分类…</p>
      </div>
    );
  if (controller.sections.isError)
    return (
      <div className="flex-1 p-5">
        <p role="alert">加载导航分类失败</p>
      </div>
    );
  if (controller.sections.data?.length === 0)
    return (
      <div className="flex-1 p-5">
        <p className="text-muted-foreground">还没有导航分类，先创建一个常用分类吧。</p>
      </div>
    );
  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="space-y-6">
        {controller.sections.data?.map((section) => (
          <NavigationSectionView
            key={section.category.id}
            section={section}
            renaming={
              controller.rename.isPending && controller.rename.variables?.id === section.category.id
            }
            removing={
              controller.removeCard.isPending &&
              controller.removeCard.variables?.categoryId === section.category.id
                ? controller.removeCard.variables.card
                : undefined
            }
            onRename={(category, name) => controller.rename.mutateAsync({ id: category.id, name })}
            onAdd={() => onAdd(section)}
            onDelete={() => onDelete(section)}
            onOpen={(card) => void controller.open(card)}
            onRemove={(category, card) =>
              controller.removeCard.mutate({ categoryId: category.id, card })
            }
          />
        ))}
      </div>
    </div>
  );
}
