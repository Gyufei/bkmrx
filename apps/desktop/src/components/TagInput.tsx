import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";
import { tagColor } from "../lib/tagColor";
import type { Tag } from "../types";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  fetchTags: () => Promise<Tag[]>;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export default function TagInput({
  value,
  onChange,
  fetchTags,
  placeholder = "输入标签，回车添加",
  disabled = false,
  autoFocus = false,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load all existing tag names on mount
  useEffect(() => {
    fetchTags().then((tags) => setAllTags(tags.map((t) => t.name)));
  }, [fetchTags]);

  // Filter suggestions: match input (case-insensitive), exclude already selected
  const filteredSuggestions = useMemo(() => {
    if (!inputValue.trim()) {
      return allTags.filter((t) => !value.includes(t));
    }
    const q = inputValue.toLowerCase();
    return allTags.filter(
      (t) => t.toLowerCase().includes(q) && !value.includes(t),
    );
  }, [allTags, inputValue, value]);

  const addTag = useCallback(
    (tag: string) => {
      const trimmed = tag.trim();
      if (!trimmed || value.includes(trimmed)) return;
      onChange([...value, trimmed]);
      setInputValue("");
      setActiveIdx(-1);
      // Keep dropdown open (closeOnSelect: false behavior)
      inputRef.current?.focus();
    },
    [value, onChange],
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
      setShowDropdown(true);
      setActiveIdx(-1);
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (activeIdx >= 0 && activeIdx < filteredSuggestions.length) {
          addTag(filteredSuggestions[activeIdx]);
        } else if (inputValue.trim()) {
          addTag(inputValue);
        }
      } else if (e.key === "," || e.key === "，") {
        e.preventDefault();
        if (inputValue.trim()) {
          addTag(inputValue);
        }
      } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
        removeTag(value[value.length - 1]);
      } else if (e.key === "Escape") {
        setShowDropdown(false);
        setActiveIdx(-1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((prev) =>
          Math.min(prev + 1, filteredSuggestions.length - 1),
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((prev) => Math.max(prev - 1, -1));
      }
    },
    [inputValue, value, filteredSuggestions, activeIdx, addTag, removeTag],
  );

  // Click outside to close dropdown
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // Scroll active dropdown item into view
  useEffect(() => {
    if (activeIdx >= 0 && dropdownRef.current) {
      const item = dropdownRef.current.children[activeIdx] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  return (
    <div ref={containerRef} className="relative">
      {/* Tag input area */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 min-h-[36px] px-2 py-1",
          "border rounded-input bg-surface dark:bg-surface-dark",
          "transition-colors",
          disabled
            ? "border-border dark:border-border-dark opacity-50 cursor-not-allowed"
            : "border-border dark:border-border-dark focus-within:border-accent dark:focus-within:border-accent-dark focus-within:ring-2 focus-within:ring-accent/30 dark:focus-within:ring-accent-dark/30",
        )}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-chip max-w-[200px]"
            style={tagColor(tag)}
          >
            <span className="truncate">{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              disabled={disabled}
              className="p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors shrink-0"
              tabIndex={-1}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : ""}
          autoFocus={autoFocus}
          className="flex-1 min-w-[80px] bg-transparent outline-none text-sm py-0.5 text-text-primary dark:text-text-dark-primary placeholder:text-text-secondary/50 dark:placeholder:text-text-dark-secondary/50"
        />
      </div>

      {/* Dropdown */}
      {showDropdown && filteredSuggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className={cn(
            "absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto",
            "border border-border dark:border-border-dark rounded-lg",
            "bg-surface dark:bg-surface-dark shadow-lg",
            "p-2 flex flex-wrap gap-1.5",
            "animate-scale-in origin-top",
          )}
        >
          {filteredSuggestions.map((tag, i) => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              onMouseEnter={() => setActiveIdx(i)}
              className={cn(
                "inline-flex items-center px-2 py-1 text-xs rounded-chip",
                "transition-colors cursor-pointer",
                i === activeIdx
                  ? "ring-2 ring-accent/40 dark:ring-accent-dark/40"
                  : "hover:bg-accent-bg dark:hover:bg-accent-dark-bg",
              )}
              style={tagColor(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
