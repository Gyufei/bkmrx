import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_URL } from './config'
import { checkHealth, createBookmark, findBookmarkByUrl, getTags, parseApiResponse, translateDescription, updateBookmark } from './api'

const savedBookmark = {
  id: 42,
  url: 'https://example.com/',
  title: 'Saved title',
  description: 'Saved description',
  tags: ['saved-tag'],
}

afterEach(() => vi.unstubAllGlobals())

describe('API client', () => {
  it('returns JSON bodies and handles 204 responses', async () => {
    expect(await parseApiResponse(new Response(JSON.stringify({ status: 'ok' })))).toEqual({ status: 'ok' })
    expect(await parseApiResponse(new Response(null, { status: 204 }))).toBeNull()
  })

  it('exposes API error messages', async () => {
    const response = new Response(
      JSON.stringify({ error: { code: 'bookmark_url_conflict', message: 'Bookmark conflict' } }),
      { status: 409 },
    )
    await expect(parseApiResponse(response.clone())).rejects.toThrow('Bookmark conflict')
    await expect(parseApiResponse(response)).rejects.toMatchObject({
      code: 'bookmark_url_conflict',
      status: 409,
    })
  })

  it('treats a missing bookmark as an expected null result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 404 })))
    await expect(findBookmarkByUrl('https://new.example')).resolves.toBeNull()
  })

  it('creates and updates bookmarks with the expected requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(savedBookmark), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(savedBookmark)))
    vi.stubGlobal('fetch', fetchMock)
    const payload = { url: savedBookmark.url, title: savedBookmark.title, description: '', tags: ['saved-tag'] }

    await expect(createBookmark(payload)).resolves.toEqual(savedBookmark)
    await expect(updateBookmark(42, payload)).resolves.toEqual(savedBookmark)
    expect(fetchMock).toHaveBeenNthCalledWith(1, `${API_URL}/api/bookmarks`, expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, `${API_URL}/api/bookmarks/42`, expect.objectContaining({ method: 'PATCH' }))
  })

  it('returns tag suggestions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{ name: 'rust', count: 3 }]))))
    await expect(getTags()).resolves.toEqual([{ name: 'rust', count: 3 }])
  })

  it('uses the shared JSON request path for translations', async () => {
    const translation = { text: '你好', source_language: 'en', provider: 'niutrans' }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(translation)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(translateDescription('Hello')).resolves.toEqual(translation)
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/api/translations`,
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ text: 'Hello' }) }),
    )
  })

  it('normalizes network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await expect(getTags()).rejects.toEqual(
      expect.objectContaining({ code: 'network_error', status: 0 }),
    )
  })

  it('aborts a health check that exceeds its timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => (
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'))
        })
      })
    )))

    const rejection = expect(checkHealth()).rejects.toMatchObject({ code: 'timeout', status: 0 })
    await vi.advanceTimersByTimeAsync(3_000)
    await rejection
    vi.useRealTimers()
  })
})
