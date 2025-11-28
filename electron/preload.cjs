const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    setActivity: (activity) => ipcRenderer.send('RPC_SET_ACTIVITY', activity),
    clearActivity: () => ipcRenderer.send('RPC_CLEAR_ACTIVITY'),
    enableRPC: () => ipcRenderer.send('RPC_ENABLE'),
    disableRPC: () => ipcRenderer.send('RPC_DISABLE')
});
