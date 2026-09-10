import { Code, ExternalLink, FolderPlus, Link, Pencil, Star, Trash2 } from 'lucide-react';
import type { BookmarkId } from '@/identity';
import type { Bookmark } from '@/types';
import { Badge } from '@/components/ui/badge';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { toast } from '@/components/ui/toast';
import { tagColor } from '@/lib/tagColor';

export interface BookmarkResultItemProps {
  bookmark: Bookmark;
  starredView: boolean;
  starPending: boolean;
  active: boolean;
  onToggleStarred(bookmark: Bookmark, starred: boolean): void;
  onPreviewBookmark(bookmark: Bookmark, trigger: HTMLElement): void;
  onOpenBookmark(bookmark: Bookmark): void;
  onActiveBookmarkChange(id: BookmarkId): void;
  onElementChange(id: BookmarkId, element: HTMLElement | null): void;
  onRequestNavigation(bookmark: Bookmark): void;
  onRequestEdit(bookmark: Bookmark): void;
  onRequestDelete(bookmark: Bookmark): void;
}

export default function BookmarkResultItem(props: BookmarkResultItemProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <BookmarkRow {...props} />
      </ContextMenuTrigger>
      <BookmarkContextMenu {...props} />
    </ContextMenu>
  );
}

function BookmarkContextMenu({
  bookmark,
  onOpenBookmark,
  onRequestNavigation,
  onRequestEdit,
  onRequestDelete,
}: BookmarkResultItemProps) {
  return (
    <ContextMenuContent>
      <ContextMenuGroup>
        <ContextMenuItem onClick={() => onOpenBookmark(bookmark)}>
          <ExternalLink />
          <span>打开链接</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onRequestNavigation(bookmark)}>
          <FolderPlus />
          <span>添加到导航分类</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            navigator.clipboard.writeText(bookmark.url).catch(() => {});
          }}
        >
          <Link />
          <span>复制链接</span>
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => {
            const text = bookmark.title ? `[${bookmark.title}](${bookmark.url})` : bookmark.url;
            navigator.clipboard.writeText(text).catch(() => {});
          }}
        >
          <Code />
          <span>复制为 Markdown</span>
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem onClick={() => onRequestEdit(bookmark)}>
          <Pencil />
          <span>编辑</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onRequestDelete(bookmark)}>
          <Trash2 />
          <span className="text-destructive">删除</span>
        </ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  );
}

function BookmarkRow(props: BookmarkResultItemProps) {
  const { bookmark } = props;
  return (
    <div className="group relative">
      <BookmarkDetails {...props} />
      <button
        type="button"
        disabled={props.starPending}
        aria-busy={props.starPending}
        onClick={(event) => toggleStar(event, props)}
        className={`absolute right-2 top-2 p-1.5 rounded-md transition-colors disabled:cursor-wait disabled:opacity-50 ${bookmark.starred_at ? 'text-amber-500 hover:bg-amber-500/10' : 'text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-amber-500 hover:bg-amber-500/10'}`}
        title={bookmark.starred_at ? '取消星标' : '添加星标'}
        aria-label={bookmark.starred_at ? '取消星标' : '添加星标'}
      >
        <Star className="h-4 w-4" fill={bookmark.starred_at ? 'currentColor' : 'none'} />
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          props.onRequestDelete(bookmark);
        }}
        className="absolute right-10 top-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1.5 rounded-md text-muted-foreground hover:text-destructive dark:hover:text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/10"
        title="删除书签"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function BookmarkDetails(props: BookmarkResultItemProps) {
  const { bookmark } = props;
  return (
    <div
      ref={(element) => props.onElementChange(bookmark.id, element)}
      tabIndex={-1}
      aria-current={props.active ? 'true' : undefined}
      onClick={(event) => {
        props.onActiveBookmarkChange(bookmark.id);
        props.onPreviewBookmark(bookmark, event.currentTarget);
      }}
      className={`block cursor-pointer rounded-md px-4 py-3 transition-colors ${props.active ? 'bg-accent' : 'hover:bg-accent/40 dark:hover:bg-accent/50'}`}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          props.onActiveBookmarkChange(bookmark.id);
          props.onOpenBookmark(bookmark);
        }}
        className="block max-w-full text-left text-base font-medium text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors truncate pr-6 cursor-pointer"
      >
        {bookmark.title || bookmark.url}
      </button>
      <div className="text-xs text-muted-foreground truncate mt-0.5">{bookmark.url}</div>
      {bookmark.description && (
        <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
          {bookmark.description}
        </div>
      )}
      {bookmark.access_count > 0 && (
        <div className="text-xs text-muted-foreground opacity-60 mt-1">
          {bookmark.access_count} 次访问
        </div>
      )}
      {bookmark.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {bookmark.tags.map((tag) => (
            <Badge key={tag} style={tagColor(tag)}>
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function toggleStar(event: React.MouseEvent<HTMLButtonElement>, props: BookmarkResultItemProps) {
  event.stopPropagation();
  const { bookmark } = props;
  const nextStarred = bookmark.starred_at === null;
  props.onToggleStarred(bookmark, nextStarred);
  if (!props.starredView || nextStarred) return;
  const title = bookmark.title || bookmark.url;
  const displayTitle = title.length > 10 ? `${title.substring(0, 10)}...` : title;
  const id = toast.add({
    title: '已取消星标',
    description: `“${displayTitle}”已从星标列表移除`,
    actionProps: {
      children: '撤销',
      onClick() {
        props.onToggleStarred(bookmark, true);
        toast.close(id);
      },
    },
  });
}
