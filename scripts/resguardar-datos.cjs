#!/usr/bin/env node
// Respaldo de solo lectura. NO modifica, borra, importa ni restaura datos.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');

if(process.platform!=='darwin'){
  console.error('Este procedimiento está preparado para el Mac.');
  process.exitCode=1;
}else{
  const root=path.join(os.homedir(),'Library','Application Support');
  const names=['gestor-pedidos-whatsapp','Gestor de Pedidos',
    'Gestor-de-Pedidos','gestor-pedidos','cl.gestorpedidos.desktop'];
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const destination=path.join(os.homedir(),'Documents','Respaldos Gestor de Pedidos','copia-'+stamp);
  let copied=0,stored=0,problem=false;
  const safeRead=file=>{
    try{
      const x=JSON.parse(fs.readFileSync(file,'utf8'));
      if(!Array.isArray(x.orders)||!Array.isArray(x.products))return null;
      return {orders:x.orders.length,products:x.products.length};
    }catch{return null}
  };
  function checksum(file){
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  function copyVerified(source,target){
    fs.mkdirSync(path.dirname(target),{recursive:true,mode:0o700});
    fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
    if(checksum(source)!==checksum(target))
      throw new Error('El respaldo no coincide con el archivo original: '+source);
    fs.chmodSync(target,0o600);
    copied++;
  }
  function walkSafe(directory,out,level=0){
    if(level>4)return;
    for(const item of fs.readdirSync(directory,{withFileTypes:true})){
      const source=path.join(directory,item.name),target=path.join(out,item.name);
      if(item.isDirectory()&&['daily-backups','migration-backups'].includes(item.name)){
        walkSafe(source,target,level+1);
      }else if(item.isDirectory()&&level>0&&/^source-\d+$/.test(item.name)){
        walkSafe(source,target,level+1);
      }else if(item.isDirectory()&&level>0&&/^copia-|^\d{4}-\d{2}-\d{2}T/.test(item.name)){
        walkSafe(source,target,level+1);
      }else if(item.isFile()&&(
        item.name==='device-id.txt'||
        item.name.startsWith('gestor-pedidos-data.json')||
        /^gestor-pedidos-\d{4}-\d{2}-\d{2}\.json$/.test(item.name)
      )){
        copyVerified(source,target);
      }
    }
  }
  try{
    for(const name of names){
      const dir=path.join(root,name);
      if(!fs.existsSync(dir)||!fs.statSync(dir).isDirectory())continue;
      const primary=path.join(dir,'gestor-pedidos-data.json');
      if(!fs.existsSync(primary)&&!fs.readdirSync(dir).some(f=>f.startsWith('gestor-pedidos-data.json')))
        continue;
      fs.mkdirSync(destination,{recursive:true,mode:0o700});
      const before=copied;
      walkSafe(dir,path.join(destination,name));
      if(copied>before){
        stored++;
        const counts=fs.existsSync(primary)?safeRead(primary):null;
        console.log(name+': copia verificada'+
          (counts?' · '+counts.orders+' pedidos, '+counts.products+' productos':' · revisar archivo principal'));
      }
    }
    if(!stored) {
      console.error('No se encontraron archivos de datos. NO se ha creado ni reemplazado ninguno.');
      process.exitCode=2;
    } else{
      console.log('\nRESPALDO CREADO Y VERIFICADO');
      console.log('Carpeta: '+destination);
      console.log('Archivos copiados: '+copied+' · Carpetas encontradas: '+stored);
      console.log('NO se modificaron los datos originales.');
      console.log('Guarda esta carpeta en un disco externo o iCloud privado.');
    }
  }catch(error){
    console.error('No se pudo completar el respaldo: '+(error?.message||error));
    console.error('No borres ninguna carpeta ni intentes importar archivos.');
    process.exitCode=1;
  }
}
