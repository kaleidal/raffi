const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    usesTitleBarOverlay: process.platform === 'win32',
    setActivity: (activity) => ipcRenderer.send('RPC_SET_ACTIVITY', activity),
    clearActivity: () => ipcRenderer.send('RPC_CLEAR_ACTIVITY'),
    enableRPC: () => ipcRenderer.send('RPC_ENABLE'),
    disableRPC: () => ipcRenderer.send('RPC_DISABLE'),
    onOpenFile: (callback) => ipcRenderer.on('open-file', (_event, value) => callback(value)),
    openExternal: (url) => ipcRenderer.invoke('OPEN_EXTERNAL_URL', url),
    onAveAuthCallback: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('AVE_AUTH_CALLBACK', handler);
        return () => ipcRenderer.removeListener('AVE_AUTH_CALLBACK', handler);
    },
    onTraktAuthCallback: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('TRAKT_AUTH_CALLBACK', handler);
        return () => ipcRenderer.removeListener('TRAKT_AUTH_CALLBACK', handler);
    },
    getFilePath: (file) => webUtils.getPathForFile(file),
    saveClipPath: (suggestedName) => ipcRenderer.invoke('SAVE_CLIP_DIALOG', suggestedName),
    showConfirmDialog: (message, title) =>
        ipcRenderer.invoke('SHOW_CONFIRM_DIALOG', { message, title }),
    showAlertDialog: (message, title) =>
        ipcRenderer.invoke('SHOW_ALERT_DIALOG', { message, title }),
    showSelectDialog: (message, title, options) =>
        ipcRenderer.invoke('SHOW_SELECT_DIALOG', { message, title, options }),
    localLibrary: {
        pickFolder: () => ipcRenderer.invoke('LOCAL_LIBRARY_PICK_FOLDER'),
        scan: (roots) => ipcRenderer.invoke('LOCAL_LIBRARY_SCAN', roots),
    },
    cast: {
        createBootstrap: (sessionId, ttlSeconds) =>
            ipcRenderer.invoke('CAST_CREATE_BOOTSTRAP', { sessionId, ttlSeconds }),
        listDevices: (timeoutMs) =>
            ipcRenderer.invoke('CAST_LIST_DEVICES', { timeoutMs }),
        connectAndLoad: (payload) =>
            ipcRenderer.invoke('CAST_CONNECT_AND_LOAD', payload),
        play: () => ipcRenderer.invoke('CAST_PLAY'),
        pause: () => ipcRenderer.invoke('CAST_PAUSE'),
        seek: (currentTime) => ipcRenderer.invoke('CAST_SEEK', { currentTime }),
        setVolume: (level) => ipcRenderer.invoke('CAST_SET_VOLUME', { level }),
        stop: () => ipcRenderer.invoke('CAST_STOP'),
        disconnect: () => ipcRenderer.invoke('CAST_DISCONNECT'),
        status: () => ipcRenderer.invoke('CAST_STATUS'),
        reloadMedia: (payload) => ipcRenderer.invoke('CAST_RELOAD_MEDIA', payload),
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
    onUpdateDownloadProgress: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('UPDATE_DOWNLOAD_PROGRESS', handler);
        return () => ipcRenderer.removeListener('UPDATE_DOWNLOAD_PROGRESS', handler);
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
