import { afterEach, describe, expect, it, vi } from 'vitest'
import { API_URL } from './config'
import { createBookmark, findBookmarkByUrl, getTags, parseApiResponse, updateBookmark } from './api'

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
      JSON.stringify({ error: { message: 'Bookmark conflict' } }),
      { status: 409 },
    )
    await expect(parseApiResponse(response)).rejects.toThrow('Bookmark conflict')
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([{ name: 'rust' }]))))
    await expect(getTags()).resolves.toEqual([{ name: 'rust' }])
  })
})
