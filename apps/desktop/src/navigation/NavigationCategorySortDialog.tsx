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
import type { NavigationCommandResult } from './use-navigation-controller';

interface DragState {
  id: NavigationCategoryId;
  name: string;
  position: number;
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
  onSubmit(categoryIds: NavigationCategoryId[]): Promise<NavigationCommandResult>;
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
    const result = await onSubmit(ordered.map((category) => category.id));
    if (result.ok) onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[26rem] max-w-[92vw] border-l border-border/80 bg-background">
        <SheetHeader className="flex-col items-start gap-1.5 border-b border-border/70 px-6 py-5">
          <SheetTitle className="text-lg font-semibold tracking-tight">分类排序</SheetTitle>
          <SheetDescription className="leading-5">
            拖动分类调整顺序，导航页将按此顺序展示。
          </SheetDescription>
        </SheetHeader>
        <div
          role="list"
          aria-label="导航分类排序"
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
        >
          {ordered.map((category, index) => (
            <div
              key={category.id}
              role="listitem"
              aria-label={category.name}
              aria-grabbed={dragging?.id === category.id}
              data-dragging={dragging?.id === category.id}
              aria-disabled={pending}
              onPointerDown={(event) =>
                startDragging(event, category, index, pending, setDragging)
              }
              onPointerEnter={() => moveOver(category.id)}
              className="group flex min-h-12 touch-none cursor-grab select-none items-center gap-3 rounded-md border border-border/70 bg-card px-3 py-2 shadow-xs transition-[border-color,background-color,box-shadow,opacity,transform] hover:border-foreground/20 hover:bg-accent/55 hover:shadow-sm active:cursor-grabbing aria-disabled:pointer-events-none aria-disabled:opacity-60 data-[dragging=true]:scale-[0.985] data-[dragging=true]:border-dashed data-[dragging=true]:opacity-30 data-[dragging=true]:shadow-none"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-muted font-mono text-[11px] font-medium tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</span>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors group-hover:bg-background/80 group-hover:text-foreground">
                <GripVertical aria-hidden="true" className="size-4" />
              </span>
            </div>
          ))}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-border/70 bg-muted/25 px-5 py-4">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {changed ? '顺序已调整，保存后生效' : '拖动任意分类开始排序'}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button disabled={!changed || pending} onClick={() => void submit()}>
              {pending && <Spinner data-icon="inline-start" />}
              保存排序
            </Button>
          </div>
        </div>
      </SheetContent>
      {dragging ? <DragPreview dragging={dragging} /> : null}
    </Sheet>
  );
}

function startDragging(
  event: PointerEvent<HTMLDivElement>,
  category: NavigationCategory,
  position: number,
  pending: boolean,
  setDragging: (state: DragState) => void,
) {
  if (pending || event.button > 0) return;
  event.preventDefault();
  const bounds = event.currentTarget.getBoundingClientRect();
  setDragging({
    id: category.id,
    name: category.name,
    position,
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
      className="pointer-events-none fixed z-[60] flex min-h-12 items-center gap-3 rounded-md border border-primary/25 bg-card px-3 py-2 opacity-95 shadow-xl ring-1 ring-black/5"
      style={{
        left: dragging.x - dragging.offsetX,
        top: dragging.y - dragging.offsetY,
        width: dragging.width,
      }}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary/10 font-mono text-[11px] font-medium tabular-nums text-primary">
        {String(dragging.position + 1).padStart(2, '0')}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{dragging.name}</span>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted text-foreground">
        <GripVertical className="size-4" />
      </span>
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
