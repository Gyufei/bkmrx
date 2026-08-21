import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import packageJson from './package.json'

function normalizedApiUrl(value: string | undefined): URL {
  if (!value) {
    throw new Error('VITE_BKMRX_API_URL is required')
  }

  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('VITE_BKMRX_API_URL must use http or https')
  }

  return url
}

function extensionManifest(apiUrl: URL): Plugin {
  return {
    name: 'bkmr-ext-manifest',
    generateBundle() {
      const manifest = {
        manifest_version: 3,
        name: 'bkmr-ext',
        version: packageJson.version,
        description: '通过 bkmrx 快速添加当前页面为书签',
        icons: {
          16: 'icons/icon16.png',
          48: 'icons/icon48.png',
          128: 'icons/icon128.png',
        },
        action: {
          default_popup: 'popup/index.html',
          default_title: '添加到 bkmrx',
        },
        content_security_policy: {
          extension_pages: "script-src 'self'; object-src 'self'",
        },
        permissions: ['activeTab', 'scripting'],
        host_permissions: [`${apiUrl.origin}/*`],
      }

      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      })
    },
    closeBundle() {
      const sourceDir = resolve(import.meta.dirname, 'icons')
      const outputDir = resolve(import.meta.dirname, 'dist/icons')
      mkdirSync(outputDir, { recursive: true })
      for (const fileName of ['icon16.png', 'icon48.png', 'icon128.png']) {
        copyFileSync(resolve(sourceDir, fileName), resolve(outputDir, fileName))
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, 'VITE_')
  const apiUrl = normalizedApiUrl(env.VITE_BKMRX_API_URL)

  return {
    root: resolve(import.meta.dirname, 'src'),
    envDir: import.meta.dirname,
    base: './',
    plugins: [svelte(), extensionManifest(apiUrl)],
    resolve: {
      conditions: ['browser'],
    },
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(import.meta.dirname, 'src/popup/index.html'),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: [resolve(import.meta.dirname, 'src/test/setup.ts')],
    },
  }
})
