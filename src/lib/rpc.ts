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
