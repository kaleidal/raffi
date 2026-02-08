const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    usesTitleBarOverlay: process.platform === 'win32',
    setActivity: (activity) => ipcRenderer.send('RPC_SET_ACTIVITY', activity),
    clearActivity: () => ipcRenderer.send('RPC_CLEAR_ACTIVITY'),
    enableRPC: () => ipcRenderer.send('RPC_ENABLE'),
    disableRPC: () => ipcRenderer.send('RPC_DISABLE'),
    onOpenFile: (callback) => ipcRenderer.on('open-file', (_event, value) => callback(value)),
    getFilePath: (file) => webUtils.getPathForFile(file),
    saveClipPath: (suggestedName) => ipcRenderer.invoke('SAVE_CLIP_DIALOG', suggestedName),
    localLibrary: {
        pickFolder: () => ipcRenderer.invoke('LOCAL_LIBRARY_PICK_FOLDER'),
        scan: (roots) => ipcRenderer.invoke('LOCAL_LIBRARY_SCAN', roots),
    },
    windowControls: {
        minimize: () => ipcRenderer.send('WINDOW_MINIMIZE'),
        toggleMaximize: () => ipcRenderer.send('WINDOW_TOGGLE_MAXIMIZE'),
        close: () => ipcRenderer.send('WINDOW_CLOSE'),
        isMaximized: () => ipcRenderer.invoke('WINDOW_IS_MAXIMIZED'),
        onMaximizedChanged: (callback) => {
            const handler = (_event, value) => callback(value);
            ipcRenderer.on('WINDOW_MAXIMIZED_CHANGED', handler);
            return () => ipcRenderer.removeListener('WINDOW_MAXIMIZED_CHANGED', handler);
        },
    },
    onDisplayZoom: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('DISPLAY_ZOOM', handler);
        return () => ipcRenderer.removeListener('DISPLAY_ZOOM', handler);
    },
    onUpdateAvailable: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('UPDATE_AVAILABLE', handler);
        return () => ipcRenderer.removeListener('UPDATE_AVAILABLE', handler);
    },
    onUpdateDownloaded: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('UPDATE_DOWNLOADED', handler);
        return () => ipcRenderer.removeListener('UPDATE_DOWNLOADED', handler);
    },
    installUpdate: () => ipcRenderer.invoke('UPDATE_INSTALL'),
    toggleFullscreen: () => ipcRenderer.send('WINDOW_TOGGLE_FULLSCREEN'),
    isFullscreen: () => ipcRenderer.invoke('WINDOW_IS_FULLSCREEN'),
    onFullscreenChanged: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('WINDOW_FULLSCREEN_CHANGED', handler);
        return () => ipcRenderer.removeListener('WINDOW_FULLSCREEN_CHANGED', handler);
    },
});

