import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from "@tailwindcss/vite";
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [svelte(), tailwindcss()],
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
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return;
          if (id.includes('hls.js')) return 'hls';
          if (id.includes('posthog')) return 'posthog';
          if (id.includes('lucide')) return 'lucide';
          return 'vendor';
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
