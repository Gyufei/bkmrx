import { forwardRef, useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

interface Props {
  onSearch: (query: string) => void;
  loading: boolean;
}

const SearchBar = forwardRef<HTMLInputElement, Props>(function SearchBar(
  { onSearch, loading },
  ref,
) {
  const [value, setValue] = useState('');

  const handleSearch = useCallback(() => {
    onSearch(value);
  }, [value, onSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch],
  );

  const handleBlur = useCallback(() => {
    if (value.trim() === '') {
      onSearch('');
    }
  }, [value, onSearch]);

  return (
    <div className="relative flex-1">
      <Input
        ref={ref}
        type="text"
        autoComplete="one-time-code"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-form-type="other"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder="搜索书签..."
        className="h-10 pl-4 pr-10 text-[15px] font-medium"
      />
      <button
        type="button"
        onClick={handleSearch}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-accent transition-colors"
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        ) : (
          <Search className="w-[18px] h-[18px] text-muted-foreground" />
        )}
      </button>
    </div>
  );
});

export default SearchBar;
