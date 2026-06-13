import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  documentDirectory,
  makeDirectoryAsync,
  getInfoAsync,
  deleteAsync,
  createDownloadResumable,
  type DownloadResumable,
  type FileSystemDownloadResult,
} from 'expo-file-system/legacy';
import { create } from 'zustand';

export interface DownloadItem {
  id: string; // imdbId or imdbId:season:episode
  imdbId: string;
  type: 'movie' | 'series';
  title: string;
  poster?: string;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  // Download state
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'error';
  progress: number; // 0-100
  downloadedBytes: number;
  totalBytes: number;
  localPath?: string;
  streamUrl?: string;
  error?: string;
  // Timestamps
  addedAt: number;
  completedAt?: number;
}

interface DownloadsState {
  downloads: DownloadItem[];
  activeDownloads: Map<string, DownloadResumable>;
  loading: boolean;
  
  // Actions
  loadDownloads: () => Promise<void>;
  addDownload: (item: Omit<DownloadItem, 'status' | 'progress' | 'downloadedBytes' | 'totalBytes' | 'addedAt'>) => Promise<void>;
  startDownload: (id: string) => Promise<void>;
  pauseDownload: (id: string) => Promise<void>;
  resumeDownload: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  removeDownload: (id: string) => Promise<void>;
  clearCompletedDownloads: () => Promise<void>;
  getDownload: (id: string) => DownloadItem | undefined;
}

const DOWNLOADS_STORAGE_KEY = 'raffi_downloads';
const DOWNLOADS_DIR = `${documentDirectory}downloads/`;

// Ensure downloads directory exists
const ensureDownloadsDir = async () => {
  const dirInfo = await getInfoAsync(DOWNLOADS_DIR);
  if (!dirInfo.exists) {
    await makeDirectoryAsync(DOWNLOADS_DIR, { intermediates: true });
  }
};

// Save downloads to storage
const saveDownloads = async (downloads: DownloadItem[]) => {
  try {
    await AsyncStorage.setItem(DOWNLOADS_STORAGE_KEY, JSON.stringify(downloads));
  } catch (e) {
    console.error('Failed to save downloads:', e);
  }
};

