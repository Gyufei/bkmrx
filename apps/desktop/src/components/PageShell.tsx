import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageShellProps {
  children: ReactNode;
  relative?: boolean;
  className?: string;
}

export default function PageShell({ children, relative, className }: PageShellProps) {
  return (
    <main
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background',
        relative && 'relative',
        className,
      )}
    >
      {children}
    </main>
  );
}
