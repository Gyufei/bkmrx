import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import { open as openExternal } from '@tauri-apps/plugin-shell';

import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import type { Bookmark } from '@/types';

interface BookmarkWebPreviewProps {
  bookmark: Bookmark | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: HTMLElement | null;
}

function bookmarkHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default function BookmarkWebPreview({
  bookmark,
  open,
  onOpenChange,
  container,
}: BookmarkWebPreviewProps) {
  const [frameVersion, setFrameVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setFrameVersion(0);
    setLoading(true);
  }, [bookmark?.id, open]);

  if (!bookmark) return null;

  const title = bookmark.title || bookmark.url;

  const handleRefresh = () => {
    setLoading(true);
    setFrameVersion((version) => version + 1);
  };

  const handleOpenExternal = async () => {
    try {
      await openExternal(bookmark.url);
    } catch {
      toast.add({
        type: 'error',
        title: '无法打开链接',
        description: bookmark.url,
      });
    }
  };

  return (
    <Sheet
      open={open}
      modal="trap-focus"
      onOpenChange={(nextOpen) => onOpenChange(nextOpen)}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) closeButtonRef.current?.focus({ preventScroll: true });
      }}
      disablePointerDismissal
    >
      <SheetContent
        container={container}
        initialFocus={false}
        className="left-56 w-auto border-l border-border"
      >
        <SheetHeader className="min-h-14 border-b border-border px-4 py-2">
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate">{title}</SheetTitle>
            <div className="truncate text-xs text-muted-foreground">
              {bookmarkHost(bookmark.url)}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleOpenExternal}>
            <ExternalLink data-icon="inline-start" />
            在浏览器中打开
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleRefresh} aria-label="刷新网页">
            <RefreshCw />
          </Button>
          <SheetClose
            render={<Button ref={closeButtonRef} variant="ghost" size="icon-sm" />}
            aria-label="关闭预览"
          >
            <X />
          </SheetClose>
        </SheetHeader>

        <div className="relative min-h-0 flex-1 bg-background">
          {loading && (
            <div
              role="status"
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background text-sm text-muted-foreground"
            >
              <Loader2 className="animate-spin" aria-hidden="true" />
              <span>正在加载网页…</span>
            </div>
          )}
          <iframe
            key={`${bookmark.id}-${frameVersion}`}
            title={`预览：${title}`}
            src={bookmark.url}
            sandbox="allow-scripts allow-forms allow-same-origin"
            className="size-full border-0 bg-background"
            onLoad={() => setLoading(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
