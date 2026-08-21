import { cleanup, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.svelte'

const api = vi.hoisted(() => ({
  checkHealth: vi.fn(),
  createBookmark: vi.fn(),
  findBookmarkByUrl: vi.fn(),
  getTags: vi.fn(),
  updateBookmark: vi.fn(),
}))

const chromeAdapter = vi.hoisted(() => ({
  getActivePage: vi.fn(),
  getPageDescription: vi.fn(),
}))

vi.mock('../lib/api', () => api)
vi.mock('../lib/chrome', () => chromeAdapter)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('popup', () => {
  it('shows a disconnected state when the desktop API is unavailable', async () => {
    api.checkHealth.mockRejectedValue(new Error('offline'))
    render(App)

    expect(await screen.findByText('请连接 bkmrx')).toBeInTheDocument()
  })

  it('shows the bookmark form after a successful connection', async () => {
    api.checkHealth.mockResolvedValue(undefined)
    api.getTags.mockResolvedValue([])
    chromeAdapter.getActivePage.mockResolvedValue(null)
    render(App)

    expect(await screen.findByRole('button', { name: '添加书签' })).toBeInTheDocument()
    expect(screen.getByLabelText('URL')).toBeInTheDocument()
  })
})
