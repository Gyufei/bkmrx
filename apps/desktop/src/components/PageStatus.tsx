import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

export function PageLoading({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-center gap-2 text-sm text-muted-foreground',
        className,
      )}
    >
      <Spinner />
      <span>{text}</span>
    </div>
  );
}

export function PageError({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-center p-5', className)}>
      <Alert variant="destructive" className="max-w-md text-center">
        <AlertTitle>{title}</AlertTitle>
        {description ? <AlertDescription>{description}</AlertDescription> : null}
      </Alert>
    </div>
  );
}

export function PageEmpty({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-center p-5', className)}>{children}</div>;
}
