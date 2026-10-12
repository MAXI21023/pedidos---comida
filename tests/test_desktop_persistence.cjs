// Pruebas de persistencia usando un Electron simulado y archivos temporales.
// No accede a los datos del Mac del usuario ni al servidor Render.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

function boot() {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'gestor-pedidos-guardado-'));
  const windows=[];
  const messages=[];
  const handlers=new Map();
  const app=new EventEmitter();
  app.getPath=()=>folder;
  app.whenReady=()=>Promise.resolve();

  class BrowserWindow extends EventEmitter {
    constructor(){
      super();
      this.closed=false;
      this.webContents={
        sent:[],
        send:(...args)=>{this.webContents.sent.push(args)},
        setWindowOpenHandler:()=>{},
      };
      windows.push(this);
    }
    loadFile(){return Promise.resolve()}
    isDestroyed(){return this.closed}
    close(){
      const event={defaultPrevented:false,preventDefault(){this.defaultPrevented=true}};
      this.emit('close',event);
      if(!event.defaultPrevented)this.closed=true;
    }
    static fromWebContents(webContents){return windows.find(w=>w.webContents===webContents)||null}
    static getAllWindows(){return windows.filter(w=>!w.closed)}
  }

  const ipcMain=new EventEmitter();
  ipcMain.handle=(name,callback)=>handlers.set(name,callback);
  const dialog={
    showMessageBox:async(...args)=>{messages.push(args);return {response:0}},
    showOpenDialog:async()=>({canceled:true,filePaths:[]}),
  };
  const electron={app,BrowserWindow,ipcMain,Notification:{isSupported:()=>false},
    dialog,shell:{openExternal:async()=>{}}};
  const context={
    require:(name)=>name==='electron'?electron:require(name),
    __dirname:path.resolve(__dirname,'..'),
    process,console,setTimeout,clearTimeout,
  };
  vm.runInNewContext(
    mainSource+'\\n;globalThis.__storageHooks={readData,writeData,dataFile};',
    context,{filename:'main.js'},
  );
  return {folder,windows,dialog,messages,ipcMain,handlers,...context.__storageHooks,
    cleanup:()=>fs.rmSync(folder,{recursive:true,force:true})};
}

function data(orderCount=13,productCount=6) {
  return {
    products:Array.from({length:productCount},(_,i)=>({id:i+1,name:'Burger '+(i+1),price:6500})),
    orders:Array.from({length:orderCount},(_,i)=>({id:i+1,number:i+1,client:'Cliente '+(i+1)})),
    settings:{businessName:'Mi Hamburguesería',serverUrl:'https://example.invalid'},
  };
}

test('cerrar y volver a iniciar conserva pedidos, menú y configuración',()=>{
  const env=boot();
  try{
    const original=data();
    const saved=env.writeData(original);
    assert.equal(saved.ok,true);
    assert.deepEqual(JSON.parse(JSON.stringify(env.readData())),original);
    assert.equal(fs.existsSync(env.dataFile()),true);
  }finally{env.cleanup()}
});

test('no permite reemplazar los pedidos ni el menú por listas vacías',()=>{
  const env=boot();
  try{
    env.writeData(data());
    assert.throws(()=>env.writeData(data(0,6)),/Protección de pedidos/);
    assert.throws(()=>env.writeData(data(13,0)),/Protección del menú/);
    assert.equal(env.readData().orders.length,13);
    assert.equal(env.readData().products.length,6);
  }finally{env.cleanup()}
});

test('recupera datos desde un respaldo si el archivo principal está corrupto',()=>{
  const env=boot();
  try{
    env.writeData(data(13));
    env.writeData(data(14));
    fs.writeFileSync(env.dataFile(),'archivo accidentalmente corrupto','utf8');
    const recovered=env.readData();
    assert.equal(recovered.orders.length,13);
    assert.equal(env.readData().orders.length,13);
  }finally{env.cleanup()}
});

test('espera confirmación de guardado antes de cerrar ventana',async()=>{
  const env=boot();
  try{
    await Promise.resolve();
    const win=env.windows[0];
    assert.ok(win);
    win.close();
    assert.equal(win.closed,false);
    assert.equal(win.waitingForSave,true);
    assert.equal(win.webContents.sent[0][0],'app:save-and-close');
    env.ipcMain.emit('app:save-complete',{sender:win.webContents},{ok:true});
    assert.equal(win.closed,true);
  }finally{env.cleanup()}
});

test('si falla el guardado, el cierre queda cancelado',async()=>{
  const env=boot();
  try{
    await Promise.resolve();
    const win=env.windows[0];
    win.close();
    env.ipcMain.emit('app:save-complete',{sender:win.webContents},
      {ok:false,error:'Espacio insuficiente'});
    assert.equal(win.closed,false);
    assert.equal(win.waitingForSave,false);
    assert.ok(env.messages.length>0);
  }finally{env.cleanup()}
});

test('el archivo de importación no se escribe antes de confirmar',async()=>{
  const env=boot();
  try{
    await Promise.resolve();
    const initial=data(13);
    env.writeData(initial);
    const importedFile=path.join(env.folder,'viejo-respaldo.json');
    fs.writeFileSync(importedFile,JSON.stringify(data(1)),'utf8');
    env.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[importedFile]});
    const result=await env.handlers.get('backup:import')();
    assert.equal(result.orders.length,1);
    assert.equal(env.readData().orders.length,13);
  }finally{env.cleanup()}
});

test('preload confirma a Electron después de terminar el guardado',async()=>{
  const ipcRenderer=new EventEmitter();
  const sent=[];
  ipcRenderer.send=(...args)=>sent.push(args);
  ipcRenderer.invoke=async()=>null;
  let exposed;
  vm.runInNewContext(preloadSource,{
    require:(name)=>name==='electron'?{
      contextBridge:{exposeInMainWorld:(key,api)=>{exposed=api}},
      ipcRenderer,
    }:require(name),
    Promise,
  },{filename:'preload.js'});
  let saved=false;
  exposed.onSaveAndClose(async()=>{await Promise.resolve();saved=true});
  ipcRenderer.emit('app:save-and-close');
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(saved,true);
  assert.equal(sent[0][0],'app:save-complete');
  assert.equal(sent[0][1].ok,true);
});
