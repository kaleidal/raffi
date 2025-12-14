const { app, BrowserWindow, dialog, screen, ipcMain } = require('electron');
const { spawn } = require('child_process');
const {autoUpdater} = require('electron-updater');

const path = require('path');
const express = require('express');

let mainWindow;
let goServer;
let httpServer;
let fileToOpen = null;

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 1.0;
const WIDTH_THRESHOLD = 1600;

const DEFAULT_WINDOW_WIDTH = 1778;
const DEFAULT_WINDOW_HEIGHT = 1000;

const isDev = !app.isPackaged;

const gotTheLock = app.requestSingleInstanceLock();

app.on('open-file', (event, path) => {
    event.preventDefault();
    fileToOpen = path;
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('open-file', fileToOpen);
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            
            const filePath = commandLine[commandLine.length - 1];
            if (filePath && !filePath.startsWith('-') && filePath !== '.') {
                mainWindow.webContents.send('open-file', filePath);
            }
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

function commandExists(command) {
    return new Promise(resolve => {
        const checkCmd = process.platform === 'win32' ? 'where' : 'which';
        const checker = spawn(checkCmd, [command]);
        checker.on('close', code => resolve(code === 0));
        checker.on('error', () => resolve(false));
    });
}

function hasFFmpeg() {
    return new Promise(resolve => {
        const probe = spawn('ffmpeg', ['-version']);
        probe.on('close', code => resolve(code === 0));
        probe.on('error', () => resolve(false));
    });
}

function runLoggedCommand(command, args, options = {}) {
    return new Promise(resolve => {
        const child = spawn(command, args, {
            ...options,
            stdio: 'pipe',
        });

        if (child.stdout) {
            child.stdout.on('data', data => {
                console.log(`[${command}] ${data.toString()}`);
            });
        }
        if (child.stderr) {
            child.stderr.on('data', data => {
                console.error(`[${command} err] ${data.toString()}`);
            });
        }

        child.on('close', code => resolve(code === 0));
        child.on('error', err => {
            console.error(`${command} failed:`, err.message);
            resolve(false);
        });
    });
}

function runShellCommand(cmd) {
    if (process.platform === 'win32') {
        return runLoggedCommand('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd]);
    }
    return runLoggedCommand('bash', ['-lc', cmd]);
}

async function installFFmpegOnWindows() {
    const hasWinget = await commandExists('winget');
    if (!hasWinget) {
        console.warn('winget not available, cannot auto-install ffmpeg');
        return false;
    }
    console.log('Attempting to install FFmpeg via winget...');
    return runLoggedCommand('winget', [
        'install',
        '--id',
        'FFmpeg.FFmpeg',
        '-e',
        '--accept-package-agreements',
        '--accept-source-agreements',
    ]);
}

async function installFFmpegOnLinux() {
    const packageManagers = [
        {
            name: 'apt-get',
            command: 'sudo -n apt-get update && sudo -n apt-get install -y ffmpeg',
        },
        {
            name: 'dnf',
            command: 'sudo -n dnf install -y ffmpeg',
        },
        {
            name: 'pacman',
            command: 'sudo -n pacman -Sy --noconfirm ffmpeg',
        },
    ];

    for (const pm of packageManagers) {
        if (await commandExists(pm.name)) {
            console.log(`Attempting to install FFmpeg via ${pm.name}...`);
            const success = await runShellCommand(pm.command);
            if (success) return true;
        }
    }
    return false;
}

async function tryAutoInstallFFmpeg() {
    if (process.platform === 'win32') {
        return installFFmpegOnWindows();
    }
    if (process.platform === 'linux') {
        return installFFmpegOnLinux();
    }
    return false;
}

function getManualInstallMessage() {
    if (process.platform === 'win32') {
        return 'FFmpeg is required to start the local decoder. Please install it via https://ffmpeg.org or by running "winget install FFmpeg.FFmpeg" in PowerShell, then restart Raffi.';
    }
    if (process.platform === 'darwin') {
        return 'FFmpeg is required to start the local decoder. Install it via Homebrew ("brew install ffmpeg") or from https://ffmpeg.org, then restart Raffi.';
    }
    return 'FFmpeg is required to start the local decoder. Install it with your package manager (for example: "sudo apt install ffmpeg") or from https://ffmpeg.org, then restart Raffi.';
}

async function ensureFFmpegAvailable() {
    if (await hasFFmpeg()) {
        return true;
    }

    const installed = await tryAutoInstallFFmpeg();
    if (installed && (await hasFFmpeg())) {
        return true;
    }

    await dialog.showMessageBox({
        type: 'error',
        buttons: ['Quit'],
        title: 'FFmpeg Required',
        message: 'FFmpeg was not found on this system.',
        detail: getManualInstallMessage(),
    });

    return false;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: DEFAULT_WINDOW_WIDTH,
        height: DEFAULT_WINDOW_HEIGHT,
        minHeight: 800,
        minWidth: 1200,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true,
            preload: path.join(__dirname, 'preload.cjs'),
        },
    });

    try {
        const primary = screen.getPrimaryDisplay();
        const workArea = primary?.workAreaSize;
        if (
            workArea &&
            (workArea.width < DEFAULT_WINDOW_WIDTH ||
                workArea.height < DEFAULT_WINDOW_HEIGHT)
        ) {
            mainWindow.maximize();
        }
    } catch (e) {
        console.warn('Error maximizing window on small screens:', e);
    }

    // Dev: load Vite dev server
    // Prod: serve built dist via Express on localhost (doing this all because of youtube iframe)
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        autoUpdater.checkForUpdatesAndNotify();
        
        const expressApp = express();
        const distPath = path.join(__dirname, '..', 'dist');
        expressApp.use(express.static(distPath));

        httpServer = expressApp.listen(11420, '127.0.0.1', () => {
            console.log(`Serving app on http://127.0.0.1:11420`);
            mainWindow.loadURL(`http://127.0.0.1:11420`);
        });
    }

    mainWindow.setMenuBarVisibility(false);

    const applyDisplayZoom = () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const { width, height } = mainWindow.getBounds();
        
        if (height < 1000) {
            mainWindow.setAspectRatio(16/9);
        } else {
            mainWindow.setAspectRatio(0);
        }

        const primary = screen.getPrimaryDisplay();
        const scaleFactor = primary?.scaleFactor || 1;
        const dpiZoom = 1 / scaleFactor;
        const widthZoom = width < WIDTH_THRESHOLD ? width / WIDTH_THRESHOLD : 1;
        const zoom = Math.min(
            MAX_ZOOM,
            Math.max(MIN_ZOOM, dpiZoom * widthZoom),
        );
        mainWindow.webContents.setZoomFactor(zoom);
    };

    mainWindow.webContents.on('did-finish-load', () => {
        applyDisplayZoom();
        if (fileToOpen) {
            mainWindow.webContents.send('open-file', fileToOpen);
            fileToOpen = null;
        }
    });
    mainWindow.on('resize', applyDisplayZoom);
    screen.on('display-metrics-changed', applyDisplayZoom);
}

