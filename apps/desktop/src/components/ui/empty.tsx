import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

function Empty({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty"
      className={cn('flex flex-col items-center justify-center gap-2 text-center', className)}
      {...props}
    />
  );
}

function EmptyMedia({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="empty-media" className={cn('text-muted-foreground', className)} {...props} />
  );
}

function EmptyTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="empty-title" className={cn('font-medium', className)} {...props} />;
}

function EmptyDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="empty-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Empty, EmptyDescription, EmptyMedia, EmptyTitle };
