import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from "@tailwindcss/vite";
import { resolve } from 'node:path'

export default defineConfig({
  publicDir: '../desktop/public',
  plugins: [svelte(), tailwindcss()],
  resolve: {
    alias: {
      '@raffi/app': resolve(import.meta.dirname, '../../packages/app'),
      '@raffi/app/': resolve(import.meta.dirname, '../../packages/app/'),
    },
    dedupe: ['svelte'],
  },
  build: {
    outDir: 'android/app/src/main/assets/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
  },
})
