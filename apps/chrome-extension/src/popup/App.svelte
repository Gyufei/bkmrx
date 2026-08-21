<script lang="ts">
  import { onMount } from 'svelte'
  import { checkHealth, createBookmark, findBookmarkByUrl, getTags, updateBookmark } from '../lib/api'
  import { bookmarkPayload, emptyBookmarkForm, formFromBookmark } from '../lib/bookmark'
  import { getActivePage, getPageDescription } from '../lib/chrome'
  import type { Bookmark } from '../lib/types'
  import TagInput from './TagInput.svelte'

  type ViewState = 'checking' | 'disconnected' | 'connected'

  let viewState: ViewState = $state('checking')
  let form = $state(emptyBookmarkForm())
  let existingBookmark: Bookmark | null = $state(null)
  let suggestions: readonly string[] = $state([])
  let submitting = $state(false)
  let errorMessage = $state('')
  let successMessage = $state('')

  const isUpdateMode = $derived(existingBookmark !== null)
  const buttonText = $derived(
    submitting ? '处理中...' : isUpdateMode ? '更新书签' : '添加书签',
  )

  onMount(initialize)

  async function initialize(): Promise<void> {
    try {
      await checkHealth()
    } catch {
      viewState = 'disconnected'
      return
    }

    try {
      const page = await getActivePage()
      if (page) {
        const description = page.id === undefined ? '' : await getPageDescription(page.id)
        form = { url: page.url, title: page.title, description, tags: [] }
      }

      suggestions = (await getTags()).map(({ name }) => name)
      if (form.url) {
        const bookmark = await findBookmarkByUrl(form.url)
        if (bookmark) setExistingBookmark(bookmark)
      }
    } catch (error) {
      errorMessage = messageFromError(error)
    } finally {
      viewState = 'connected'
    }
  }

  function setExistingBookmark(bookmark: Bookmark): void {
    existingBookmark = bookmark
    form = formFromBookmark(bookmark)
  }

  function updateForm(field: 'url' | 'title' | 'description', value: string): void {
    form = { ...form, [field]: value }
  }

  function updateTags(tags: readonly string[]): void {
    form = { ...form, tags: [...tags] }
  }

  async function submit(): Promise<void> {
    if (submitting) return

    let payload
    try {
      payload = bookmarkPayload(form)
    } catch (error) {
      errorMessage = messageFromError(error)
      return
    }

    submitting = true
    errorMessage = ''
    successMessage = ''
    try {
      const wasUpdate = existingBookmark !== null
      const bookmark = existingBookmark
        ? await updateBookmark(existingBookmark.id, payload)
        : await createBookmark(payload)
      successMessage = `书签已${wasUpdate ? '更新' : '添加'} (ID: ${bookmark.id})`
      setExistingBookmark(bookmark)
      if (!wasUpdate) {
        suggestions = (await getTags()).map(({ name }) => name)
      }
    } catch (error) {
      errorMessage = messageFromError(error)
    } finally {
      submitting = false
    }
  }

  function messageFromError(error: unknown): string {
    return error instanceof Error
      ? error.message
      : '无法连接到 bkmrx，请确认应用已启动'
  }
</script>

{#if viewState === 'checking'}
  <div class="view-loading">
    <div class="spinner"></div>
    <p class="loading-text">连接中...</p>
  </div>
{:else if viewState === 'disconnected'}
  <div class="view-disconnected">
    <svg class="disco-icon" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" opacity=".4" />
      <path d="M7 7l10 10" />
      <path d="M7 17 17 7" />
    </svg>
    <h2 class="disco-title">请连接 bkmrx</h2>
    <p class="disco-desc">确保后端应用已启动</p>
  </div>
{:else}
  <div class="view-connected">
    <header class="app-header">
      <h1 class="app-title">添加到 bkmrx</h1>
    </header>

    {#if isUpdateMode}
      <div class="existing-banner">已收藏</div>
    {/if}

    <form onsubmit={(event) => { event.preventDefault(); void submit() }} class="bookmark-form">
      <div class="field">
        <label for="url" class="field-label">URL</label>
        <input type="url" id="url" value={form.url} oninput={(event) => updateForm('url', event.currentTarget.value)} required placeholder="https://example.com" />
      </div>

      <div class="field">
        <label for="title" class="field-label">标题</label>
        <input type="text" id="title" value={form.title} oninput={(event) => updateForm('title', event.currentTarget.value)} placeholder="页面标题" />
      </div>

      <div class="field">
        <label for="tags" class="field-label">标签</label>
        <TagInput tags={form.tags} {suggestions} onTagsChange={updateTags} />
      </div>

      <div class="field">
        <label for="description" class="field-label">描述（可选）</label>
        <textarea id="description" value={form.description} oninput={(event) => updateForm('description', event.currentTarget.value)} rows="2" placeholder="添加备注或描述"></textarea>
      </div>

      <button type="submit" id="submit-btn" disabled={submitting} class:update-mode={isUpdateMode}>
        <span class="btn-text">{buttonText}</span>
      </button>

      {#if errorMessage}
        <div class="status-message error" role="alert">{errorMessage}</div>
      {/if}
      {#if successMessage}
        <div class="status-message success" role="status">{successMessage}</div>
      {/if}
    </form>
  </div>
{/if}
