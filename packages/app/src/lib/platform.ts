/**
 * Platform abstraction for Raffi.
 *
 * This allows the same @raffi/app code to run on Desktop (Electron),
 * Web (browser), and eventually other shells with different capabilities.
 */

export type PlatformName = 'desktop' | 'web' | 'mobile';

export interface PlatformCapabilities {
  name: PlatformName;
  canOpenExternal: boolean;
  canSaveFiles: boolean;
  canAccessLocalFiles: boolean;
  supportsNativePlayer: boolean; // vs pure <video>
  supportsTorrent: boolean;
  supportsDiscordRPC: boolean;
  supportsWindowControls: boolean;
  supportsUpdates: boolean;
}

export interface RaffiPlatform {
  name: PlatformName;
  capabilities: PlatformCapabilities;

  // Actions
  openExternal?: (url: string) => Promise<void> | void;
  saveFile?: (suggestedName: string, data: Blob | string) => Promise<string | null>;
  showConfirm?: (message: string, title?: string) => Promise<boolean>;

  // Optional hooks
  onAuthCallback?: (handler: (payload: any) => void) => () => void;
}

const isDesktop = typeof window !== 'undefined' && !!(window as any).electronAPI;

function getDesktopPlatform(): RaffiPlatform {
  const api = (window as any).electronAPI;

  return {
    name: 'desktop',
    capabilities: {
      name: 'desktop',
      canOpenExternal: true,
      canSaveFiles: true,
      canAccessLocalFiles: true,
      supportsNativePlayer: true,
      supportsTorrent: true,
      supportsDiscordRPC: true,
      supportsWindowControls: true,
      supportsUpdates: true,
    },
    openExternal: api?.openExternal,
    showConfirm: api?.showConfirmDialog,
    onAuthCallback: (handler) => {
      // Ave + Trakt callbacks
      const unsubAve = api?.onAveAuthCallback?.(handler);
      const unsubTrakt = api?.onTraktAuthCallback?.(handler);
      return () => {
        unsubAve?.();
        unsubTrakt?.();
      };
    },
  };
}

function getWebPlatform(): RaffiPlatform {
  return {
    name: 'web',
    capabilities: {
      name: 'web',
      canOpenExternal: true,
      canSaveFiles: false, // For now — can improve with File System Access API later
      canAccessLocalFiles: false,
      supportsNativePlayer: false,
      supportsTorrent: false,
      supportsDiscordRPC: false,
      supportsWindowControls: false,
      supportsUpdates: false,
    },
    openExternal: (url: string) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    showConfirm: async (message: string) => {
      return window.confirm(message);
    },
  };
}

export function getPlatform(): RaffiPlatform {
  if (isDesktop) {
    return getDesktopPlatform();
  }
  return getWebPlatform();
}

export const platform = getPlatform();

// Convenience exports
export const isWeb = platform.name === 'web';
export const isDesktopPlatform = platform.name === 'desktop';
