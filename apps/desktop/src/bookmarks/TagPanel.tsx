import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { tagColor } from '../lib/tagColor';
import type { Tag } from '../types';

interface Props {
  fetchTags: () => Promise<Tag[]>;
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export default function TagPanel({ fetchTags, selectedTags, onTagsChange }: Props) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchTags().then((result) => {
      setTags(result.sort((a, b) => b.count - a.count));
      setLoading(false);
    });
  }, [fetchTags]);

  const toggleTag = useCallback(
    (name: string) => {
      onTagsChange(
        selectedTags.includes(name)
          ? selectedTags.filter((t) => t !== name)
          : [...selectedTags, name],
      );
    },
    [selectedTags, onTagsChange],
  );

  const clearAll = useCallback(() => {
    onTagsChange([]);
  }, [onTagsChange]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-sm font-semibold text-foreground">标签筛选</span>
        {tags.length > 0 && (
          <div className="flex gap-1 text-xs justify-end">
            <Button
              variant="ghost"
              className="p-0 h-auto text-xs text-muted-foreground"
              onClick={clearAll}
            >
              清除
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden pr-1 thin-scrollbar">
        {loading ? (
          <div className="text-sm text-muted-foreground py-4 text-center">加载中...</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const selected = selectedTags.includes(tag.name);
              return (
                <button
                  onClick={() => toggleTag(tag.name)}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md cursor-pointer transition-all ${
                    selected ? '' : 'bg-muted text-muted-foreground hover:opacity-80'
                  }`}
                  style={selected ? tagColor(tag.name) : undefined}
                >
                  <span className='text-align-start break-all'>{tag.name}</span>
                  <span className={selected ? 'opacity-60' : 'opacity-40'}>{tag.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
