import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface MarkdownViewerProps {
  content: string;
  initialScrollTop?: number;
  onScrollTopChange?(scrollTop: number): void;
}

function Table(props: ComponentPropsWithoutRef<'table'>) {
  return (
    <div data-testid="markdown-table-scroll" className="overflow-x-auto">
      <table {...props} />
    </div>
  );
}

function Link({ href, ...props }: ComponentPropsWithoutRef<'a'>) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        if (!href) return;

        event.preventDefault();
        open(href);
      }}
    />
  );
}

export default function MarkdownViewer({
  content,
  initialScrollTop = 0,
  onScrollTopChange,
}: MarkdownViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = initialScrollTop;
  }, [initialScrollTop]);

  return (
    <div
      ref={scrollRef}
      data-testid="markdown-view-scroll"
      className="h-full overflow-y-auto thin-scrollbar"
      onScroll={(event) => onScrollTopChange?.(event.currentTarget.scrollTop)}
    >
      {content ? (
        <article className="markdown-viewer prose prose-zinc dark:prose-invert mx-auto w-full px-6 py-8">
          <Markdown remarkPlugins={[remarkGfm]} components={{ table: Table, a: Link }}>
            {content}
          </Markdown>
        </article>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          空白笔记 · 按 ⌘E 或 Ctrl E 开始编辑
        </div>
      )}
    </div>
  );
}
