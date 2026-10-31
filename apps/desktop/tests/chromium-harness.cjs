const { app, BrowserWindow } = require("electron");

const [url, expression] = process.argv.slice(-2);

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  await window.loadURL(url);
  const result = await window.webContents.executeJavaScript(expression);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  app.quit();
}).catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  app.exit(1);
});
