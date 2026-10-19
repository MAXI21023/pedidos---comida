const { app, BrowserWindow, ipcMain, Notification, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Al cerrar, esperar la confirmacion de que el ultimo estado quedo en el disco.
function guardWindowClose(win, event) {
  if (win.allowSafeClose) return;
  event.preventDefault();
  if (win.waitingForSave) return;
  win.waitingForSave = true;
  win.webContents.send('app:save-and-close');
  win.saveCloseTimeout = setTimeout(async () => {
    if (win.isDestroyed() || !win.waitingForSave) return;
    win.waitingForSave = false;
    const {response} = await dialog.showMessageBox(win, {
      type:'warning',
      title:'No se pudo verificar el guardado',
      message:'No recibimos confirmación de que los datos estén guardados.',
      detail:'Para proteger tus pedidos, el cierre se detuvo. Puedes seguir trabajando o cerrar bajo tu responsabilidad.',
      buttons:['Seguir trabajando','Cerrar de todas formas'],
      defaultId:0,cancelId:0,noLink:true
    });
    if (response===1 && !win.isDestroyed()) {
      win.allowSafeClose=true;
      win.close();
    }
  },12000);
}

function confirmWindowSave(event, result) {
  const win=BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed() || !win.waitingForSave) return;
  clearTimeout(win.saveCloseTimeout);
  win.waitingForSave=false;
  if (result && result.ok===true) {
    win.allowSafeClose=true;
    win.close();
    return;
  }
  dialog.showMessageBox(win,{
    type:'error',
    title:'Guardado pendiente',
    message:'La aplicación NO se cerró para proteger los pedidos.',
    detail:'Error al guardar: '+String(result?.error||'No se pudo verificar el archivo.')+'\nRevisa el espacio disponible en tu Mac y vuelve a intentar cerrar.',
    buttons:['Seguir trabajando'],
    defaultId:0,cancelId:0,noLink:true
  }).catch(error=>console.error('Error mostrando advertencia de guardado:',error));
}

function deviceIdFile() {
  return path.join(app.getPath('userData'), 'device-id.txt');
}

function getDeviceId() {
  const file=deviceIdFile();
  try {
    if(fs.existsSync(file)){
      const id=fs.readFileSync(file,'utf8').trim();
      if(id) return id;
    }
    const id='device-'+require('crypto').randomUUID();
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file,id,'utf8');
    return id;
  } catch {
    return 'device-'+require('crypto').randomUUID();
  }
}

function dataFile() {
  return path.join(app.getPath('userData'), 'gestor-pedidos-data.json');
}

// Copias diarias independientes de los respaldos rotativos. Conserva 30 dias.
function dailySnapshotDir() {
  return path.join(app.getPath('userData'), 'daily-backups');
}
function listDailySnapshots() {
  const dir = dailySnapshotDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => /^gestor-pedidos-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort().reverse().map(name => path.join(dir, name));
}
function saveDailySnapshot(file) {
  const dir = dailySnapshotDir();
  fs.mkdirSync(dir, {recursive:true, mode:0o700});
  const name = 'gestor-pedidos-' + new Date().toISOString().slice(0,10) + '.json';
  const target = path.join(dir, name);
  if (!fs.existsSync(target)) fs.copyFileSync(file, target, fs.constants.COPYFILE_EXCL);
  for (const old of listDailySnapshots().slice(30)) fs.unlinkSync(old);
}

function defaultData() {
  return { products: [], orders: [], settings: { businessName: 'Mi Hamburguesería' } };
}

function validData(data) {
  return data && typeof data === 'object' && !Array.isArray(data) &&
    Array.isArray(data.products) && Array.isArray(data.orders);
}
function readValidated(file) {
  const value=JSON.parse(fs.readFileSync(file,'utf8'));
  if (!validData(value)) throw new Error('Estructura de datos inválida');
  return value;
}

