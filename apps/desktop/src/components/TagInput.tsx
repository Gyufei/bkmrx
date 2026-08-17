import { useState, useRef, useEffect, useCallback, useMemo, useId } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { cn } from '../lib/utils';
import { tagColor } from '../lib/tagColor';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  inputId?: string;
  onPendingChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export default function TagInput({
  value,
  onChange,
  suggestions,
  inputId,
  onPendingChange,
  placeholder = '输入标签，回车添加',
  disabled = false,
  autoFocus = false,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const listboxId = `${inputId ?? generatedId}-suggestions`;

  // Filter suggestions: match input (case-insensitive), exclude already selected
  const filteredSuggestions = useMemo(() => {
    const allTags = suggestions ?? [];
    if (!inputValue.trim()) {
      return allTags.filter((tag) => !value.includes(tag));
    }
    const q = inputValue.toLowerCase();
    return allTags.filter((tag) => tag.toLowerCase().includes(q) && !value.includes(tag));
  }, [suggestions, inputValue, value]);

  const isListboxOpen = showDropdown && filteredSuggestions.length > 0;

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed || value.includes(trimmed)) return;
      onChange([...value, trimmed]);
      setInputValue('');
      onPendingChange?.('');
      setActiveIdx(-1);
      // Keep dropdown open (closeOnSelect: false behavior)
      inputRef.current?.focus();
    },
    [value, onChange, onPendingChange],
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(value.filter((t) => t !== tag));
    },
    [value, onChange],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      onPendingChange?.(e.target.value);
      setShowDropdown(true);
      setActiveIdx(-1);
    },
    [onPendingChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIdx >= 0 && activeIdx < filteredSuggestions.length) {
          addTag(filteredSuggestions[activeIdx]);
        } else if (inputValue.trim()) {
          addTag(inputValue);
        }
      } else if (e.key === ',' || e.key === '，') {
        e.preventDefault();
        if (inputValue.trim()) {
          addTag(inputValue);
        }
      } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
        removeTag(value[value.length - 1]);
      } else if (e.key === 'Escape') {
        setShowDropdown(false);
        setActiveIdx(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setShowDropdown(true);
        setActiveIdx((prev) => Math.min(prev + 1, filteredSuggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setShowDropdown(true);
        setActiveIdx((prev) => Math.max(prev - 1, -1));
      }
    },
    [inputValue, value, filteredSuggestions, activeIdx, addTag, removeTag],
  );

  // Scroll active dropdown item into view
  useEffect(() => {
    if (activeIdx >= 0 && dropdownRef.current) {
      const item = dropdownRef.current.children[activeIdx] as HTMLElement;
      item?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [activeIdx]);

  return (
    <Popover
      open={isListboxOpen}
      onOpenChange={(open, eventDetails) => {
        if (
          !open &&
          eventDetails.reason === 'focus-out' &&
          anchorRef.current?.contains(document.activeElement)
        ) {
          eventDetails.cancel();
          return;
        }
        setShowDropdown(open);
        if (!open) setActiveIdx(-1);
      }}
    >
      {/* Tag input area */}
      <div
        ref={anchorRef}
        className={cn(
          'flex flex-wrap items-center gap-1.5 min-h-[36px] px-2 py-1',
          'border rounded-lg bg-background',
          'transition-colors',
          disabled
            ? 'border-border opacity-50 cursor-not-allowed'
            : 'border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30',
        )}
      >
        {value.map((tag) => (
          <Badge key={tag} className="max-w-[200px] gap-1" style={tagColor(tag)}>
            <span className="truncate">{tag}</span>
            <button
              type="button"
              aria-label={`移除标签 ${tag}`}
              onClick={() => removeTag(tag)}
              disabled={disabled}
              className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : ''}
          autoFocus={autoFocus}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isListboxOpen}
          aria-controls={isListboxOpen ? listboxId : undefined}
          aria-activedescendant={
            isListboxOpen && activeIdx >= 0 ? `${listboxId}-option-${activeIdx}` : undefined
          }
          className="flex-1 min-w-[80px] bg-transparent outline-none text-sm py-0.5 text-foreground placeholder:text-muted-foreground/50 dark:placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Dropdown */}
      {isListboxOpen && (
        <PopoverContent
          ref={dropdownRef}
          anchor={anchorRef}
          initialFocus={false}
          id={listboxId}
          role="listbox"
          aria-label="标签建议"
          aria-multiselectable="true"
          className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto p-2"
        >
          {filteredSuggestions.map((tag, i) => (
            <button
              key={tag}
              id={`${listboxId}-option-${i}`}
              type="button"
              role="option"
              aria-selected="false"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => addTag(tag)}
              onMouseEnter={() => setActiveIdx(i)}
              className={cn(
                'inline-flex items-center px-2 py-1 text-xs rounded-md',
                'transition-colors cursor-pointer',
                i === activeIdx ? 'ring-2 ring-primary/40' : 'hover:bg-accent',
              )}
              style={tagColor(tag)}
            >
              {tag}
            </button>
          ))}
        </PopoverContent>
      )}
    </Popover>
  );
}
