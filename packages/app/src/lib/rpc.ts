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
            platform?: string;
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
                getDisplayZoom?: () => Promise<number>;
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
