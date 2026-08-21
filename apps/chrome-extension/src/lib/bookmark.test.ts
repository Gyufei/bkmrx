import { describe, expect, it } from 'vitest'
import { bookmarkPayload, formFromBookmark } from './bookmark'

describe('bookmark form', () => {
  it('maps every editable field from an existing bookmark', () => {
    expect(formFromBookmark({
      id: 42,
      url: 'https://example.com/',
      title: 'Saved title',
      description: '',
      tags: ['one', 'two'],
    })).toEqual({
      url: 'https://example.com/',
      title: 'Saved title',
      description: '',
      tags: ['one', 'two'],
    })
  })

  it('trims form values and falls back to the URL for an empty title', () => {
    expect(bookmarkPayload({
      url: ' https://example.com/new ',
      title: ' ',
      description: ' 中文描述 ',
      tags: [' saved-tag ', ''],
    })).toEqual({
      url: 'https://example.com/new',
      title: 'https://example.com/new',
      description: '中文描述',
      tags: ['saved-tag'],
    })
  })

  it('rejects an empty URL', () => {
    expect(() => bookmarkPayload({ url: ' ', title: '', description: '', tags: [] }))
      .toThrow('请输入 URL')
  })
})
