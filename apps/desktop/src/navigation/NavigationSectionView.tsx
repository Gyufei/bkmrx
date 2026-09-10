import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { NavigationCategory, NavigationPlacementCard, NavigationSection } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import NavigationPlacementCardView from './NavigationPlacementCard';

interface Props {
  section: NavigationSection;
  renaming: boolean;
  removing?: NavigationPlacementCard;
  onRename(category: NavigationCategory, name: string): Promise<unknown>;
  onAdd(category: NavigationCategory): void;
  onDelete(section: NavigationSection): void;
  onOpen(card: NavigationPlacementCard): void;
  onRemove(category: NavigationCategory, card: NavigationPlacementCard): void;
}

export default function NavigationSectionView(props: Props) {
  const { section } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(section.category.name);
  const save = async () => {
    try {
      await props.onRename(section.category, name);
      setEditing(false);
    } catch {
      // The controller reports mutation errors and edit mode remains open for retry.
    }
  };
  return (
    <section className="rounded-xl border p-4">
      <SectionHeader
        {...props}
        editing={editing}
        name={name}
        setEditing={setEditing}
        setName={setName}
        onSave={save}
      />
      {section.cards.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">该分类暂无书签</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {section.cards.map((card) => (
            <NavigationPlacementCardView
              key={card.placement_id}
              card={card}
              removing={props.removing?.placement_id === card.placement_id}
              onOpen={() => props.onOpen(card)}
              onRemove={() => props.onRemove(section.category, card)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface HeaderProps extends Props {
  editing: boolean;
  name: string;
  setEditing(value: boolean): void;
  setName(value: string): void;
  onSave(): Promise<void>;
}

function SectionHeader({
  section,
  editing,
  name,
  renaming,
  setEditing,
  setName,
  onSave,
  onAdd,
  onDelete,
}: HeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      {editing ? (
        <Input
          aria-label={`重命名 ${section.category.name}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      ) : (
        <h2 className="font-semibold">{section.category.name}</h2>
      )}
      <div className="flex gap-1">
        <Button variant="outline" size="sm" onClick={() => onAdd(section.category)}>
          <Plus />
          添加书签
        </Button>
        {editing ? (
          <Button size="sm" disabled={!name.trim() || renaming} onClick={() => void onSave()}>
            保存
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`重命名 ${section.category.name}`}
            onClick={() => {
              setName(section.category.name);
              setEditing(true);
            }}
          >
            <Pencil />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`删除 ${section.category.name}`}
          onClick={() => onDelete(section)}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
