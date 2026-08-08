'use client';

import * as React from 'react';
import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogCancel = AlertDialogPrimitive.Close;

function AlertDialogContent({ className, ...props }: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm data-open:animate-in data-closed:animate-out" />
      <AlertDialogPrimitive.Popup
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-md -translate-x-1/2 -translate-y-1/2 gap-5 rounded-4xl bg-popover p-6 text-popover-foreground shadow-xl ring-1 ring-foreground/5 outline-none',
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

const AlertDialogHeader = (props: React.ComponentProps<'div'>) => (
  <div className="flex flex-col gap-2" {...props} />
);
const AlertDialogFooter = (props: React.ComponentProps<'div'>) => (
  <div className="flex justify-end gap-2" {...props} />
);
const AlertDialogTitle = (props: AlertDialogPrimitive.Title.Props) => (
  <AlertDialogPrimitive.Title className="font-heading text-base font-medium" {...props} />
);
const AlertDialogDescription = (props: AlertDialogPrimitive.Description.Props) => (
  <AlertDialogPrimitive.Description className="text-sm text-muted-foreground" {...props} />
);
const AlertDialogAction = (props: React.ComponentProps<typeof Button>) => (
  <Button variant="destructive" {...props} />
);

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
};
