import { API_URL } from './config'
import type { Bookmark, BookmarkPayload, Tag } from './types'

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function parseApiResponse<T>(response: Response): Promise<T | null> {
  if (response.status === 204) return null

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ApiError('服务端返回了无效响应', response.status)
  }

  if (!response.ok) {
    const message = readErrorMessage(body) ?? '请求失败'
    throw new ApiError(message, response.status)
  }
  return body as T
}

function readErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('error' in body)) return undefined
  const error = body.error
  if (!error || typeof error !== 'object' || !('message' in error)) return undefined
  return typeof error.message === 'string' ? error.message : undefined
}

async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(`${API_URL}${path}`, init)
  return parseApiResponse<T>(response)
}

export async function checkHealth(): Promise<void> {
  await request('/api/health')
}

export async function findBookmarkByUrl(url: string): Promise<Bookmark | null> {
  const response = await fetch(
    `${API_URL}/api/bookmarks/by-url?url=${encodeURIComponent(url)}`,
  )
  if (response.status === 404) return null
  return parseApiResponse<Bookmark>(response)
}

export async function createBookmark(payload: BookmarkPayload): Promise<Bookmark> {
  const bookmark = await request<Bookmark>('/api/bookmarks', parseJSONBody('POST', payload))
  if (!bookmark) throw new ApiError('创建书签时服务端未返回数据', 204)
  return bookmark
}

export async function updateBookmark(
  id: number,
  payload: BookmarkPayload,
): Promise<Bookmark> {
  const bookmark = await request<Bookmark>(
    `/api/bookmarks/${id}`,
    parseJSONBody('PATCH', payload),
  )
  if (!bookmark) throw new ApiError('更新书签时服务端未返回数据', 204)
  return bookmark
}

export async function getTags(): Promise<readonly Tag[]> {
  return (await request<readonly Tag[]>('/api/tags')) ?? []
}

function parseJSONBody(method: 'POST' | 'PATCH', payload: BookmarkPayload): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }
}
