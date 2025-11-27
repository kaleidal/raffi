const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const express = require('express');

let mainWindow;
let goServer;
let httpServer;

const isDev = !app.isPackaged;

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

        httpServer = expressApp.listen(0, '127.0.0.1', () => {
            const port = httpServer.address().port;
            console.log(`Serving app on http://127.0.0.1:${port}`);
            mainWindow.loadURL(`http://127.0.0.1:${port}`);
        });
    }

    mainWindow.setMenuBarVisibility(false);

    if (isDev) mainWindow.webContents.openDevTools();
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
