const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const express = require('express');

let mainWindow;
let goServer;
let httpServer;

const isDev = !app.isPackaged;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

function getDecoderPath() {
    const platform = process.platform;

    if (isDev) {
        // dev: binaries live in electron/
        if (platform === 'win32') {
            return path.join(__dirname, 'decoder-windows-amd64.exe');
        } else if (platform === 'darwin') {
            return path.join(__dirname, 'decoder-macos-amd64');
        } else {
            return path.join(__dirname, 'decoder-x86_64-unknown-linux-gnu');
        }
    } else {
        // prod: binaries copied into resources/ by electron-builder
        if (platform === 'win32') {
            return path.join(process.resourcesPath, 'decoder-windows-amd64.exe');
        } else if (platform === 'darwin') {
            return path.join(process.resourcesPath, 'decoder-macos-amd64');
        } else {
            return path.join(process.resourcesPath, 'decoder-x86_64-unknown-linux-gnu');
        }
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1778,
        height: 1000,
        minHeight: 1000,
        minWidth: 1778,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true,
            preload: path.join(__dirname, 'preload.cjs'),
        },
    });

    // Dev: load Vite dev server
    // Prod: serve built dist via Express on localhost (doing this all because of youtube iframe)
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        const expressApp = express();
        const distPath = path.join(__dirname, '..', 'dist');
        expressApp.use(express.static(distPath));

        httpServer = expressApp.listen(11420, '127.0.0.1', () => {
            console.log(`Serving app on http://127.0.0.1:11420`);
            mainWindow.loadURL(`http://127.0.0.1:11420`);
        });
    }

    mainWindow.setMenuBarVisibility(false);

    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.setZoomFactor(1.0);
    });
}

app.whenReady().then(() => {
    const binPath = getDecoderPath();
    console.log('Binary path:', binPath);

    goServer = spawn(binPath, [], { stdio: 'pipe' });

    goServer.stdout.on('data', d => console.log('[go]', d.toString()));
    goServer.stderr.on('data', d => console.error('[go err]', d.toString()));

    createWindow();
});

// Cleanup function
function cleanup() {
    console.log('Cleaning up...');
    if (goServer) {
        console.log('Killing Go server...');
        goServer.kill('SIGTERM');
        setTimeout(() => {
            if (goServer && !goServer.killed) {
                goServer.kill('SIGKILL');
            }
        }, 1000);
    }
    if (httpServer) {
        console.log('Closing HTTP server...');
        httpServer.close();
    }
}

// Clean up on all exit scenarios
app.on('before-quit', cleanup);
app.on('will-quit', cleanup);
app.on('quit', cleanup);

app.on('window-all-closed', () => {
    cleanup();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle process termination signals
process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
});

process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
});

// --- Discord RPC ---
const { DiscordRPCClient } = require('@ryuziii/discord-rpc');
const { ipcMain } = require('electron');

const clientId = '1443935459079094396';
let rpc;

function initRPC() {
    if (rpc) return;
    rpc = new DiscordRPCClient({
        clientId,
        transport: 'ipc',
    });

    rpc.connect().catch(e => {
        console.warn('Discord RPC connection failed:', e.message);
        rpc = null;
    });
}

function destroyRPC() {
    if (!rpc) return;
    try {
        rpc.destroy();
    } catch (e) { }
    rpc = null;
}

initRPC();

ipcMain.on('RPC_SET_ACTIVITY', (event, data) => {
    if (!rpc) return;

    try {
        if (data.useProgressBar && data.duration > 0) {
            const options = {
                state: data.state,
                largeImageKey: data.largeImageKey || 'raffi_logo',
                largeImageText: data.largeImageText || 'Raffi',
                smallImageKey: data.smallImageKey || 'play',
                smallImageText: data.smallImageText || 'Playing',
            };

            rpc.setProgressBar(data.details, data.duration, options);
        } else {
            rpc.setActivity({
                state: data.state,
                largeImageKey: data.largeImageKey || 'raffi_logo',
                largeImageText: data.largeImageText || 'Raffi',
                smallImageKey: data.smallImageKey || 'play',
                smallImageText: data.smallImageText || 'Playing',
            });
        }
    } catch (err) {
        console.error('RPC_SET_ACTIVITY error:', err);
    }
});

ipcMain.on('RPC_CLEAR_ACTIVITY', () => {
    if (!rpc) return;
    try {
        rpc.clearActivity();
    } catch (err) {
        console.error('RPC_CLEAR_ACTIVITY error:', err);
    }
});

ipcMain.on('RPC_ENABLE', () => {
    initRPC();
});

ipcMain.on('RPC_DISABLE', () => {
    destroyRPC();
});
