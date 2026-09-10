import { useState } from 'react';
import { Globe2, X } from 'lucide-react';
import type { NavigationPlacementCard as PlacementCard } from '@/types';
import { Button } from '@/components/ui/button';

interface Props {
  card: PlacementCard;
  removing: boolean;
  onOpen(): void;
  onRemove(): void;
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
    <div className="group relative flex min-w-0 items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-colors hover:bg-accent">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onOpen}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          {favicon && !failed ? (
            <img
              src={favicon}
              alt=""
              loading="lazy"
              className="size-5"
              onError={() => setFailed(true)}
            />
          ) : (
            <Globe2 aria-hidden="true" className="size-5 text-muted-foreground" />
          )}
        </span>
        <span className="truncate text-sm font-medium">{card.title}</span>
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`从分类移除 ${card.title}`}
        disabled={removing}
        onClick={onRemove}
      >
        <X />
      </Button>
    </div>
  );
}
