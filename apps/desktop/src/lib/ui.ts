import { cn } from '@/lib/utils';

export function selectedRowClass(selected: boolean, options?: { fontWeight?: boolean }) {
  return cn(
    'transition-colors',
    selected
      ? cn('bg-primary/15', options?.fontWeight && 'font-medium')
      : 'hover:bg-accent/60',
  );
}
