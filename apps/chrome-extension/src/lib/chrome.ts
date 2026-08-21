export interface ActivePage {
  readonly id: number | undefined
  readonly url: string
  readonly title: string
}

export async function getActivePage(): Promise<ActivePage | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) return null
  return { id: tab.id, url: tab.url, title: tab.title ?? '' }
}

export async function getPageDescription(tabId: number): Promise<string> {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const meta =
          document.querySelector<HTMLMetaElement>('meta[property="og:description"]') ??
          document.querySelector<HTMLMetaElement>('meta[name="description"]') ??
          document.querySelector<HTMLMetaElement>('meta[property="twitter:description"]')
        return meta?.content.trim() ?? ''
      },
    })
    return typeof injection?.result === 'string' ? injection.result : ''
  } catch (error) {
    console.debug('Unable to read the active page description', error)
    return ''
  }
}
