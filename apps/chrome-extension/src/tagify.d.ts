declare module '@yaireo/tagify' {
  interface TagifyValue {
    readonly value: unknown
  }

  interface TagifyOptions {
    readonly whitelist?: readonly string[]
    readonly enforceWhitelist?: boolean
    readonly delimiters?: string
    readonly maxTags?: number
    readonly focusable?: boolean
    readonly dropdown?: {
      readonly enabled?: number
      readonly maxItems?: number
      readonly closeOnSelect?: boolean
      readonly classname?: string
    }
  }

  export default class Tagify {
    constructor(input: HTMLInputElement, options?: TagifyOptions)
    readonly value: readonly TagifyValue[]
    readonly settings: {
      whitelist: string[]
    }
    addTags(tags: readonly string[]): void
    removeAllTags(): void
    on(event: 'change', callback: () => void): void
    destroy(): void
  }
}
