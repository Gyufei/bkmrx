import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
} from 'react';
import { open } from '@tauri-apps/plugin-shell';
import Markdown, { defaultUrlTransform, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface MarkdownViewerProps {
  content: string;
  initialScrollTop?: number;
  onScrollTopChange?(scrollTop: number): void;
  onToggleTask?(sourceLine: number): void;
}

const TaskSourceLineContext = createContext<number | null>(null);

function Table({ node: _node, ...props }: ComponentPropsWithoutRef<'table'> & ExtraProps) {
  return (
    <div data-testid="markdown-table-scroll" className="overflow-x-auto">
      <table {...props} />
    </div>
  );
}

function isAllowedExternalHref(href: string): boolean {
  try {
    const url = new URL(href);
    if (/^https?:\/\//i.test(href)) {
      return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
    }
    return (
      /^(?:mailto|tel):/i.test(href) && (url.protocol === 'mailto:' || url.protocol === 'tel:')
    );
  } catch {
    return false;
  }
}

function transformMarkdownUrl(url: string, key: string): string {
  return key === 'href' ? (isAllowedExternalHref(url) ? url : '') : defaultUrlTransform(url);
}

function Link({ href, node: _node, ...props }: ComponentPropsWithoutRef<'a'> & ExtraProps) {
  const allowedHref = href && isAllowedExternalHref(href) ? href : undefined;

  return (
    <a
      {...props}
      href={allowedHref}
      onClick={(event) => {
        event.preventDefault();
        if (!allowedHref) return;

        void open(allowedHref).catch((reason) => {
          const error = reason instanceof Error ? reason : new Error(String(reason));
          console.error('Failed to open external note link', { href: allowedHref, error });
        });
      }}
    />
  );
}

function ListItem({ node, ...props }: ComponentPropsWithoutRef<'li'> & ExtraProps) {
  return (
    <TaskSourceLineContext.Provider value={node?.position?.start.line ?? null}>
      <li {...props} />
    </TaskSourceLineContext.Provider>
  );
}

interface InputProps extends ComponentPropsWithoutRef<'input'>, ExtraProps {
  onToggleTask?: MarkdownViewerProps['onToggleTask'];
}

function Input({ node: _node, onToggleTask, ...props }: InputProps) {
  const sourceLine = useContext(TaskSourceLineContext);

  if (props.type !== 'checkbox') return <input {...props} />;

  return (
    <input
      {...props}
      disabled={!onToggleTask || sourceLine === null}
      onChange={() => {
        if (sourceLine !== null) onToggleTask?.(sourceLine);
      }}
    />
  );
}

export default function MarkdownViewer({
  content,
  initialScrollTop = 0,
  onScrollTopChange,
  onToggleTask,
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
          <Markdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: Table,
              a: Link,
              li: ListItem,
              input: (props) => <Input {...props} onToggleTask={onToggleTask} />,
            }}
            urlTransform={transformMarkdownUrl}
          >
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
