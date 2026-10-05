const { app, BrowserWindow, ipcMain, Notification, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function dataFile() {
  return path.join(app.getPath('userData'), 'gestor-pedidos-data.json');
}

function defaultData() {
  return { products: [], orders: [], settings: { businessName: 'Mi Hamburguesería' } };
}

function readData() {
  try {
    const file = dataFile();
    if (!fs.existsSync(file)) return defaultData();
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return defaultData();
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
  fs.writeFileSync(dataFile(), JSON.stringify(data, null, 2), 'utf8');
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    title: 'Gestor de Pedidos',
    backgroundColor: '#0e1014',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://wa.me/') || url.startsWith('https://api.whatsapp.com/')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  ipcMain.handle('data:get', () => readData());
  ipcMain.handle('data:set', (_event, data) => writeData(data));
  ipcMain.handle('notify', (_event, { title, body }) => {
    if (Notification.isSupported()) new Notification({ title, body }).show();
    return true;
  });
  ipcMain.handle('backup:export', async (_event, data) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Guardar respaldo',
      defaultPath: `gestor-pedidos-respaldo-${new Date().toISOString().slice(0,10)}.json`,
      filters: [{ name: 'Respaldo JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  });
  ipcMain.handle('backup:import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Importar respaldo',
      properties: ['openFile'],
      filters: [{ name: 'Respaldo JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    writeData(data);
    return data;
  });
  ipcMain.handle('csv:export', async (_event, csv) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Exportar pedidos',
      defaultPath: `pedidos-${new Date().toISOString().slice(0,10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, '\ufeff' + csv, 'utf8');
    return true;
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
