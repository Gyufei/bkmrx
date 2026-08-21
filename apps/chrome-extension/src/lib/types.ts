export interface Bookmark {
  readonly id: number
  readonly url: string
  readonly title: string
  readonly description: string
  readonly tags: readonly string[]
}

export interface BookmarkPayload {
  readonly url: string
  readonly title: string
  readonly description: string
  readonly tags: readonly string[]
}

export interface Tag {
  readonly name: string
  readonly count: number
}

export interface Translation {
  readonly text: string
  readonly source_language: string
  readonly provider: string
}
