import type { NavigationCategoryId } from '@/identity';
import type { Bookmark } from '@/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { listNavigationSectionsApi } from '@/navigation/navigation.api';
import { useAddBookmarkToNavigation } from './use-add-bookmark-to-navigation';

interface Props {
  bookmark: Bookmark | null;
  onOpenChange(open: boolean): void;
}

export default function AddBookmarkToNavigationDialog({ bookmark, onOpenChange }: Props) {
  const controller = useAddBookmarkToNavigation(bookmark, () => onOpenChange(false));

  return (
    <Dialog open={bookmark !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加到导航分类</DialogTitle>
          <DialogDescription>
            选择一个分类，将“{bookmark?.title || bookmark?.url}”添加到导航页。
          </DialogDescription>
        </DialogHeader>
        <CategoryChoices
          loading={controller.sections.isLoading}
          failed={controller.sections.isError}
          sections={controller.sections.data ?? []}
          selectedId={controller.selectedId}
          onSelect={controller.select}
        />
        {controller.error && (
          <Alert variant="destructive">
            <AlertDescription>{controller.error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={controller.pending}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            disabled={controller.selectedId === null || controller.pending}
            onClick={() => void controller.submit()}
          >
            {controller.pending && <Spinner data-icon="inline-start" />}确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Sections = Awaited<ReturnType<typeof listNavigationSectionsApi>>;

function CategoryChoices({
  loading,
  failed,
  sections,
  selectedId,
  onSelect,
}: {
  loading: boolean;
  failed: boolean;
  sections: Sections;
  selectedId: NavigationCategoryId | null;
  onSelect(id: NavigationCategoryId): void;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">正在加载导航分类…</p>;
  if (failed)
    return (
      <Alert variant="destructive">
        <AlertDescription>加载导航分类失败</AlertDescription>
      </Alert>
    );
  if (sections.length === 0)
    return <p className="text-sm text-muted-foreground">还没有导航分类，请先在导航页创建分类。</p>;
  return (
    <FieldGroup role="radiogroup" aria-label="导航分类" className="max-h-72 overflow-y-auto">
      {sections.map((section) => (
        <Field key={section.category.id} className="flex-row items-center rounded-xl border p-3">
          <input
            id={`navigation-category-${section.category.id}`}
            type="radio"
            name="navigation-category"
            value={section.category.id}
            checked={selectedId === section.category.id}
            onChange={() => onSelect(section.category.id)}
            className="size-4 accent-primary"
          />
          <FieldLabel
            htmlFor={`navigation-category-${section.category.id}`}
            className="min-w-0 flex-1 cursor-pointer truncate"
          >
            {section.category.name}
          </FieldLabel>
        </Field>
      ))}
    </FieldGroup>
  );
}
