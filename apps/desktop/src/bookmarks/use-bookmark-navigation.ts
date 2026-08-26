import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useHotkeys } from '@tanstack/react-hotkeys';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import type { Bookmark } from '@/types';
import { toast } from '@/components/ui/toast';
import { invokeRecordBookmarkAccess } from '@/lib/invoke';

interface Options {
  bookmarks: Bookmark[];
  singleKeyLocked: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
}

export function useBookmarkNavigation({ bookmarks, singleKeyLocked, searchInputRef }: Options) {
  const [previewBookmark, setPreviewBookmark] = useState<Bookmark | null>(null);
  const [activeBookmarkId, setActiveBookmarkId] = useState<number | null>(null);
  const bookmarkElementsRef = useRef(new Map<number, HTMLElement>());
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const activeBookmarkIndex = bookmarks.findIndex((bookmark) => bookmark.id === activeBookmarkId);
  const activeBookmark = activeBookmarkIndex >= 0 ? bookmarks[activeBookmarkIndex] : null;
  useEffect(() => {
    setActiveBookmarkId((currentId) =>
      bookmarks.length === 0
        ? null
        : currentId !== null && bookmarks.some((bookmark) => bookmark.id === currentId)
          ? currentId
          : bookmarks[0].id,
    );
  }, [bookmarks]);
  useEffect(() => {
    if (activeBookmarkId !== null)
      bookmarkElementsRef.current.get(activeBookmarkId)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeBookmarkId]);
  const recordAccess = useCallback(async (bookmark: Bookmark) => {
    try {
      await invokeRecordBookmarkAccess(bookmark.id);
    } catch {
      console.error('Failed to record bookmark access');
    }
  }, []);
  const openBookmark = useCallback(
    async (bookmark: Bookmark) => {
      try {
        await openExternal(bookmark.url);
        void recordAccess(bookmark);
      } catch {
        toast.add({ type: 'error', title: '无法打开链接', description: bookmark.url });
      }
    },
    [recordAccess],
  );
  const previewBookmarkFrom = useCallback(
    async (bookmark: Bookmark, trigger: HTMLElement) => {
      let protocol = '';
      try {
        protocol = new URL(bookmark.url).protocol;
      } catch {
        protocol = '';
      }
      if (protocol === 'http:' || protocol === 'https:') {
        previewTriggerRef.current = trigger;
        setPreviewBookmark(bookmark);
        void recordAccess(bookmark);
        return;
      }
      await openBookmark(bookmark);
    },
    [openBookmark, recordAccess],
  );
  const setPreviewOpen = useCallback((open: boolean) => {
    if (open) return;
    setPreviewBookmark(null);
    if (previewTriggerRef.current?.isConnected) previewTriggerRef.current.focus();
    previewTriggerRef.current = null;
  }, []);
  const registerBookmarkElement = useCallback((id: number, element: HTMLElement | null) => {
    if (element) bookmarkElementsRef.current.set(id, element);
    else bookmarkElementsRef.current.delete(id);
  }, []);
  const moveActiveBookmark = useCallback(
    (offset: -1 | 1) => {
      if (bookmarks.length === 0) return;
      const currentIndex = Math.max(activeBookmarkIndex, 0);
      const nextIndex = Math.min(Math.max(currentIndex + offset, 0), bookmarks.length - 1);
      setActiveBookmarkId(bookmarks[nextIndex].id);
    },
    [activeBookmarkIndex, bookmarks],
  );
  useHotkeys([
    {
      hotkey: '/',
      callback: () => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      },
      options: {
        enabled: !singleKeyLocked && previewBookmark === null,
        ignoreInputs: true,
        meta: { name: '搜索书签', description: '聚焦书签搜索框' },
      },
    },
    {
      hotkey: 'J',
      callback: () => moveActiveBookmark(1),
      options: {
        enabled: !singleKeyLocked && previewBookmark === null && bookmarks.length > 0,
        ignoreInputs: true,
        meta: { name: '下一条书签', description: '高亮下一条书签' },
      },
    },
    {
      hotkey: 'K',
      callback: () => moveActiveBookmark(-1),
      options: {
        enabled: !singleKeyLocked && previewBookmark === null && bookmarks.length > 0,
        ignoreInputs: true,
        meta: { name: '上一条书签', description: '高亮上一条书签' },
      },
    },
    {
      hotkey: 'P',
      callback: () => {
        if (!activeBookmark) return;
        const trigger = bookmarkElementsRef.current.get(activeBookmark.id);
        if (trigger) void previewBookmarkFrom(activeBookmark, trigger);
      },
      options: {
        enabled: !singleKeyLocked && previewBookmark === null && activeBookmark !== null,
        ignoreInputs: true,
        requireReset: true,
        meta: { name: '预览书签', description: '预览当前书签' },
      },
    },
    {
      hotkey: 'X',
      callback: () => setPreviewOpen(false),
      options: {
        enabled: previewBookmark !== null,
        ignoreInputs: true,
        requireReset: true,
        meta: { name: '关闭预览', description: '关闭当前书签预览' },
      },
    },
    {
      hotkey: 'O',
      callback: () => {
        if (activeBookmark) void openBookmark(activeBookmark);
      },
      options: {
        enabled: !singleKeyLocked && previewBookmark === null && activeBookmark !== null,
        ignoreInputs: true,
        requireReset: true,
        meta: { name: '打开书签', description: '在浏览器打开当前书签' },
      },
    },
  ]);
  return {
    previewBookmark,
    activeBookmarkId,
    setActiveBookmarkId,
    openBookmark,
    previewBookmarkFrom,
    setPreviewOpen,
    registerBookmarkElement,
  };
}
