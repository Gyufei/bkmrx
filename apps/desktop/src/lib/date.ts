import { format, isValid, parseISO } from 'date-fns';

const LOCAL_DATE_FORMAT = 'yyyy-MM-dd';

export function parseLocalDate(value: string | null | undefined): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = parseISO(value);
  if (!isValid(date) || format(date, LOCAL_DATE_FORMAT) !== value) return undefined;
  return date;
}

export function formatLocalDate(date: Date): string {
  return format(date, LOCAL_DATE_FORMAT);
}

export function formatLocalDateForDisplay(value: string): string {
  const date = parseLocalDate(value);
  return date ? format(date, 'yyyy/M/d') : value;
}
