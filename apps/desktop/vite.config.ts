// @ts-nocheck
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import muteWarningsPlugin from './mute-warnings-plugin';

const host = process.env.TAURI_DEV_HOST;
const warningsToIgnore = [
  ['SOURCEMAP_ERROR', "Can't resolve original location of error"],
  ['INVALID_ANNOTATION', 'contains an annotation that Rollup cannot interpret'],
];

const embeddedRuntimeContractFixture = {
  name: 'embedded-runtime-contract-fixture',
  configureServer(server) {
    server.middlewares.use('/embedded-runtime-contract.html', (_request, response) => {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(
        '<!doctype html><html><body data-remote-contract="ready">remote ready</body></html>',
      );
    });
  },
};

export default defineConfig(async () => ({
  plugins: [
    embeddedRuntimeContractFixture,
    tailwindcss(),
    react(),
    muteWarningsPlugin(warningsToIgnore),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}));
