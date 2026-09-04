import { useEffect, useRef } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { save } from '@tauri-apps/plugin-dialog';
import { BookmarkPlus, Download, ImageOff, Languages } from 'lucide-react';
import type { RssEntry } from '@/types';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { toast } from '@/components/ui/toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { downloadRssImageApi } from './rss.api';

export default function RssEntryReader({
  entry,
  hideImages,
  bookmarkState,
  onToggleImages,
  onToggleRead,
  onBookmark,
}: {
  entry: RssEntry;
  hideImages: boolean;
  bookmarkState: 'unavailable' | 'loading' | 'available' | 'saved' | 'error';
  onToggleImages: () => void;
  onToggleRead: () => void;
  onBookmark: () => void;
}) {
  return (
    <>
      <div className="h-full overflow-auto">
        <EntryContent entry={entry} hideImages={hideImages} onToggleRead={onToggleRead} />
      </div>
      <ReaderActionBar
        hideImages={hideImages}
        bookmarkState={bookmarkState}
        onToggleImages={onToggleImages}
        onBookmark={onBookmark}
      />
    </>
  );
}

function ReaderActionBar({
  hideImages,
  bookmarkState,
  onToggleImages,
  onBookmark,
}: {
  hideImages: boolean;
  bookmarkState: 'unavailable' | 'loading' | 'available' | 'saved' | 'error';
  onToggleImages: () => void;
  onBookmark: () => void;
}) {
  const bookmarkAction = {
    label:
      bookmarkState === 'unavailable'
        ? '该文章没有可收藏的原文链接'
        : bookmarkState === 'loading'
          ? '正在查询收藏状态'
          : bookmarkState === 'saved'
            ? '编辑已收藏书签'
            : bookmarkState === 'error'
              ? '收藏状态查询失败，点击重试'
              : '收藏当前文章到书签',
    icon: BookmarkPlus,
    active: bookmarkState === 'saved',
    disabled: bookmarkState === 'unavailable' || bookmarkState === 'loading',
    invalid: bookmarkState === 'error',
    onClick: onBookmark,
  };
  const actions: Array<{
    label: string;
    icon: typeof ImageOff;
    active?: boolean;
    disabled?: boolean;
    invalid?: boolean;
    onClick?: () => void;
  }> = [
    {
      label: hideImages ? '显示图片' : '隐藏图片',
      icon: ImageOff,
      active: hideImages,
      onClick: onToggleImages,
    },
    { label: '翻译', icon: Languages },
    bookmarkAction,
  ];
  return (
    <TooltipProvider delay={300}>
      <aside
        aria-label="阅读工具"
        className="absolute right-5 top-1/2 flex -translate-y-1/2 flex-col gap-1 rounded-4xl border bg-background/90 p-1.5 shadow-lg backdrop-blur-md"
      >
        {actions.map(({ label, icon: Icon, active, disabled, invalid, onClick }) => (
          <Tooltip key={label}>
            <TooltipTrigger
              render={
                <Button
                  variant={invalid ? 'destructive' : active ? 'secondary' : 'ghost'}
                  size="icon"
                  aria-label={label}
                  aria-pressed={active}
                  aria-invalid={invalid || undefined}
                  disabled={disabled}
                  type="button"
                  onClick={onClick}
                >
                  <Icon />
                </Button>
              }
            />
            <TooltipContent side="left">{label}</TooltipContent>
          </Tooltip>
        ))}
      </aside>
    </TooltipProvider>
  );
}

function EntryContent({
  entry,
  hideImages,
  onToggleRead,
}: {
  entry: RssEntry;
  hideImages: boolean;
  onToggleRead: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const contextImageUrl = useRef<string | null>(null);
  useEffect(() => {
    const content = contentRef.current;
    content?.querySelectorAll('img').forEach((image) => {
      image.loading = 'lazy';
      image.decoding = 'async';
    });
    const handleContentLink = (event: MouseEvent) => {
      if (event.type === 'auxclick' && event.button !== 1) return;
      if (!(event.target instanceof Element)) return;
      const articleContent = event.target.closest('[data-rss-entry-content]');
      const anchor = event.target.closest('a');
      if (!articleContent || !anchor || !articleContent.contains(anchor)) return;
      event.preventDefault();
      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      void open(url.href).catch((reason) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        console.error('Failed to open external RSS link', { href: url.href, error });
      });
    };
    document.addEventListener('click', handleContentLink, true);
    document.addEventListener('auxclick', handleContentLink, true);
    return () => {
      document.removeEventListener('click', handleContentLink, true);
      document.removeEventListener('auxclick', handleContentLink, true);
    };
  }, [entry.id, entry.content_html]);
  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const image = event.target instanceof Element ? event.target.closest('img') : null;
    if (!image || !event.currentTarget.contains(image)) {
      contextImageUrl.current = null;
      event.preventDefault();
      return;
    }
    const imageElement = image as HTMLImageElement;
    contextImageUrl.current = imageElement.currentSrc || imageElement.src;
  };
  const saveImage = async () => {
    const imageUrl = contextImageUrl.current;
    if (!imageUrl) return;
    const destination = await save({
      title: '保存图片',
      defaultPath: suggestedImageName(imageUrl),
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'svg'] }],
    });
    if (!destination) return;
    try {
      await downloadRssImageApi(imageUrl, entry.link, destination);
      toast.add({ type: 'success', title: '图片已保存', description: destination });
    } catch (error) {
      toast.add({
        type: 'error',
        title: '图片保存失败',
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };
  return (
    <div className="mx-auto max-w-3xl p-8">
      <header className="mb-6 border-b pb-5">
        <h1 className="text-2xl font-bold leading-tight">{entry.title}</h1>
        <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
          <span>{entry.feed_title}</span>
          {entry.author && <span>{entry.author}</span>}
          <span>{formatDate(entry.published_at ?? entry.fetched_at)}</span>
          <Button variant="ghost" size="sm" onClick={onToggleRead}>
            {entry.is_read ? '标为未读' : '标为已读'}
          </Button>
          {entry.link && (
            <Button variant="outline" size="sm" onClick={() => void open(entry.link!)}>
              打开原文
            </Button>
          )}
        </div>
      </header>
      {entry.content_html ? (
        <div onContextMenuCapture={handleContextMenu}>
          <ContextMenu onOpenChange={(opened) => !opened && (contextImageUrl.current = null)}>
            <ContextMenuTrigger
              ref={contentRef}
              className="select-text"
              render={
                <div
                  data-rss-entry-content
                  className={cn(
                    'prose prose-neutral max-w-none dark:prose-invert prose-img:h-auto prose-img:max-w-full',
                    hideImages && '[&_img]:hidden',
                  )}
                  dangerouslySetInnerHTML={{ __html: entry.content_html }}
                />
              }
            />
            <ContextMenuContent>
              <ContextMenuItem onClick={() => void saveImage()}>
                <Download />
                保存图片…
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      ) : (
        <p className="leading-7 text-muted-foreground">{entry.summary}</p>
      )}
    </div>
  );
}

function suggestedImageName(rawUrl: string) {
  try {
    const candidate = decodeURIComponent(new URL(rawUrl).pathname.split('/').pop() || 'rss-image');
    const sanitized = candidate.replace(/[\\/:*?"<>|]/g, '-').trim();
    return sanitized || 'rss-image';
  } catch {
    return 'rss-image';
  }
}
function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(
    new Date(timestamp * 1000),
  );
}
