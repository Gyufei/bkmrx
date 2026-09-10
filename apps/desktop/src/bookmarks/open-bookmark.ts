import { open as openExternal } from '@tauri-apps/plugin-shell';
import type { BookmarkId } from '@/identity';
import { invokeRecordBookmarkAccess } from '@/lib/invoke';

interface OpenableBookmark {
  id: BookmarkId;
  url: string;
}

export async function openBookmark(bookmark: OpenableBookmark): Promise<void> {
  try {
    await openExternal(bookmark.url);
  } catch (error) {
    logFailure('open', bookmark.id, error);
    throw error;
  }

  try {
    await invokeRecordBookmarkAccess(bookmark.id);
  } catch (error) {
    logFailure('record_access', bookmark.id, error);
  }
}

function logFailure(operation: string, bookmarkId: BookmarkId, error: unknown) {
  console.error('bookmark_operation_failed', {
    operation,
    bookmarkId,
    errorType: error instanceof Error ? error.name : typeof error,
  });
}
