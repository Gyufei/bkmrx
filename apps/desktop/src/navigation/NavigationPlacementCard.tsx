import { useState } from 'react';
import { Globe2, X } from 'lucide-react';
import type { NavigationPlacementCard as PlacementCard } from '@/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  card: PlacementCard;
  removing: boolean;
  onOpen(): void;
  onRemove?(): void;
}

function faviconUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol)
      ? new URL('/favicon.ico', parsed.origin).href
      : null;
  } catch {
    return null;
  }
}

export default function NavigationPlacementCard({ card, removing, onOpen, onRemove }: Props) {
  const [failed, setFailed] = useState(false);
  const favicon = faviconUrl(card.url);
  return (
    <div
      className={cn(
        'group relative flex h-8 min-w-0 items-center rounded-md border border-transparent transition-colors',
        'hover:border-border hover:bg-accent/70 focus-within:border-ring/60 focus-within:bg-accent/70',
        onRemove && 'pr-7',
      )}
    >
      <button
        className="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left outline-none"
        onClick={onOpen}
        title={`${card.title}\n${card.url}`}
      >
        <span className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-background">
          {favicon && !failed ? (
            <img
              src={favicon}
              alt=""
              loading="lazy"
              className="size-3.5"
              onError={() => setFailed(true)}
            />
          ) : (
            <Globe2 aria-hidden="true" className="size-3.5 text-muted-foreground" />
          )}
        </span>
        <span className="truncate text-xs font-medium">{card.title}</span>
      </button>
      {onRemove ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute top-1 right-1 text-muted-foreground hover:text-destructive"
          aria-label={`从分类移除 ${card.title}`}
          disabled={removing}
          onClick={onRemove}
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}
