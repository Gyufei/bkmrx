import type { ComponentProps } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

function FieldGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-group"
      className={cn('flex w-full flex-col gap-4', className)}
      {...props}
    />
  );
}

function Field({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="field"
      className={cn('group/field flex w-full flex-col gap-2', className)}
      {...props}
    />
  );
}

function FieldLabel({ className, ...props }: ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={className} {...props} />;
}

function FieldError({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p data-slot="field-error" className={cn('text-sm text-destructive', className)} {...props} />
  );
}

export { Field, FieldError, FieldGroup, FieldLabel };
