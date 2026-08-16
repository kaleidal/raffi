import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from "@tailwindcss/vite";
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    {
      name: 'raffi-csp',
      transformIndexHtml: (html) => html.replace(
        '__RAFFI_DEV_EVAL__',
        command === 'serve' ? "'unsafe-eval'" : '',
      ),
    },
    svelte(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@raffi/app': resolve(import.meta.dirname, '../../packages/app'),
      '@raffi/app/': resolve(import.meta.dirname, '../../packages/app/'),
    },
    dedupe: ['svelte'],
  },
  optimizeDeps: {
    include: ['@raffi/app'],
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            { name: 'hls', test: 'node_modules/hls.js/' },
            { name: 'posthog', test: 'node_modules/posthog-js/' },
            { name: 'mediabunny-codecs', test: 'node_modules/@mediabunny/' },
            { name: 'mediabunny', test: 'node_modules/mediabunny/' },
            { name: 'lucide', test: 'node_modules/lucide-svelte/' },
          ],
        },
      },
    },
  },
  server: {
    port: 43173,
    strictPort: true,
    fs: {
      // Allow serving files from the monorepo root
      allow: ['../..'],
    },
  },
}))
