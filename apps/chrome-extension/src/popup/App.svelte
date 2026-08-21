<script lang="ts">
  import { onMount } from 'svelte'
  import { checkHealth, createBookmark, findBookmarkByUrl, getTags, translateDescription, updateBookmark } from '../lib/api'
  import { bookmarkPayload, emptyBookmarkForm, formFromBookmark } from '../lib/bookmark'
  import { getActivePage, getPageDescription } from '../lib/chrome'
  import type { Bookmark } from '../lib/types'
  import { isForeignTranslationCandidate } from '../lib/translation'
  import TagInput from './TagInput.svelte'

  type ViewState = 'checking' | 'disconnected' | 'connected'

  let viewState: ViewState = $state('checking')
  let form = $state(emptyBookmarkForm())
  let existingBookmark: Bookmark | null = $state(null)
  let suggestions: readonly string[] = $state([])
  let submitting = $state(false)
  let errorMessage = $state('')
  let successMessage = $state('')
  let translatingDescription = $state(false)
  let translationError = $state(false)
  let translationRequestId = 0

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
        form = { url: page.url, title: page.title, description: '', tags: [] }
        const bookmark = await findBookmarkByUrl(page.url)
        if (bookmark) {
          setExistingBookmark(bookmark)
        } else if (page.id !== undefined) {
          const description = await getPageDescription(page.id)
          form = { ...form, description }
          void translateFetchedDescription(description)
        }
      }
      suggestions = (await getTags()).map(({ name }) => name)
    } catch (error) {
      errorMessage = messageFromError(error)
    } finally {
      viewState = 'connected'
    }
  }

  function setExistingBookmark(bookmark: Bookmark): void {
    cancelDescriptionTranslation()
    existingBookmark = bookmark
    form = formFromBookmark(bookmark)
  }

  function updateForm(field: 'url' | 'title' | 'description', value: string): void {
    if (field === 'description') cancelDescriptionTranslation()
    form = { ...form, [field]: value }
  }

  async function translateFetchedDescription(description: string): Promise<void> {
    if (!isForeignTranslationCandidate(description)) return

    const requestId = ++translationRequestId
    translatingDescription = true
    translationError = false
    try {
      const translation = await translateDescription(description)
      if (
        requestId === translationRequestId
        && form.description === description
      ) {
        form = { ...form, description: translation.text }
      }
    } catch {
      if (requestId === translationRequestId && form.description === description) {
        translationError = true
      }
    } finally {
      if (requestId === translationRequestId) translatingDescription = false
    }
  }

  function cancelDescriptionTranslation(): void {
    translationRequestId += 1
    translatingDescription = false
    translationError = false
  }

  function updateTags(tags: readonly string[]): void {
    form = { ...form, tags: [...tags] }
  }

  function autoGrow(node: HTMLTextAreaElement, _value: string) {
    const resize = () => {
      node.style.height = 'auto'
      const borderHeight = node.offsetHeight - node.clientHeight
      node.style.height = `${node.scrollHeight + borderHeight}px`
    }
    resize()
    return { update: resize }
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

    cancelDescriptionTranslation()

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
      : '发生未知错误，请稍后重试'
  }

  function retryConnection(): void {
    errorMessage = ''
    viewState = 'checking'
    void initialize()
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
    <button type="button" class="retry-button" onclick={retryConnection}>重试</button>
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
        <div class="description-control">
          <textarea id="description" value={form.description} oninput={(event) => updateForm('description', event.currentTarget.value)} use:autoGrow={form.description} rows="3" placeholder="添加备注或描述"></textarea>
          {#if translatingDescription}
            <span class="translation-spinner" role="status" aria-label="正在翻译描述"></span>
          {:else if translationError}
            <button class="translation-error" type="button" aria-label="翻译 API 调用失败" title="翻译 API 调用失败">!</button>
          {/if}
        </div>
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
