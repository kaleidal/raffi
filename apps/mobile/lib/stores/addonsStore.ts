import { create } from 'zustand';
import { addAddon, getAddons, removeAddon } from '../db';
import type { Addon } from '../types';

// Helper to check if addon has stream resource
function addonHasStreamResource(addon: any): boolean {
  const resources = addon?.manifest?.resources;
  if (!Array.isArray(resources)) return false;
  return resources.some(
    (resource: any) =>
      resource === 'stream' ||
      (resource && typeof resource === 'object' && resource.name === 'stream')
  );
}

// Default addons - only include addons with stream capability
const DEFAULT_ADDONS: Addon[] = [
  {
    transport_url: 'https://torrentio.strem.fun',
    addon_id: 'torrentio',
    manifest: {
      id: 'torrentio',
      name: 'Torrentio',
      description: 'Torrent streams from popular sources',
      version: '1.0.0',
      types: ['movie', 'series'],
      catalogs: [],
      resources: ['stream'],
    },
    flags: {},
  } as Addon,
];

interface AddonsState {
  addons: Addon[];
  selectedAddon: string | null;
  loading: boolean;
  error: string | null;
  fetchAddons: () => Promise<void>;
  installAddon: (addon: Omit<Addon, 'user_id' | 'added_at'>) => Promise<void>;
  uninstallAddon: (transportUrl: string) => Promise<void>;
  removeAddon: (transportUrl: string) => Promise<void>;
  selectAddon: (transportUrl: string) => void;
  clearError: () => void;
}

export const useAddonsStore = create<AddonsState>((set, get) => ({
  addons: [],
  selectedAddon: null,
  loading: false,
  error: null,

  fetchAddons: async () => {
    set({ loading: true, error: null });
    try {
      const addons = await getAddons();
      const allAddons = addons.length > 0 ? addons : DEFAULT_ADDONS;
      
      // Find first addon with stream resource capability
      const streamAddon = allAddons.find(addonHasStreamResource);
      const selectedUrl = streamAddon?.transport_url ?? allAddons[0]?.transport_url ?? null;
      
      set({
        addons: allAddons,
        selectedAddon: selectedUrl,
        loading: false,
      });
    } catch (e: any) {
      set({
        addons: DEFAULT_ADDONS,
        selectedAddon: DEFAULT_ADDONS[0].transport_url,
        error: e.message,
        loading: false,
      });
    }
  },

  installAddon: async (addon) => {
    try {
      const newAddon = await addAddon(addon);
      set((state) => ({
        addons: [...state.addons, newAddon],
      }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  uninstallAddon: async (transportUrl) => {
    try {
      await removeAddon(transportUrl);
      set((state) => ({
        addons: state.addons.filter((a) => a.transport_url !== transportUrl),
      }));
    } catch (e: any) {
      set({ error: e.message });
    }
  },

  // Alias for uninstallAddon
  removeAddon: async (transportUrl) => {
    const { uninstallAddon } = get();
    await uninstallAddon(transportUrl);
  },

  selectAddon: (transportUrl) => {
    set({ selectedAddon: transportUrl });
  },

  clearError: () => {
    set({ error: null });
  },
}));