import { useRef, useState, type KeyboardEvent } from 'react';
import { motion, useReducedMotion } from 'motion/react';
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

const SPRING = { type: 'spring', stiffness: 220, damping: 24 } as const;

export function ExpandingTabs<T extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  className,
}: ExpandingTabsProps<T>) {
  const [hovered, setHovered] = useState<T | null>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const reduceMotion = useReducedMotion() ?? false;

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
        'inline-flex h-8 items-center gap-0.5 rounded-full border border-border bg-muted p-0.5 shadow-xs',
        className,
      )}
      onMouseLeave={() => setHovered(null)}
    >
      {items.map((item, index) => {
        const active = item.value === value;
        const expanded = hovered ? hovered === item.value : active;
        const Icon = item.icon;

        return (
          <motion.button
            ref={(node) => {
              buttons.current[index] = node;
            }}
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={item.label}
            tabIndex={active ? 0 : -1}
            initial={false}
            animate={{ width: expanded ? 64 : 28, paddingLeft: expanded ? 11 : 7 }}
            transition={reduceMotion ? { duration: 0 } : SPRING}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            onClick={() => onValueChange(item.value)}
            onMouseEnter={() => setHovered(item.value)}
            onFocus={() => setHovered(item.value)}
            onBlur={() => setHovered(null)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'flex h-7 cursor-pointer items-center justify-start overflow-hidden rounded-full pr-0 text-xs font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-3.5 [&_svg]:shrink-0',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon aria-hidden />
            <motion.span
              data-slot="expanding-tab-label"
              aria-hidden={!expanded}
              initial={false}
              animate={{ opacity: expanded ? 1 : 0, x: expanded ? 0 : -4 }}
              transition={{ duration: reduceMotion ? 0 : 0.16, delay: expanded ? 0.06 : 0 }}
              className="pointer-events-none ml-1 overflow-hidden"
            >
              {item.label}
            </motion.span>
          </motion.button>
        );
      })}
    </div>
  );
}
