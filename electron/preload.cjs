const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    setActivity: (activity) => ipcRenderer.send('RPC_SET_ACTIVITY', activity),
    clearActivity: () => ipcRenderer.send('RPC_CLEAR_ACTIVITY'),
    enableRPC: () => ipcRenderer.send('RPC_ENABLE'),
    disableRPC: () => ipcRenderer.send('RPC_DISABLE'),
    onOpenFile: (callback) => ipcRenderer.on('open-file', (_event, value) => callback(value)),
    getFilePath: (file) => webUtils.getPathForFile(file)
});
