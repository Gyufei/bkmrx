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
      onTagsChange(tagify?.value.map(({ value }) => String(value)) ?? [])
    })

    return () => tagify?.destroy()
  })
</script>

<input bind:this={input} type="text" id="tags" placeholder="输入标签，回车添加，逗号分隔" />
