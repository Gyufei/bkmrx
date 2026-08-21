const rawApiUrl = import.meta.env.VITE_BKMRX_API_URL

function readApiUrl(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('VITE_BKMRX_API_URL must use http or https')
  }
  return url.toString().replace(/\/$/, '')
}

export const API_URL = readApiUrl(rawApiUrl)
