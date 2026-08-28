import { API_URL } from './config'
import type { Bookmark, BookmarkPayload, Tag, Translation } from './types'

interface ErrorBody {
  readonly error?: {
    readonly code?: unknown
    readonly message?: unknown
    readonly details?: unknown
  }
}

const HEALTH_TIMEOUT_MS = 3_000
const REQUEST_TIMEOUT_MS = 10_000

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
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
    throw new ApiError('暂时无法处理请求，请稍后重试', response.status)
  }

  if (!response.ok) {
    const error = readApiError(body)
    throw new ApiError(error.message ?? '请求失败', response.status, error.code, error.details)
  }
  return body as T
}

function readApiError(body: unknown): {
  readonly code?: string
  readonly message?: string
  readonly details?: unknown
} {
  if (!body || typeof body !== 'object') return {}
  const error = (body as ErrorBody).error
  if (!error || typeof error !== 'object') return {}
  return {
    code: typeof error.code === 'string' ? error.code : undefined,
    message: typeof error.message === 'string' ? error.message : undefined,
    details: error.details,
  }
}

async function request<T>(
  path: string,
  init?: RequestInit,
  expectedEmptyStatuses: readonly number[] = [],
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('请求超时，请稍后重试', 0, 'timeout')
    }
    throw new ApiError('无法连接到 bkmrx，请确认应用已启动', 0, 'network_error')
  } finally {
    clearTimeout(timeoutId)
  }
  if (expectedEmptyStatuses.includes(response.status)) return null
  return parseApiResponse<T>(response)
}

export async function checkHealth(): Promise<void> {
  await request('/api/health', undefined, [], HEALTH_TIMEOUT_MS)
}

export async function findBookmarkByUrl(url: string): Promise<Bookmark | null> {
  return request<Bookmark>(
    `/api/bookmarks/by-url?url=${encodeURIComponent(url)}`,
    undefined,
    [404],
  )
}

export async function createBookmark(payload: BookmarkPayload): Promise<Bookmark> {
  const bookmark = await request<Bookmark>('/api/bookmarks', jsonRequest('POST', payload))
  if (!bookmark) throw new ApiError('创建书签失败，请稍后重试', 204)
  return bookmark
}

export async function updateBookmark(
  id: number,
  payload: BookmarkPayload,
): Promise<Bookmark> {
  const bookmark = await request<Bookmark>(
    `/api/bookmarks/${id}`,
    jsonRequest('PATCH', payload),
  )
  if (!bookmark) throw new ApiError('更新书签失败，请稍后重试', 204)
  return bookmark
}

export async function getTags(): Promise<readonly Tag[]> {
  return (await request<readonly Tag[]>('/api/tags')) ?? []
}

export async function translateDescription(text: string): Promise<Translation> {
  const translation = await request<Translation>(
    '/api/translations',
    jsonRequest('POST', { text }),
  )
  if (!translation) throw new ApiError('翻译服务未返回数据', 204, 'empty_response')
  return translation
}

function jsonRequest(method: 'POST' | 'PATCH', payload: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }
}
