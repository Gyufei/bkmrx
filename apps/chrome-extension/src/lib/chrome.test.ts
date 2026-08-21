import { afterEach, describe, expect, it, vi } from 'vitest'
import { getActivePage, getPageDescription } from './chrome'

afterEach(() => vi.unstubAllGlobals())

describe('Chrome adapter', () => {
  it('returns the active page without exposing the Chrome tab object', async () => {
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn().mockResolvedValue([{ id: 7, url: 'https://example.com', title: 'Example' }]) },
    })
    await expect(getActivePage()).resolves.toEqual({ id: 7, url: 'https://example.com', title: 'Example' })
  })

  it('returns null when the active tab has no URL', async () => {
    vi.stubGlobal('chrome', { tabs: { query: vi.fn().mockResolvedValue([{}]) } })
    await expect(getActivePage()).resolves.toBeNull()
  })

  it('returns an empty description when script injection is unavailable', async () => {
    vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    vi.stubGlobal('chrome', {
      scripting: { executeScript: vi.fn().mockRejectedValue(new Error('Cannot access page')) },
    })
    await expect(getPageDescription(7)).resolves.toBe('')
  })
})
