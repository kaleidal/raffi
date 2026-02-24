export interface ActivityDetails {
    details?: string;
    state?: string;
    startTimestamp?: number;
    endTimestamp?: number;
    largeImageKey?: string;
    largeImageText?: string;
    smallImageKey?: string;
    smallImageText?: string;
    instance?: boolean;
}

declare global {
    interface Window {
        electronAPI?: {
            setActivity: (activity: ActivityDetails) => void;
            clearActivity: () => void;
            enableRPC: () => void;
            disableRPC: () => void;
            getFilePath?: (file: any) => string;
            saveClipPath?: (suggestedName?: string) => Promise<{ canceled: boolean; filePath: string | null; error?: string }>;
            showSelectDialog?: (
                message: string,
                title: string,
                options: string[],
            ) => Promise<{ canceled: boolean; selectedIndex: number }>;
            cast?: {
                createBootstrap?: (
                    sessionId: string,
                    ttlSeconds?: number,
                ) => Promise<{
                    sessionId: string;
                    localIp: string;
                    port: number;
                    token: string;
                    expiresAt: string;
                    streamUrl: string;
                    sessionUrl: string;
                }>;
                listDevices?: (timeoutMs?: number) => Promise<Array<{ id: string; name: string; host: string }>>;
                connectAndLoad?: (payload: {
                    deviceId: string;
                    streamUrl: string;
                    startTime?: number;
                    metadata?: {
                        title?: string;
                        subtitle?: string;
                        cover?: string;
                    };
                }) => Promise<{ active: boolean; deviceId: string; mediaUrl: string }>;
                play?: () => Promise<void>;
                pause?: () => Promise<void>;
                seek?: (currentTime: number) => Promise<void>;
                setVolume?: (level: number) => Promise<void>;
                stop?: () => Promise<void>;
                disconnect?: () => Promise<void>;
                status?: () => Promise<{
                    active: boolean;
                    deviceId?: string;
                    mediaUrl?: string;
                    playerState?: string;
                    currentTime?: number;
                    volumeLevel?: number;
                    raw?: unknown;
                }>;
            };
        };
    }
}

export function setActivity(activity: ActivityDetails) {
    if (window.electronAPI) {
        window.electronAPI.setActivity(activity);
    } else {
        console.warn('Discord RPC not available (not in Electron?)');
    }
}

export function clearActivity() {
    if (window.electronAPI) {
        window.electronAPI.clearActivity();
    }
}

export function enableRPC() {
    if (window.electronAPI) {
        window.electronAPI.enableRPC();
    }
}

export function disableRPC() {
    if (window.electronAPI) {
        window.electronAPI.disableRPC();
    }
}
