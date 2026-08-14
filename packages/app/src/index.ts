// @raffi/app
// Main entry point for the shared Raffi application (Svelte)

export { default as App } from './App.svelte';

// Re-export key pieces that shells might want to use directly
export { router } from './lib/stores/router';
export * from './lib/stores/authStore';

// Platform flags
export { getPlatformName, isDesktopPlatform, isWeb } from './lib/platform';
export type { PlatformName } from './lib/platform';
