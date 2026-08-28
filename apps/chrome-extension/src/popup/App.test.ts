import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.svelte'

const api = vi.hoisted(() => ({
  checkHealth: vi.fn(),
  createBookmark: vi.fn(),
  findBookmarkByUrl: vi.fn(),
  getTags: vi.fn(),
  translateDescription: vi.fn(),
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

  it('retries the connection without reopening the popup', async () => {
    api.checkHealth
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)
    api.getTags.mockResolvedValue([])
    chromeAdapter.getActivePage.mockResolvedValue(null)
    render(App)

    await fireEvent.click(await screen.findByRole('button', { name: '重试' }))

    expect(await screen.findByRole('button', { name: '添加书签' })).toBeInTheDocument()
    expect(api.checkHealth).toHaveBeenCalledTimes(2)
  })

  it('does not fetch or translate a description for an existing bookmark', async () => {
    api.checkHealth.mockResolvedValue(undefined)
    api.getTags.mockResolvedValue([])
    api.findBookmarkByUrl.mockResolvedValue({
      id: 1,
      url: 'https://example.com',
      title: 'Saved',
      description: '已保存',
      tags: ['saved'],
    })
    chromeAdapter.getActivePage.mockResolvedValue({ id: 1, url: 'https://example.com', title: 'Example' })
    render(App)

    expect(await screen.findByText('已收藏')).toBeInTheDocument()
    expect(chromeAdapter.getPageDescription).not.toHaveBeenCalled()
    expect(api.translateDescription).not.toHaveBeenCalled()
  })

  it('shows the bookmark form after a successful connection', async () => {
    api.checkHealth.mockResolvedValue(undefined)
    api.getTags.mockResolvedValue([])
    chromeAdapter.getActivePage.mockResolvedValue(null)
    render(App)

    expect(await screen.findByRole('button', { name: '添加书签' })).toBeInTheDocument()
    expect(screen.getByLabelText('URL')).toBeInTheDocument()
  })

  it('shows translation progress and applies an English translation', async () => {
    api.checkHealth.mockResolvedValue(undefined)
    api.getTags.mockResolvedValue([])
    api.findBookmarkByUrl.mockResolvedValue(null)
    chromeAdapter.getActivePage.mockResolvedValue({ id: 1, url: 'https://example.com', title: 'Example' })
    chromeAdapter.getPageDescription.mockResolvedValue('An English description')
    let resolveTranslation!: (value: unknown) => void
    api.translateDescription.mockReturnValue(new Promise((resolve) => { resolveTranslation = resolve }))
    render(App)

    expect(await screen.findByLabelText('正在翻译描述')).toBeInTheDocument()
    resolveTranslation({ text: '一段中文描述', source_language: 'auto', provider: 'niutrans' })
    expect(await screen.findByDisplayValue('一段中文描述')).toBeInTheDocument()
    expect(screen.getByLabelText('描述（可选）')).toHaveAttribute('rows', '3')
  })

  it('keeps English text and shows an error icon when translation fails', async () => {
    api.checkHealth.mockResolvedValue(undefined)
    api.getTags.mockResolvedValue([])
    api.findBookmarkByUrl.mockResolvedValue(null)
    api.translateDescription.mockRejectedValue(new Error('failed'))
    chromeAdapter.getActivePage.mockResolvedValue({ id: 1, url: 'https://example.com', title: 'Example' })
    chromeAdapter.getPageDescription.mockResolvedValue('An English description')
    render(App)

    expect(await screen.findByLabelText('翻译失败')).toHaveAttribute('title', '翻译失败')
    expect(screen.getByDisplayValue('An English description')).toBeInTheDocument()
  })

  it('ignores a pending translation when saving', async () => {
    api.checkHealth.mockResolvedValue(undefined)
    api.getTags.mockResolvedValue([])
    api.findBookmarkByUrl.mockResolvedValue(null)
    api.createBookmark.mockResolvedValue({ id: 1, url: 'https://example.com', title: 'Example', description: 'An English description', tags: [] })
    chromeAdapter.getActivePage.mockResolvedValue({ id: 1, url: 'https://example.com', title: 'Example' })
    chromeAdapter.getPageDescription.mockResolvedValue('An English description')
    let resolveTranslation!: (value: unknown) => void
    api.translateDescription.mockReturnValue(new Promise((resolve) => { resolveTranslation = resolve }))
    render(App)

    await fireEvent.click(await screen.findByRole('button', { name: '添加书签' }))
    expect(api.createBookmark).toHaveBeenCalledWith(expect.objectContaining({ description: 'An English description' }))
    resolveTranslation({ text: '不应写入', source_language: 'en', provider: 'niutrans' })
    expect(screen.queryByDisplayValue('不应写入')).not.toBeInTheDocument()
  })
})
