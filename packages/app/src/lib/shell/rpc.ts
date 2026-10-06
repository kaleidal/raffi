export interface ActivityDetails {
    type?: 0 | 2 | 3 | 5;
    statusDisplayType?: 0 | 1 | 2;
    details?: string;
    state?: string;
    startTimestamp?: number;
    endTimestamp?: number;
    largeImageKey?: string;
    largeImageText?: string;
    smallImageKey?: string;
    smallImageText?: string;
    instance?: boolean;
    buttons?: Array<{ label: string; url: string }>;
}

declare global {
    interface Window {
        electronAPI?: {
            platform?: string;
            setActivity: (activity: ActivityDetails) => void;
            clearActivity: () => void;
            enableRPC: () => void;
            disableRPC: () => void;
            usesTitleBarOverlay?: boolean;
            getPlayableFileUrl?: (file: File) => Promise<string>;
            localLibrary?: {
                pickFolder: () => Promise<string | null>;
                getRoots: () => Promise<string[]>;
                removeRoot: (root: string) => Promise<boolean>;
                resolve: (filePath: string) => Promise<string>;
                scan: () => Promise<unknown[]>;
            };
            ffmpegPlayback?: {
                start: (request: {
                    source: string;
                    startTime: number;
                    audioIndex: number;
                    audioChannels: number | null;
                }) => Promise<{ sessionId: string; streamUrl: string; startTime: number }>;
                stop: (sessionId: string) => Promise<boolean>;
            };
            saveClipPath?: (suggestedName?: string) => Promise<{ canceled: boolean; filePath: string | null; error?: string }>;
            writeClipFile?: (
                targetPath: string,
                data: ArrayBuffer,
            ) => Promise<{ ok: boolean; filePath: string | null; error?: string }>;
            persistClipFile?: (
                sourcePath: string,
                targetPath: string,
            ) => Promise<{ ok: boolean; filePath: string | null; error?: string }>;
            fetchCommunityAddons?: () => Promise<{
                ok: boolean;
                addons: unknown[];
                error: string | null;
            }>;
            windowControls?: {
                syncMiniPlayerState?: (state: { enabled: boolean; canEnter: boolean }) => void;
                exitMiniPlayer?: () => void;
                isMiniPlayer?: () => Promise<boolean>;
                onMiniPlayerChanged?: (callback: (value: boolean) => void) => (() => void) | void;
            };
            fetchIntroDbSegments?: (
                imdbId: string,
                season: number,
                episode: number,
            ) => Promise<{ status: number; data: unknown | null }>;
            getDefenderExclusionStatus?: () => Promise<{
                supported: boolean;
                excluded: boolean;
                paths: string[];
                processes: string[];
                missingPaths: string[];
                missingProcesses: string[];
                error: string | null;
            }>;
            applyDefenderExclusions?: () => Promise<{
                ok: boolean;
                elevated: boolean;
                error: string | null;
                paths?: string[];
                processes?: string[];
                status?: {
                    supported: boolean;
                    excluded: boolean;
                    paths: string[];
                    processes: string[];
                    missingPaths: string[];
                    missingProcesses: string[];
                    error: string | null;
                };
            }>;
            showConfirmDialog?: (message: string, title?: string) => Promise<boolean>;
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
