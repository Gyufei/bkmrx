import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import { open as openExternal } from '@tauri-apps/plugin-shell';

import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';
import { invokePrepareBookmarkPreview } from '@/lib/invoke';
import type { Bookmark, BookmarkPreview } from '@/types';
import GithubRepositoryPreview from './GithubRepositoryPreview';
import PreviewFallbackCard from './PreviewFallbackCard';

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
  const [preview, setPreview] = useState<BookmarkPreview | null>(null);
  const [unexpectedError, setUnexpectedError] = useState(false);
  const [frameLoading, setFrameLoading] = useState(false);
  const [frameTimedOut, setFrameTimedOut] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !bookmark) return;
    let current = true;
    setPreview(null);
    setUnexpectedError(false);
    setFrameTimedOut(false);

    invokePrepareBookmarkPreview(
      { bookmark_id: bookmark.id, url: bookmark.url },
      requestVersion > 0,
    ).then(
      (nextPreview) => {
        if (!current) return;
        setPreview(nextPreview);
        setFrameLoading(nextPreview.kind === 'web');
      },
      () => {
        if (!current) return;
        setUnexpectedError(true);
      },
    );

    return () => {
      current = false;
    };
  }, [bookmark?.id, bookmark?.url, open, requestVersion]);

  useEffect(() => {
    if (!frameLoading || preview?.kind !== 'web') return;
    const timeout = window.setTimeout(() => setFrameTimedOut(true), 10_000);
    return () => window.clearTimeout(timeout);
  }, [frameLoading, preview]);

  useEffect(() => {
    if (!open) setRequestVersion(0);
  }, [open]);

  if (!bookmark) return null;

  const title = bookmark.title || bookmark.url;
  const host = bookmarkHost(bookmark.url);
  const retry = () => setRequestVersion((version) => version + 1);

  const handleOpenExternal = async () => {
    try {
      await openExternal(bookmark.url);
    } catch {
      toast.add({ type: 'error', title: '无法打开链接', description: bookmark.url });
    }
  };

  const content = (() => {
    if (unexpectedError) {
      return (
        <PreviewFallbackCard
          reason="unexpected_error"
          message="应用暂时无法准备该网页的预览"
          host={host}
          onRetry={retry}
          onOpenExternal={handleOpenExternal}
        />
      );
    }
    if (!preview) {
      return (
        <div
          role="status"
          className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
        >
          <Loader2 className="animate-spin" aria-hidden="true" />
          <span>正在准备预览…</span>
        </div>
      );
    }
    if (preview.kind === 'github_repository') {
      return (
        <GithubRepositoryPreview
          repository={preview.repository}
          onOpenExternal={handleOpenExternal}
        />
      );
    }
    if (preview.kind === 'fallback') {
      return (
        <PreviewFallbackCard
          reason={preview.reason}
          message={preview.message}
          host={host}
          httpStatus={preview.http_status}
          onRetry={retry}
          onOpenExternal={handleOpenExternal}
        />
      );
    }
    if (frameTimedOut) {
      return (
        <PreviewFallbackCard
          reason="timeout"
          message="网页未能及时完成应用内渲染，但仍可能在浏览器中正常打开"
          host={host}
          onRetry={retry}
          onOpenExternal={handleOpenExternal}
        />
      );
    }
    return (
      <div className="relative min-h-0 flex-1 bg-background">
        {frameLoading && (
          <div
            role="status"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background text-sm text-muted-foreground"
          >
            <Loader2 className="animate-spin" aria-hidden="true" />
            <span>正在加载网页…</span>
          </div>
        )}
        <iframe
          key={`${bookmark.id}-${requestVersion}`}
          title={`预览：${title}`}
          src={preview.final_url}
          sandbox="allow-scripts allow-forms allow-same-origin"
          className="size-full border-0 bg-background"
          onLoad={() => setFrameLoading(false)}
        />
      </div>
    );
  })();

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
            <div className="truncate text-xs text-muted-foreground">{host}</div>
          </div>
          <Button variant="outline" size="sm" onClick={handleOpenExternal}>
            <ExternalLink data-icon="inline-start" />
            在浏览器中打开
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={retry} aria-label="刷新网页">
            <RefreshCw />
          </Button>
          <SheetClose
            render={<Button ref={closeButtonRef} variant="ghost" size="icon-sm" />}
            aria-label="关闭预览"
          >
            <X />
          </SheetClose>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col bg-background">{content}</div>
      </SheetContent>
    </Sheet>
  );
}
