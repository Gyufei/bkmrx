import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BookmarkId, NavigationCategoryId } from '@/identity';
import type { NavigationBookmark } from '@/types';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { invokeQueryBookmarks } from '@/lib/invoke';

interface Props {
  categoryId: NavigationCategoryId | null;
  categoryName: string;
  assigned: NavigationBookmark[];
  pending: boolean;
  onOpenChange(open: boolean): void;
  onAdd(ids: BookmarkId[]): void;
}

export default function BookmarkPickerDialog({
  categoryId,
  categoryName,
  assigned,
  pending,
  onOpenChange,
  onAdd,
}: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<BookmarkId>>(new Set());
  const bookmarks = useQuery({
    queryKey: ['navigation-bookmark-picker', query],
    queryFn: () =>
      invokeQueryBookmarks(
        query.trim()
          ? { mode: 'search', query: query.trim(), tags: [], cursor: null, page_size: 100 }
          : { mode: 'browse', starred: false, cursor: null, page_size: 100 },
      ),
    enabled: categoryId !== null,
  });
  const assignedIds = useMemo(() => new Set(assigned.map((bookmark) => bookmark.id)), [assigned]);
  const available = bookmarks.data?.items.filter((bookmark) => !assignedIds.has(bookmark.id)) ?? [];

  useEffect(() => {
    if (categoryId === null) {
      setQuery('');
      setSelected(new Set());
    }
  }, [categoryId]);

  const toggle = (id: BookmarkId) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={categoryId !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加到“{categoryName}”</DialogTitle>
          <DialogDescription>从现有书签中选择，可同时添加多项。</DialogDescription>
        </DialogHeader>
        <Input
          aria-label="搜索现有书签"
          autoFocus
          placeholder="搜索标题、网址或描述"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {bookmarks.isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">正在加载书签…</p>
          ) : available.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">没有可添加的书签</p>
          ) : (
            available.map((bookmark) => (
              <label
                key={bookmark.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent"
              >
                <Checkbox
                  checked={selected.has(bookmark.id)}
                  onCheckedChange={() => toggle(bookmark.id)}
                />
                <span className="min-w-0 truncate">{bookmark.title}</span>
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={selected.size === 0 || pending} onClick={() => onAdd([...selected])}>
            添加{selected.size > 0 ? `（${selected.size}）` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