// Carpeta unica para la aplicacion instalada y la ejecutada con "npm start".
// El nombre anterior dependia del modo de inicio de Electron.
const BETA_INSTALL=String(app.getName()).includes('Beta');
const STABLE_DATA_FOLDER=BETA_INSTALL?'cl.gestorpedidos.desktop.beta':'cl.gestorpedidos.desktop';
function stableStoragePaths() {
  const root=app.getPath('appData');
  const shared=path.join(root,STABLE_DATA_FOLDER);
  const directories=BETA_INSTALL?[shared]:[shared,app.getPath('userData'),
    path.join(root,'Gestor de Pedidos'),
    path.join(root,'gestor-pedidos-whatsapp'),
    path.join(root,'Gestor-de-Pedidos'),
    path.join(root,'gestor-pedidos')];
  return {shared,directories:[...new Set(directories.map(d=>path.resolve(d)))]};
}
function existingDataCandidates(dir) {
  const primary=path.join(dir,'gestor-pedidos-data.json');
  const backups=[primary,primary+'.tmp',primary+'.bak',
    ...Array.from({length:10},(_,i)=>primary+'.bak.'+(i+1))];
  const daily=path.join(dir,'daily-backups');
  if(fs.existsSync(daily)) {
    backups.push(...fs.readdirSync(daily)
      .filter(n=>/^gestor-pedidos-\d{4}-\d{2}-\d{2}\.json$/.test(n))
      .map(n=>path.join(daily,n)));
  }
  return backups.filter(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
}
function readStoreCandidates(dir) {
  const files=existingDataCandidates(dir),possible=[];
  for(const file of files) {
    try {
      const value=readValidated(file);
      possible.push({dir,file,value,mtime:fs.statSync(file).mtimeMs,
        orderCount:value.orders.length,productCount:value.products.length});
    } catch(error) {console.warn('Copia local no valida:',file,error.message)}
  }
  if(!possible.length) {
    if(files.length) throw new Error('Hay archivos de pedidos en '+dir+
      ', pero ninguno se puede leer. No se iniciara con datos vacios.');
    return null;
  }
  const primary=path.join(dir,'gestor-pedidos-data.json');
  const main=possible.find(c=>c.file===primary);
  // Si el archivo principal esta vacio pero un respaldo tiene ventas,
  // preferir ese respaldo antes de arriesgar la perdida total.
  if(main&&main.orderCount&&main.productCount)return main;
  const richest=possible.sort((a,b)=>b.orderCount-a.orderCount||
    b.productCount-a.productCount||b.mtime-a.mtime)[0];
  if(!main)return richest;
  return richest.orderCount>main.orderCount||richest.productCount>main.productCount
    ?richest:main;
}
function backupAllStoresBeforeMigration(sources,shared) {
  const backupRoot=path.join(shared,'migration-backups');
  const dest=path.join(backupRoot,new Date().toISOString().replace(/[:.]/g,'-')+
    '-'+process.pid);
  fs.mkdirSync(dest,{recursive:true,mode:0o700});
  for(let i=0;i<sources.length;i++){
    const source=sources[i],folder=path.join(dest,'source-'+(i+1));
    fs.mkdirSync(folder,{recursive:true,mode:0o700});
    for(const file of existingDataCandidates(source.dir)){
      const base=path.basename(file);
      const name=path.basename(path.dirname(file))==='daily-backups'
        ?'daily-'+base:base;
      fs.copyFileSync(file,path.join(folder,name),fs.constants.COPYFILE_EXCL);
    }
    const device=path.join(source.dir,'device-id.txt');
    if(fs.existsSync(device))fs.copyFileSync(device,path.join(folder,'device-id.txt'),fs.constants.COPYFILE_EXCL);
  }
  return dest;
}
function prepareStableStorage() {
  const {shared,directories}=stableStoragePaths();
  const stores=directories.map(readStoreCandidates).filter(Boolean);
  fs.mkdirSync(shared,{recursive:true,mode:0o700});
  if(stores.length) {
    // Nunca seleccionar una version que deje pedidos exclusivos en otra carpeta.
    const sorted=[...stores].sort((a,b)=>b.orderCount-a.orderCount||
      b.mtime-a.mtime||b.productCount-a.productCount);
    const chosen=sorted[0];
    const keys=new Set(chosen.value.orders.map(o=>String(o.id)));
    const conflicting=sorted.slice(1).filter(source=>
      source.value.orders.some(o=>!keys.has(String(o.id))));
    if(conflicting.length){
      throw new Error('Se encontraron distintas carpetas con pedidos que no estan en las otras. '+
        'Se bloqueo la migracion para evitar perderlos. Carpetas: '+
        sorted.map(x=>x.dir+' ('+x.orderCount+' pedidos)').join(' ; '));
    }
    const target=path.join(shared,'gestor-pedidos-data.json');
    if(chosen.file!==target){
      const snapshot=backupAllStoresBeforeMigration(stores,shared);
      const temp=target+'.migrate-'+process.pid+'.tmp';
      fs.copyFileSync(chosen.file,temp,fs.constants.COPYFILE_EXCL);
      try {
        readValidated(temp);
        fs.renameSync(temp,target);
      }catch(error){try{fs.unlinkSync(temp)}catch{};throw error}
      const device=path.join(chosen.dir,'device-id.txt');
      const stableDevice=path.join(shared,'device-id.txt');
      if(!fs.existsSync(stableDevice)&&fs.existsSync(device))
        fs.copyFileSync(device,stableDevice,fs.constants.COPYFILE_EXCL);
      console.log('Almacenamiento unificado; copia de seguridad:',snapshot);
    }
  }
  // Electron requiere que exista antes de fijar la ruta.
  app.setPath('userData',shared);
  return shared;
}
let startupStorageError=null;
try {prepareStableStorage()}
catch(error) {
  startupStorageError=error;
  console.error('Se bloqueo el arranque para proteger los datos:',error);
}

function readData() {
  const file=dataFile();
  const candidates=[file,file+'.bak',...Array.from({length:10},(_,i)=>file+'.bak.'+(i+1)),...listDailySnapshots()];
  const existing=candidates.filter(p=>fs.existsSync(p));
  if (!existing.length) return defaultData();
  for (const candidate of existing) {
    try {
      const value=readValidated(candidate);
      if (candidate!==file) {
        console.error('Datos recuperados desde respaldo:',candidate);
        if(fs.existsSync(file)) fs.copyFileSync(file,file+'.corrupt-'+Date.now());
        fs.copyFileSync(candidate,file);
        dialog.showMessageBox({type:'warning',title:'Respaldo recuperado',
          message:'Se recuperaron los datos desde una copia de seguridad.',
          detail:'Revisa tus pedidos antes de continuar. Respaldo: '+candidate});
      }
      return value;
    } catch(e) { console.error('Archivo de datos no válido:',candidate,e); }
  }
  throw new Error('No se pudieron recuperar los datos. Se bloquea el inicio para evitar sobrescribir tus pedidos. Carpeta: '+path.dirname(file));
}
function writeData(data) {
  if (!validData(data)) throw new Error('Guardado bloqueado: datos inválidos');
  const file=dataFile(),dir=path.dirname(file),tmp=file+'.tmp',backup=file+'.bak';
  fs.mkdirSync(dir,{recursive:true});
  const json=JSON.stringify(data,null,2);
  if (fs.existsSync(file)) {
    // Nunca sobrescribir un archivo dañado ni permitir un vaciado accidental masivo.
    const previous=readValidated(file);
    if(previous.orders.length>0 && data.orders.length===0)
      throw new Error('Protección de pedidos: se rechazó un intento de vaciar todo el historial.');
    if(previous.products.length>0 && data.products.length===0)
      throw new Error('Protección del menú: se rechazó un intento de vaciar todo el catálogo.');
    try { saveDailySnapshot(file); } catch(e) { console.error('No se pudo guardar copia diaria:',e); }
    // El autosalvado periódico no debe gastar ni reemplazar los respaldos si nada cambió.
    if (fs.readFileSync(file,'utf8')===json) return {ok:true,file,unchanged:true};
    for(let i=10;i>=2;i--){
      const prev= i===2?backup+'.1':backup+'.'+(i-1);
      const next=backup+'.'+i;
      if(fs.existsSync(prev)) fs.copyFileSync(prev,next);
    }
    if(fs.existsSync(backup)) fs.copyFileSync(backup,backup+'.1');
    fs.copyFileSync(file,backup);
  }
  fs.writeFileSync(tmp,json,'utf8');
  try {
    readValidated(tmp);
    // Confirmar que el contenido esta escrito en el disco antes del rename atomico.
    const fd=fs.openSync(tmp,'r');
    try {fs.fsyncSync(fd)} finally {fs.closeSync(fd)}
    fs.renameSync(tmp,file);
  } catch(e) {
    try{fs.unlinkSync(tmp)}catch{}
    throw e;
  }
  return {ok:true,file};
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

  mainWindow.on('close', event => guardWindowClose(mainWindow, event));
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
  if(startupStorageError){
    dialog.showErrorBox('Datos protegidos: no se iniciará la aplicación',
      String(startupStorageError.message||startupStorageError)+
      '\n\nNo se ha borrado ningún pedido. Haz una copia de las carpetas antes de cambiar archivos.');
    app.quit();
    return;
  }
  ipcMain.on('app:save-complete', confirmWindowSave);
  ipcMain.handle('app:info', () => ({version:app.getVersion(),packaged:app.isPackaged,storage:'unificado'}));
  ipcMain.handle('data:get', () => readData());
  ipcMain.handle('device:id', () => getDeviceId());
  ipcMain.handle('external:open', async (_event, url) => { try { const u=new URL(String(url)); if(u.hostname!=='wa.me'&&u.hostname!=='api.whatsapp.com') return {ok:false}; await shell.openExternal(u.toString()); return {ok:true}; } catch { return {ok:false}; } });
  ipcMain.handle('data:set', (_event, data) => writeData(data));
  ipcMain.handle('server:request', async (_event, request = {}) => {
    try {
      const base = String(request.baseUrl || '').trim().replace(/\/$/, '');
      if (!base) return { ok: false, status: 0, error: 'Configura la URL del servidor.' };
      const parsed = new URL(base);
      if (parsed.protocol !== 'https:') return { ok: false, status: 0, error: 'El servidor debe usar HTTPS.' };

      const method = String(request.method || 'GET').toUpperCase();
      const pathName = String(request.path || '/');
      const headers = { Accept: 'application/json' };
      if (request.apiKey) headers['X-API-Key'] = String(request.apiKey);
      if (request.sessionToken) headers['X-Session-Token'] = String(request.sessionToken);
      if (request.body !== undefined && request.body !== null) headers['Content-Type'] = 'application/json';

      // Tiempo máximo de espera: evita bloqueos si Render o la red dejan de responder.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let response, raw;
      try {
        response = await fetch(base + (pathName.startsWith('/') ? pathName : '/' + pathName), {
          method,
          headers,
          signal: controller.signal,
          body: request.body !== undefined && request.body !== null ? JSON.stringify(request.body) : undefined
        });
        raw = await response.text();
      } finally {
        clearTimeout(timeout);
      }
      let data = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
      const errorText = response.ok ? null : (typeof data?.error === 'string' ? data.error : (response.status >= 500 ? 'Servidor Render temporalmente no disponible (HTTP ' + response.status + '). Reintentando conexión.' : 'Error HTTP ' + response.status));
      return { ok: response.ok, status: response.status, data: response.ok ? data : null, error: errorText };
    } catch (error) {
      const message = error?.name === 'AbortError'
        ? 'Render no respondió en 15 segundos. Los datos locales siguen guardados.'
        : (error?.message || 'No se pudo conectar con el servidor.');
      return { ok: false, status: 0, error: message };
    }
  });
  ipcMain.handle('preview:voucher', async (_event, html) => {
    try {
      const win = new BrowserWindow({width:500,height:780,title:'Vista previa del voucher',autoHideMenuBar:true,webPreferences:{sandbox:true}});
      await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(String(html||'')));
      win.show();
      return {ok:true};
    } catch(error) {return {ok:false,error:String(error)};}
  });
  ipcMain.handle('pdf:voucher', async (_event, html) => {
    const win = new BrowserWindow({show:false,width:420,height:700,webPreferences:{sandbox:true}});
    try {
      await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(String(html||'')));
      const result=await dialog.showSaveDialog(mainWindow,{title:'Guardar voucher en PDF',defaultPath:'voucher-'+Date.now()+'.pdf',filters:[{name:'Documento PDF',extensions:['pdf']}]});
      if(result.canceled||!result.filePath)return {ok:false,canceled:true};
      const pdf=await win.webContents.printToPDF({printBackground:true,preferCSSPageSize:false,pageSize:{width:80000,height:160000},margins:{top:0,bottom:0,left:0,right:0}});
      fs.writeFileSync(result.filePath,pdf);
      return {ok:true,file:result.filePath};
    }catch(error){return {ok:false,error:String(error)};}
    finally{if(!win.isDestroyed())win.close();}
  });
  ipcMain.handle('print:voucher', async (_event, html) => {
    const win = new BrowserWindow({ show: false, width: 420, height: 700, webPreferences: { sandbox: true } });
    try {
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(String(html || '')));
      const printers = await win.webContents.getPrintersAsync();
      const thermal = printers.find(p => /thermal|pos|receipt|ticket|80mm/i.test((p.name || '') + ' ' + (p.displayName || '')));
      const options = { silent: Boolean(thermal), printBackground: true, margins: { marginType: 'none' } };
      if (thermal) options.deviceName = thermal.name;
      const ok = await new Promise(resolve => win.webContents.print(options, success => resolve(success)));
      return { ok, printer: thermal ? thermal.name : null, dialog: !thermal };
    } finally {
      if (!win.isDestroyed()) win.close();
    }
  });
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
    if (!validData(data)) throw new Error('El archivo de respaldo no es válido');
    // Nunca sobrescribir los datos al elegir el archivo: falta confirmar en la interfaz.
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
