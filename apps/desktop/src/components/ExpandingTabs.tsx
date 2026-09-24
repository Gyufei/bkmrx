import { useRef, type KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export type ExpandingTabItem<T extends string> = {
  value: T;
  label: string;
  icon: LucideIcon;
};

export type ExpandingTabsProps<T extends string> = {
  items: readonly ExpandingTabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
};

export function ExpandingTabs<T extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  className,
}: ExpandingTabsProps<T>) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined;

    if (event.key === 'ArrowRight') nextIndex = (index + 1) % items.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    onValueChange(items[nextIndex].value);
    buttons.current[nextIndex]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-8 items-stretch gap-4 border-l border-border pl-4',
        className,
      )}
    >
      {items.map((item, index) => {
        const active = item.value === value;
        const Icon = item.icon;

        return (
          <button
            ref={(node) => {
              buttons.current[index] = node;
            }}
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={item.label}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'relative flex h-8 cursor-pointer items-center gap-1.5 border-b-2 px-0.5 text-xs font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:size-3.5 [&_svg]:shrink-0',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon aria-hidden />
            <span
              data-slot="expanding-tab-label"
              className="pointer-events-none"
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
