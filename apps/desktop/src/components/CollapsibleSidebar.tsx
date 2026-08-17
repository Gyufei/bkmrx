import { useState, type ReactNode } from 'react';
import { ChevronsLeft, TextAlignJustify } from 'lucide-react';

import { cn } from '@/lib/utils';

interface CollapsibleSidebarProps {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export default function CollapsibleSidebar({
  title,
  children,
  className,
  contentClassName,
}: CollapsibleSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'relative flex shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar',
        'transition-[width,background-color] duration-200 ease-out',
        collapsed ? 'w-12 hover:bg-muted/70' : className,
      )}
    >
      {collapsed ? (
        <button
          type="button"
          aria-label="展开侧边栏"
          className="absolute inset-0 flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={() => setCollapsed(false)}
        >
          <TextAlignJustify className="size-4" />
        </button>
      ) : null}
      <div className={cn('min-h-0 flex-1 flex-col', collapsed ? 'hidden' : 'flex')}>
        <header className="flex h-10 shrink-0 items-center justify-between gap-2 px-3">
          <h2 className="truncate text-sm font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            aria-label="折叠侧边栏"
            className="-mr-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setCollapsed(true)}
          >
            <ChevronsLeft className="size-4" />
          </button>
        </header>
        <div className={cn('min-h-0 flex-1', contentClassName)}>{children}</div>
      </div>
    </aside>
  );
}
