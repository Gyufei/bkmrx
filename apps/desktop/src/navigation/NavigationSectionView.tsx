import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { NavigationCategory, NavigationPlacementCard, NavigationSection } from '@/types';
import { Button } from '@/components/ui/button';
import NavigationPlacementCardView from './NavigationPlacementCard';

interface Props {
  section: NavigationSection;
  manageable: boolean;
  removing?: NavigationPlacementCard;
  onEdit(category: NavigationCategory): void;
  onAdd(category: NavigationCategory): void;
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
    <section className="w-max max-w-full rounded-lg border p-3">
      <div className="flex h-6 items-center justify-between gap-2">
        <h2 className="text-sm leading-none font-semibold">{section.category.name}</h2>
        {manageable ? (
          <div className="flex shrink-0 gap-1">
            <Button
              variant="outline"
              size="icon-xs"
              aria-label="添加书签"
              onClick={() => onAdd(section.category)}
            >
              <Plus />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              aria-label={`重命名 ${section.category.name}`}
              onClick={() => onEdit(section.category)}
            >
              <Pencil />
            </Button>
            <Button
              variant="outline"
              size="icon-xs"
              aria-label={`删除 ${section.category.name}`}
              onClick={() => onDelete(section)}
            >
              <Trash2 />
            </Button>
          </div>
        ) : null}
      </div>
      {section.cards.length === 0 ? (
        <p className="mt-2 flex h-7 items-center text-xs text-muted-foreground">该分类暂无书签</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
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