function startGoServer() {
    const binPath = getDecoderPath();
    console.log('Binary path:', binPath);

    goServer = spawn(binPath, [], { stdio: 'pipe' });

    goServer.stdout.on('data', d => console.log('[go]', d.toString()));
    goServer.stderr.on('data', d => console.error('[go err]', d.toString()));
}

ipcMain.handle('SAVE_CLIP_DIALOG', async (_event, suggestedName) => {
    try {
        const defaultName = (suggestedName && typeof suggestedName === 'string') ? suggestedName : 'clip.mp4';
        const res = await dialog.showSaveDialog(mainWindow, {
            title: 'Save Clip',
            defaultPath: defaultName,
            filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
        });
        return { canceled: res.canceled, filePath: res.filePath || null };
    } catch (e) {
        return { canceled: true, filePath: null, error: String(e) };
    }
});

app.whenReady().then(async () => {
    if (process.platform === 'win32' || process.platform === 'linux') {
        const argv = process.argv;
        console.log('Command line args:', argv);
        
        let filePath = null;
        if (isDev && argv.length >= 3) {
            filePath = argv[2];
        } else if (!isDev && argv.length >= 2) {
            filePath = argv[1];
        }

        if (filePath && !filePath.startsWith('-')) {
            console.log('Found file to open:', filePath);
            fileToOpen = filePath;
        }
    }

    const ffmpegReady = await ensureFFmpegAvailable();
    if (!ffmpegReady) {
        app.quit();
        return;
    }

    startGoServer();
    createWindow();
});

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

app.on('before-quit', cleanup);
app.on('will-quit', cleanup);
app.on('quit', cleanup);

app.on('window-all-closed', () => {
    cleanup();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

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

const clientId = '1443935459079094396';
let rpc;

function initRPC() {
    if (rpc) return;
    rpc = new DiscordRPCClient({
        clientId,
        transport: 'ipc',
    });

    rpc.connect().catch(e => {
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
        console.log('RPC_SET_ACTIVITY error:', err);
    }
});

ipcMain.on('RPC_CLEAR_ACTIVITY', () => {
    if (!rpc) return;
    try {
        rpc.clearActivity();
    } catch (err) {
        console.log('RPC_CLEAR_ACTIVITY error:', err);
    }
});

ipcMain.on('RPC_ENABLE', () => {
    initRPC();
});

ipcMain.on('RPC_DISABLE', () => {
    destroyRPC();
});
