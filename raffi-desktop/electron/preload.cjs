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
    persistClipFile: (sourcePath, targetPath) =>
        ipcRenderer.invoke('PERSIST_CLIP_FILE', { sourcePath, targetPath }),
    showConfirmDialog: (message, title) =>
        ipcRenderer.invoke('SHOW_CONFIRM_DIALOG', { message, title }),
    showAlertDialog: (message, title) =>
        ipcRenderer.invoke('SHOW_ALERT_DIALOG', { message, title }),
    showSelectDialog: (message, title, options) =>
        ipcRenderer.invoke('SHOW_SELECT_DIALOG', { message, title, options }),
    fetchIntroDbSegments: (imdbId, season, episode) =>
        ipcRenderer.invoke('INTRODB_FETCH_SEGMENTS', { imdbId, season, episode }),
    localLibrary: {
        pickFolder: () => ipcRenderer.invoke('LOCAL_LIBRARY_PICK_FOLDER'),
        scan: (roots) => ipcRenderer.invoke('LOCAL_LIBRARY_SCAN', roots),
    },
    windowControls: {
        minimize: () => ipcRenderer.send('WINDOW_MINIMIZE'),
        toggleMaximize: () => ipcRenderer.send('WINDOW_TOGGLE_MAXIMIZE'),
        close: () => ipcRenderer.send('WINDOW_CLOSE'),
        isMaximized: () => ipcRenderer.invoke('WINDOW_IS_MAXIMIZED'),
        getDisplayZoom: () => ipcRenderer.invoke('WINDOW_GET_DISPLAY_ZOOM'),
        syncMiniPlayerState: (state) => ipcRenderer.send('WINDOW_SYNC_MINI_PLAYER_STATE', state),
        exitMiniPlayer: () => ipcRenderer.send('WINDOW_EXIT_MINI_PLAYER'),
        isMiniPlayer: () => ipcRenderer.invoke('WINDOW_IS_MINI_PLAYER'),
        onMaximizedChanged: (callback) => {
            const handler = (_event, value) => callback(value);
            ipcRenderer.on('WINDOW_MAXIMIZED_CHANGED', handler);
            return () => ipcRenderer.removeListener('WINDOW_MAXIMIZED_CHANGED', handler);
        },
        onMiniPlayerChanged: (callback) => {
            const handler = (_event, value) => callback(value);
            ipcRenderer.on('WINDOW_MINI_PLAYER_CHANGED', handler);
            return () => ipcRenderer.removeListener('WINDOW_MINI_PLAYER_CHANGED', handler);
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
