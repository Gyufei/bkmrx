import type { Bookmark, BookmarkPayload } from './types'

export interface BookmarkForm {
  readonly url: string
  readonly title: string
  readonly description: string
  readonly tags: readonly string[]
}

export function emptyBookmarkForm(): BookmarkForm {
  return { url: '', title: '', description: '', tags: [] }
}

export function formFromBookmark(bookmark: Bookmark): BookmarkForm {
  return {
    url: bookmark.url,
    title: bookmark.title,
    description: bookmark.description ?? '',
    tags: [...bookmark.tags],
  }
}

export function bookmarkPayload(form: BookmarkForm): BookmarkPayload {
  const url = form.url.trim()
  if (!url) throw new Error('请输入 URL')
  return {
    url,
    title: form.title.trim() || url,
    description: form.description.trim(),
    tags: form.tags.map((tag) => tag.trim()).filter(Boolean),
  }
}
