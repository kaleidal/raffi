const { app, BrowserWindow } = require("electron");

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await window.loadURL("data:text/html,<meta charset=utf-8>");
  const support = await window.webContents.executeJavaScript(`({
    aac: MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
    opus: MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, opus"')
  })`);
  process.stdout.write(`${JSON.stringify(support)}\n`);
  app.quit();
}).catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  app.exit(1);
});
