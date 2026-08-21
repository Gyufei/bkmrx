<script lang="ts">
  import Tagify from '@yaireo/tagify'
  import '@yaireo/tagify/dist/tagify.css'
  import { onMount } from 'svelte'

  let {
    tags = [],
    suggestions = [],
    onTagsChange,
  }: {
    tags?: readonly string[]
    suggestions?: readonly string[]
    onTagsChange: (tags: readonly string[]) => void
  } = $props()

  let input: HTMLInputElement
  let tagify: Tagify | undefined
  let syncingFromProps = false

  $effect(() => {
    const incomingTags = [...tags]
    const incomingSuggestions = [...suggestions]
    if (!tagify) return

    tagify.settings.whitelist = incomingSuggestions
    const currentTags = tagify.value.map(({ value }) => String(value))
    if (sameTags(currentTags, incomingTags)) return

    syncingFromProps = true
    try {
      tagify.removeAllTags()
      tagify.addTags(incomingTags)
    } finally {
      syncingFromProps = false
    }
  })

  onMount(() => {
    tagify = new Tagify(input, {
      whitelist: [...suggestions],
      enforceWhitelist: false,
      delimiters: ',',
      maxTags: 50,
      focusable: false,
      dropdown: {
        enabled: 0,
        maxItems: 20,
        closeOnSelect: false,
        classname: 'tags-look',
      },
    })
    tagify.addTags([...tags])
    tagify.on('change', () => {
      if (syncingFromProps) return
      onTagsChange(tagify?.value.map(({ value }) => String(value)) ?? [])
    })

    return () => tagify?.destroy()
  })

  function sameTags(left: readonly string[], right: readonly string[]): boolean {
    return left.length === right.length && left.every((tag, index) => tag === right[index])
  }
</script>

<input bind:this={input} type="text" id="tags" placeholder="输入标签，回车添加，逗号分隔" />
