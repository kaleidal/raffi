const path = require("path");

const SYMBOL_COLORS = { dark: "#ffffff", light: "#161615" };
const CANVAS_COLORS = { dark: "#090909", light: "#f3f2ee" };

function registerThemeHandlers({ ipcMain, shell, fs, folder, getMainWindow, logToFile }) {
  fs.mkdirSync(folder, { recursive: true });

  const readThemes = async () => {
    const names = (await fs.promises.readdir(folder)).filter((name) => name.endsWith(".css")).sort();
    const sheets = await Promise.all(names.map((name) => fs.promises.readFile(path.join(folder, name), "utf8")));
    return sheets.join("\n");
  };

  let pending = null;
  const announce = () => {
    clearTimeout(pending);
    pending = setTimeout(async () => {
      const mainWindow = getMainWindow();
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send("THEMES_CHANGED", await readThemes());
    }, 120);
  };

  fs.watch(folder, announce).on("error", (error) => logToFile("Themes folder watch failed", error));

  ipcMain.handle("THEMES_READ", readThemes);
  ipcMain.handle("THEMES_OPEN_FOLDER", () => shell.openPath(folder));
  ipcMain.on("WINDOW_SET_THEME", (_event, theme) => {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed() || !(theme in CANVAS_COLORS)) return;
    mainWindow.setBackgroundColor(CANVAS_COLORS[theme]);
    if (process.platform === "win32") {
      mainWindow.setTitleBarOverlay({ color: "#00000000", symbolColor: SYMBOL_COLORS[theme], height: 32 });
    }
  });
}

module.exports = { registerThemeHandlers };
