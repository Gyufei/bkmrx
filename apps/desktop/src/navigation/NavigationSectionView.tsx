import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { NavigationCategory, NavigationPlacementCard, NavigationSection } from '@/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import NavigationPlacementCardView from './NavigationPlacementCard';

interface Props {
  section: NavigationSection;
  manageable: boolean;
  removing?: NavigationPlacementCard;
  onEdit(category: NavigationCategory): void;
  onAdd(): void;
  onDelete(section: NavigationSection): void;
  onOpen(card: NavigationPlacementCard): void;
  onRemove(category: NavigationCategory, card: NavigationPlacementCard): void;
}

export default function NavigationSectionView({
  section,
  manageable,
  removing,
  onEdit,
  onAdd,
  onDelete,
  onOpen,
  onRemove,
}: Props) {
  return (
    <section
      className={cn(
        'min-w-0 overflow-hidden rounded-lg border bg-card',
        manageable && 'border-primary/25 bg-primary/[0.025]',
      )}
    >
      <header className="flex h-10 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-sm font-semibold">{section.category.name}</h2>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {section.cards.length}
          </span>
        </div>
        {manageable ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="添加书签"
              onClick={onAdd}
            >
              <Plus />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`重命名 ${section.category.name}`}
              onClick={() => onEdit(section.category)}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`删除 ${section.category.name}`}
              onClick={() => onDelete(section)}
            >
              <Trash2 />
            </Button>
          </div>
        ) : null}
      </header>
      {section.cards.length === 0 ? (
        manageable ? (
          <button
            type="button"
            className="flex h-14 w-full items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={onAdd}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            添加第一个书签
          </button>
        ) : (
          <p className="flex h-14 items-center justify-center text-xs text-muted-foreground">
            暂无书签
          </p>
        )
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-0.5 p-2">
          {section.cards.map((card) => (
            <NavigationPlacementCardView
              key={card.placement_id}
              card={card}
              removing={removing?.placement_id === card.placement_id}
              onOpen={() => onOpen(card)}
              onRemove={manageable ? () => onRemove(section.category, card) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}
