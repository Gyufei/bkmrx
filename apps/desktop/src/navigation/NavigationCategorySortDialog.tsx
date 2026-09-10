import { useEffect, useMemo, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical } from 'lucide-react';
import type { NavigationCategoryId } from '@/identity';
import type { NavigationCategory } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';

interface DragState {
  id: NavigationCategoryId;
  name: string;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
}

interface Props {
  open: boolean;
  categories: NavigationCategory[];
  pending: boolean;
  onOpenChange(open: boolean): void;
  onSubmit(categoryIds: NavigationCategoryId[]): Promise<unknown>;
}

export default function NavigationCategorySortDialog({
  open,
  categories,
  pending,
  onOpenChange,
  onSubmit,
}: Props) {
  const [ordered, setOrdered] = useState(categories);
  const [dragging, setDragging] = useState<DragState | null>(null);
  const draggingActive = dragging !== null;

  useEffect(() => {
    if (!open) return;
    setOrdered(categories);
    setDragging(null);
  }, [categories, open]);

  useEffect(() => {
    if (!draggingActive) return;
    const movePreview = (event: globalThis.PointerEvent) =>
      setDragging((current) =>
        current ? { ...current, x: event.clientX, y: event.clientY } : null,
      );
    const stopDragging = () => setDragging(null);
    window.addEventListener('pointermove', movePreview);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointermove', movePreview);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, [draggingActive]);

  const changed = useMemo(
    () => ordered.some((category, index) => category.id !== categories[index]?.id),
    [categories, ordered],
  );

  const moveOver = (targetId: NavigationCategoryId) => {
    if (!dragging) return;
    setOrdered((current) => moveCategory(current, dragging.id, targetId));
  };

  const submit = async () => {
    if (!changed || pending) return;
    try {
      await onSubmit(ordered.map((category) => category.id));
      onOpenChange(false);
    } catch {
      // The controller reports mutation errors and the dialog remains open for retry.
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-96 max-w-[90vw]">
        <SheetHeader className="flex-col items-start gap-1 border-b px-5 py-4">
          <SheetTitle>分类排序</SheetTitle>
          <SheetDescription>拖拽分类行调整导航页中的展示顺序。</SheetDescription>
        </SheetHeader>
        <div
          role="list"
          aria-label="导航分类排序"
          className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto bg-border py-px"
        >
          {ordered.map((category) => (
            <div
              key={category.id}
              role="listitem"
              aria-label={category.name}
              aria-grabbed={dragging?.id === category.id}
              data-dragging={dragging?.id === category.id}
              onPointerDown={(event) => startDragging(event, category, pending, setDragging)}
              onPointerEnter={() => moveOver(category.id)}
              className="flex touch-none cursor-grab select-none items-center gap-3 bg-muted px-5 py-3 active:cursor-grabbing data-[dragging=true]:opacity-35"
            >
              <GripVertical aria-hidden="true" className="text-muted-foreground" />
              <span className="min-w-0 truncate">{category.name}</span>
            </div>
          ))}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-4">
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={!changed || pending} onClick={() => void submit()}>
            {pending && <Spinner data-icon="inline-start" />}
            保存排序
          </Button>
        </div>
      </SheetContent>
      {dragging ? <DragPreview dragging={dragging} /> : null}
    </Sheet>
  );
}

function startDragging(
  event: PointerEvent<HTMLDivElement>,
  category: NavigationCategory,
  pending: boolean,
  setDragging: (state: DragState) => void,
) {
  if (pending || event.button > 0) return;
  event.preventDefault();
  const bounds = event.currentTarget.getBoundingClientRect();
  setDragging({
    id: category.id,
    name: category.name,
    x: event.clientX,
    y: event.clientY,
    offsetX: event.clientX - bounds.left,
    offsetY: event.clientY - bounds.top,
    width: bounds.width,
  });
}

function DragPreview({ dragging }: { dragging: DragState }) {
  return createPortal(
    <div
      data-testid="navigation-category-drag-preview"
      aria-hidden="true"
      className="pointer-events-none fixed z-[60] flex items-center gap-3 bg-muted px-5 py-3 opacity-90 shadow-lg"
      style={{
        left: dragging.x - dragging.offsetX,
        top: dragging.y - dragging.offsetY,
        width: dragging.width,
      }}
    >
      <GripVertical className="text-muted-foreground" />
      <span className="min-w-0 truncate">{dragging.name}</span>
    </div>,
    document.body,
  );
}

export function moveCategory(
  categories: NavigationCategory[],
  sourceId: NavigationCategoryId,
  targetId: NavigationCategoryId,
) {
  const sourceIndex = categories.findIndex((category) => category.id === sourceId);
  const targetIndex = categories.findIndex((category) => category.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return categories;
  const next = [...categories];
  const [source] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, source);
  return next;
}
