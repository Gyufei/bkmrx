import { useState, useEffect, useRef } from "react";

interface Props {
  onSearch: (query: string) => void;
  loading: boolean;
}

export default function SearchBar({ onSearch, loading }: Props) {
  const [value, setValue] = useState("");
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onSearch(value);
  }, [value, onSearch]);

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="搜索书签..."
        className="w-full h-10 pl-4 pr-10 text-[15px] font-medium rounded-input border border-border dark:border-border-dark bg-surface-card dark:bg-surface-dark-card text-text-primary dark:text-text-dark-primary placeholder:text-text-secondary dark:placeholder:text-text-dark-secondary outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent dark:focus:ring-accent-dark/30 dark:focus:border-accent-dark transition-colors"
        autoFocus
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 pointer-events-none">
        {loading ? (
          <div className="w-4 h-4 border-2 border-accent dark:border-accent-dark border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-secondary dark:text-text-dark-secondary">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.3-4.3"/>
          </svg>
        )}
      </div>
    </div>
  );
}