// Load downloads from storage
const loadDownloadsFromStorage = async (): Promise<DownloadItem[]> => {
  try {
    const data = await AsyncStorage.getItem(DOWNLOADS_STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load downloads:', e);
  }
  return [];
};

// Generate filename for download
const generateFilename = (item: Omit<DownloadItem, 'status' | 'progress' | 'downloadedBytes' | 'totalBytes' | 'addedAt'>): string => {
  const sanitized = item.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
  if (item.type === 'series' && item.season !== undefined && item.episode !== undefined) {
    return `${sanitized}_S${item.season}E${item.episode}.mp4`;
  }
  return `${sanitized}.mp4`;
};

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  downloads: [],
  activeDownloads: new Map(),
  loading: false,

  loadDownloads: async () => {
    set({ loading: true });
    try {
      await ensureDownloadsDir();
      const downloads = await loadDownloadsFromStorage();
      
      // Verify completed downloads still exist
      const verified = await Promise.all(
        downloads.map(async (download) => {
          if (download.status === 'completed' && download.localPath) {
            const fileInfo = await getInfoAsync(download.localPath);
            if (!fileInfo.exists) {
              return { ...download, status: 'error' as const, error: 'File not found' };
            }
          }
          // Reset downloading items to paused (app was closed during download)
          if (download.status === 'downloading') {
            return { ...download, status: 'paused' as const };
          }
          return download;
        })
      );
      
      set({ downloads: verified, loading: false });
    } catch (e) {
      console.error('Failed to load downloads:', e);
      set({ loading: false });
    }
  },

  addDownload: async (item) => {
    const { downloads } = get();
    
    // Check if already exists
    if (downloads.find((d) => d.id === item.id)) {
      console.log('Download already exists:', item.id);
      return;
    }

    const filename = generateFilename(item);
    const localPath = `${DOWNLOADS_DIR}${filename}`;

    const newDownload: DownloadItem = {
      ...item,
      status: 'pending',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      localPath,
      addedAt: Date.now(),
    };

    const newDownloads = [...downloads, newDownload];
    set({ downloads: newDownloads });
    await saveDownloads(newDownloads);

    // Auto-start download
    get().startDownload(item.id);
  },

  startDownload: async (id) => {
    const { downloads, activeDownloads } = get();
    const download = downloads.find((d) => d.id === id);
    
    if (!download || !download.streamUrl || !download.localPath) {
      console.error('Invalid download:', id);
      return;
    }

    // Update status to downloading
    const updatedDownloads = downloads.map((d) =>
      d.id === id ? { ...d, status: 'downloading' as const, error: undefined } : d
    );
    set({ downloads: updatedDownloads });
    await saveDownloads(updatedDownloads);

    try {
      const callback = (downloadProgress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
        const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
        const progress = totalBytesExpectedToWrite > 0
          ? Math.round((totalBytesWritten / totalBytesExpectedToWrite) * 100)
          : 0;

        set((state) => ({
          downloads: state.downloads.map((d) =>
            d.id === id
              ? {
                  ...d,
                  progress,
                  downloadedBytes: totalBytesWritten,
                  totalBytes: totalBytesExpectedToWrite,
                }
              : d
          ),
        }));
      };

      const downloadResumable = createDownloadResumable(
        download.streamUrl,
        download.localPath,
        {},
        callback
      );

      activeDownloads.set(id, downloadResumable);
      set({ activeDownloads: new Map(activeDownloads) });

      const result = await downloadResumable.downloadAsync();
      
      if (result) {
        // Download completed
        const completedDownloads = get().downloads.map((d) =>
          d.id === id
            ? {
                ...d,
                status: 'completed' as const,
                progress: 100,
                localPath: result.uri,
                completedAt: Date.now(),
              }
            : d
        );
        set({ downloads: completedDownloads });
        await saveDownloads(completedDownloads);
      }

      activeDownloads.delete(id);
      set({ activeDownloads: new Map(activeDownloads) });
    } catch (e: any) {
      console.error('Download failed:', e);
      const errorDownloads = get().downloads.map((d) =>
        d.id === id
          ? { ...d, status: 'error' as const, error: e.message || 'Download failed' }
          : d
      );
      set({ downloads: errorDownloads });
      await saveDownloads(errorDownloads);
      
      activeDownloads.delete(id);
      set({ activeDownloads: new Map(activeDownloads) });
    }
  },

  pauseDownload: async (id) => {
    const { activeDownloads, downloads } = get();
    const downloadResumable = activeDownloads.get(id);
    
    if (downloadResumable) {
      try {
        await downloadResumable.pauseAsync();
        
        const updatedDownloads = downloads.map((d) =>
          d.id === id ? { ...d, status: 'paused' as const } : d
        );
        set({ downloads: updatedDownloads });
        await saveDownloads(updatedDownloads);
      } catch (e) {
        console.error('Failed to pause download:', e);
      }
    }
  },

  resumeDownload: async (id) => {
    const { activeDownloads, downloads } = get();
    const downloadResumable = activeDownloads.get(id);
    const download = downloads.find((d) => d.id === id);
    
    if (!download) return;

    if (downloadResumable) {
      try {
        const updatedDownloads = downloads.map((d) =>
          d.id === id ? { ...d, status: 'downloading' as const } : d
        );
        set({ downloads: updatedDownloads });
        
        const result = await downloadResumable.resumeAsync();
        
        if (result) {
          const completedDownloads = get().downloads.map((d) =>
            d.id === id
              ? {
                  ...d,
                  status: 'completed' as const,
                  progress: 100,
                  localPath: result.uri,
                  completedAt: Date.now(),
                }
              : d
          );
          set({ downloads: completedDownloads });
          await saveDownloads(completedDownloads);
        }
      } catch (e) {
        console.error('Failed to resume download:', e);
      }
    } else {
      // No active download, start fresh
      get().startDownload(id);
    }
  },

  cancelDownload: async (id) => {
    const { activeDownloads, downloads } = get();
    const downloadResumable = activeDownloads.get(id);
    
    if (downloadResumable) {
      try {
        await downloadResumable.pauseAsync();
      } catch (e) {
        // ignore
      }
      activeDownloads.delete(id);
      set({ activeDownloads: new Map(activeDownloads) });
    }

    // Remove the partial file
    const download = downloads.find((d) => d.id === id);
    if (download?.localPath) {
      try {
        await deleteAsync(download.localPath, { idempotent: true });
      } catch (e) {
        // ignore
      }
    }

    const updatedDownloads = downloads.filter((d) => d.id !== id);
    set({ downloads: updatedDownloads });
    await saveDownloads(updatedDownloads);
  },

  removeDownload: async (id) => {
    const { downloads } = get();
    const download = downloads.find((d) => d.id === id);
    
    if (download?.localPath) {
      try {
        await deleteAsync(download.localPath, { idempotent: true });
      } catch (e) {
        // ignore
      }
    }

    const updatedDownloads = downloads.filter((d) => d.id !== id);
    set({ downloads: updatedDownloads });
    await saveDownloads(updatedDownloads);
  },

  clearCompletedDownloads: async () => {
    const { downloads } = get();
    
    // Delete files for completed downloads
    await Promise.all(
      downloads
        .filter((d) => d.status === 'completed')
        .map(async (d) => {
          if (d.localPath) {
            try {
              await deleteAsync(d.localPath, { idempotent: true });
            } catch (e) {
              // ignore
            }
          }
        })
    );

    const updatedDownloads = downloads.filter((d) => d.status !== 'completed');
    set({ downloads: updatedDownloads });
    await saveDownloads(updatedDownloads);
  },

  getDownload: (id) => {
    return get().downloads.find((d) => d.id === id);
  },
}));
