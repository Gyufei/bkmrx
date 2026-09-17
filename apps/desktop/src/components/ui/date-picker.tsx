import * as React from 'react';
import { CalendarIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type DatePickerProps = {
  value?: Date;
  onValueChange?: (value: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  disabledDates?: React.ComponentProps<typeof Calendar>['disabled'];
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  className?: string;
};

function DatePicker({
  value,
  onValueChange,
  placeholder = 'Pick a date',
  disabled = false,
  disabledDates,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  function handleSelect(date: Date | undefined) {
    onValueChange?.(date);
    if (date) setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            type="button"
            id={id}
            aria-label={ariaLabel}
            aria-invalid={ariaInvalid}
            variant="outline"
            className={cn(
              'w-64 justify-start font-normal',
              !value && 'text-muted-foreground',
              className,
            )}
          >
            <CalendarIcon data-icon="inline-start" />
            {value ? value.toLocaleDateString() : placeholder}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          disabled={disabledDates}
          onSelect={handleSelect}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export { DatePicker, type DatePickerProps };
