/**
 * Platform abstraction types for Raffi.
 *
 * Desktop exposes a rich `electronAPI` via preload.
 * Web provides a lighter implementation + PWA capabilities.
 * Mobile has its own native bridge.
 */

export interface RaffiPlatform {
  name: 'desktop' | 'web' | 'mobile';

  // Common capabilities that all platforms should implement where possible
  openExternal?: (url: string) => Promise<void> | void;

  // Add more over time (clipboard, notifications, fullscreen, etc.)
}
