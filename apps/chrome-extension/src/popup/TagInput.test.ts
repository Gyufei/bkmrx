import { cleanup, render } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TagInput from './TagInput.svelte'

const tagifyMock = vi.hoisted(() => {
  const instances: MockTagify[] = []

  class MockTagify {
    value: Array<{ value: string }> = []
    settings: { whitelist: string[] }
    private changeHandler?: () => void

    constructor(_input: HTMLInputElement, settings: { whitelist: string[] }) {
      this.settings = settings
      instances.push(this)
    }

    addTags(tags: readonly string[]): void {
      this.value = tags.map((value) => ({ value }))
      this.changeHandler?.()
    }

    removeAllTags(): void {
      this.value = []
      this.changeHandler?.()
    }

    on(_event: string, handler: () => void): void {
      this.changeHandler = handler
    }

    destroy(): void {}
  }

  return { instances, MockTagify }
})

vi.mock('@yaireo/tagify', () => ({ default: tagifyMock.MockTagify }))

afterEach(() => {
  cleanup()
  tagifyMock.instances.length = 0
})

describe('TagInput', () => {
  it('synchronizes changed tags and suggestions without reporting them as user edits', async () => {
    const onTagsChange = vi.fn()
    const view = render(TagInput, {
      tags: ['before'],
      suggestions: ['old'],
      onTagsChange,
    })
    const tagify = tagifyMock.instances[0]

    await view.rerender({
      tags: ['after'],
      suggestions: ['new'],
      onTagsChange,
    })

    expect(tagify.value).toEqual([{ value: 'after' }])
    expect(tagify.settings.whitelist).toEqual(['new'])
    expect(onTagsChange).not.toHaveBeenCalled()
  })
})
