import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Search, SquareLibrary, Star, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BookmarkBaseView, Tag } from '@/types';
import { tagColor } from '../lib/tagColor';
import { getTagsApi, tagQueryKey } from './bookmarks.api';

const TAG_LIMIT = 50;
const TAG_SEARCH_DELAY = 200;

interface Props {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  baseView: BookmarkBaseView;
  onBaseViewChange: (view: BookmarkBaseView) => void;
}

export default function BookmarkSidebar({
  selectedTags,
  onTagsChange,
  baseView,
  onBaseViewChange,
}: Props) {
  const [tagQuery, setTagQuery] = useState('');
  const [debouncedTagQuery, setDebouncedTagQuery] = useState('');
  const [seenTags, setSeenTags] = useState<Map<string, Tag>>(() => new Map());

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedTagQuery(tagQuery.trim()),
      TAG_SEARCH_DELAY,
    );
    return () => window.clearTimeout(timeout);
  }, [tagQuery]);

  const tagsQuery = useQuery({
    queryKey: tagQueryKey(debouncedTagQuery, TAG_LIMIT),
    queryFn: () => getTagsApi({ query: debouncedTagQuery, limit: TAG_LIMIT }),
  });

  useEffect(() => {
    if (!tagsQuery.data?.length) return;
    setSeenTags((current) => {
      const next = new Map(current);
      tagsQuery.data.forEach((tag) => next.set(tag.name, tag));
      return next;
    });
  }, [tagsQuery.data]);

  const visibleTags = useMemo(() => {
    const results = tagsQuery.data ?? [];
    const resultNames = new Set(results.map((tag) => tag.name));
    const pinned = selectedTags
      .filter((name) => !resultNames.has(name))
      .map((name) => seenTags.get(name) ?? { name, count: 0 });
    const selectedResults = results.filter((tag) => selectedTags.includes(tag.name));
    const unselectedResults = results.filter((tag) => !selectedTags.includes(tag.name));
    return [...pinned, ...selectedResults, ...unselectedResults];
  }, [seenTags, selectedTags, tagsQuery.data]);

  const toggleTag = useCallback(
    (name: string) => {
      onTagsChange(
        selectedTags.includes(name)
          ? selectedTags.filter((tag) => tag !== name)
          : [...selectedTags, name],
      );
    },
    [onTagsChange, selectedTags],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-sm font-semibold text-foreground">标签</span>
        {selectedTags.length > 0 && (
          <Button
            variant="ghost"
            className="h-auto p-0 text-xs text-muted-foreground"
            onClick={() => onTagsChange([])}
          >
            清除
          </Button>
        )}
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="筛选标签"
          value={tagQuery}
          onChange={(event) => setTagQuery(event.target.value)}
          placeholder="筛选标签…"
          className="h-9 pl-9 pr-8 text-xs"
        />
        {tagQuery && (
          <button
            type="button"
            aria-label="清空标签搜索"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent"
            onClick={() => setTagQuery('')}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div className="hidden-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
        {visibleTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {visibleTags.map((tag) => {
              const selected = selectedTags.includes(tag.name);
              return (
                <button
                  key={tag.name}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleTag(tag.name)}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs transition-all ${
                    selected ? '' : 'bg-muted text-muted-foreground hover:opacity-80'
                  }`}
                  style={selected ? tagColor(tag.name) : undefined}
                >
                  <span className="break-all text-start">{tag.name}</span>
                  <span className={selected ? 'opacity-60' : 'opacity-40'}>{tag.count}</span>
                </button>
              );
            })}
          </div>
        )}
        {tagsQuery.isError ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            <p>标签加载失败</p>
            <Button
              variant="ghost"
              className="mt-1 h-auto p-0 text-xs"
              onClick={() => tagsQuery.refetch()}
            >
              重试
            </Button>
          </div>
        ) : tagsQuery.isLoading ? (
          <div className="py-4 text-center text-xs text-muted-foreground">加载中…</div>
        ) : visibleTags.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">未找到匹配标签</div>
        ) : null}
      </div>

      <div className="mt-3 shrink-0 space-y-1 border-t border-border pt-3">
        <ViewButton
          active={baseView === 'all'}
          icon={<SquareLibrary className="size-4" />}
          label="全部"
          onClick={() => onBaseViewChange('all')}
        />
        <ViewButton
          active={baseView === 'starred'}
          icon={<Star className="size-4" />}
          label="星标"
          onClick={() => onBaseViewChange('starred')}
        />
      </div>
    </div>
  );
}

function ViewButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/60'
      }`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
