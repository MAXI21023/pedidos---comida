// Comprueba que el respaldo del Mac copie y verifique archivos sin cambiarlos.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');

test('respaldo recopila y verifica dos carpetas de datos sin sobrescribir originales',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'gestor-prueba-respaldo-'));
 const root=path.join(home,'Library','Application Support');
 const lines=[];
 try{
  const folders=['Gestor de Pedidos','gestor-pedidos-whatsapp'];
  for(let index=0;index<folders.length;index++){
   const dir=path.join(root,folders[index]);
   fs.mkdirSync(dir,{recursive:true});
   const count=index?13:0;
   fs.writeFileSync(path.join(dir,'gestor-pedidos-data.json'),JSON.stringify({
    orders:Array.from({length:count},(_,i)=>({id:i+1})),
    products:[{id:1,name:'Producto'}],
    settings:{apiKey:'clave-de-prueba'}
   }), 'utf8');
   fs.writeFileSync(path.join(dir,'device-id.txt'),'device-test-'+index,'utf8');
  }
  const original=fs.readFileSync(path.join(root,folders[1],'gestor-pedidos-data.json'));
  const script=fs.readFileSync(path.join(__dirname,'..','scripts','resguardar-datos.cjs'),'utf8');
  const fakeProcess={platform:'darwin',exitCode:0};
  const fakeRequire=id=>id==='node:os'?{homedir:()=>home}:require(id);
  vm.runInNewContext(script,{
   require:fakeRequire,
   process:fakeProcess,
   console:{log:(...a)=>lines.push(a.join(' ')),error:(...a)=>lines.push(a.join(' '))}
  },{filename:'resguardar-datos.cjs'});
  assert.equal(fakeProcess.exitCode,0);
  const backupBase=path.join(home,'Documents','Respaldos Gestor de Pedidos');
  const snapshots=fs.readdirSync(backupBase);
  assert.equal(snapshots.length,1);
  for(const folder of folders){
   const source=path.join(root,folder,'gestor-pedidos-data.json');
   const backup=path.join(backupBase,snapshots[0],folder,'gestor-pedidos-data.json');
   assert.equal(fs.existsSync(backup),true);
   assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
    crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex'));
  }
  assert.deepEqual(fs.readFileSync(path.join(root,folders[1],'gestor-pedidos-data.json')),original);
  assert.ok(lines.some(x=>x.includes('13 pedidos')));
  assert.ok(lines.some(x=>x.includes('NO se modificaron')));
 }finally{fs.rmSync(home,{recursive:true,force:true})}
});
