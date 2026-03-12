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
            usesTitleBarOverlay?: boolean;
            getFilePath?: (file: any) => string;
            saveClipPath?: (suggestedName?: string) => Promise<{ canceled: boolean; filePath: string | null; error?: string }>;
            persistClipFile?: (
                sourcePath: string,
                targetPath: string,
            ) => Promise<{ ok: boolean; filePath: string | null; error?: string }>;
            windowControls?: {
                minimize?: () => void;
                toggleMaximize?: () => void;
                close?: () => void;
                isMaximized?: () => Promise<boolean>;
                getDisplayZoom?: () => Promise<number>;
                syncMiniPlayerState?: (state: { enabled: boolean; canEnter: boolean }) => void;
                exitMiniPlayer?: () => void;
                isMiniPlayer?: () => Promise<boolean>;
                onMaximizedChanged?: (callback: (value: boolean) => void) => (() => void) | void;
                onMiniPlayerChanged?: (callback: (value: boolean) => void) => (() => void) | void;
            };
            showSelectDialog?: (
                message: string,
                title: string,
                options: string[],
            ) => Promise<{ canceled: boolean; selectedIndex: number }>;
            fetchIntroDbSegments?: (
                imdbId: string,
                season: number,
                episode: number,
            ) => Promise<{ status: number; data: unknown | null }>;
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
                    deviceId?: string;
                    streamUrl: string;
                    startTime?: number;
                    mode?: "native" | "chrome";
                    metadata?: {
                        title?: string;
                        subtitle?: string;
                        cover?: string;
                        background?: string;
                        durationSeconds?: number;
                    };
                }) => Promise<{
                    active: boolean;
                    deviceId: string;
                    mediaUrl: string;
                    deviceName?: string;
                    transport?: "native" | "chrome";
                }>;
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
