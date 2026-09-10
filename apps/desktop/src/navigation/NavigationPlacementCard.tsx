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
        'group relative flex h-7 w-[200px] items-center rounded-md border border-transparent bg-muted/40 transition-transform',
        'hover:-translate-px hover:border-ring',
      )}
    >
      <button
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 px-1.5 text-left"
        onClick={onOpen}
      >
        <span className="flex size-4 shrink-0 items-center justify-center">
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
        <span className="truncate text-xs">{card.title}</span>
      </button>
      {onRemove ? (
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
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
