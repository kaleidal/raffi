import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from "@tailwindcss/vite";
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [svelte(), tailwindcss()],
  resolve: {
    alias: {
      '@raffi/app': resolve(__dirname, '../../packages/app'),
      '@raffi/app/': resolve(__dirname, '../../packages/app/'),
    },
    dedupe: ['svelte'],
  },
  optimizeDeps: {
    include: ['@raffi/app'],
    exclude: [],
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
  server: {
    fs: {
      // Allow serving files from the monorepo root
      allow: ['../..'],
    },
  },
})
