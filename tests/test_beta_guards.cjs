const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const code=fs.readFileSync(path.join(__dirname,'..','src','app.js'),'utf8');
const start=code.indexOf('function betaServerAllowed(url){');
const end=code.indexOf('function safeSyncMessage(',start);
assert.ok(start>=0&&end>start,'No se encontró guardia de servidor de prueba');
const sandbox={state:{settings:{serverUrl:'',apiKey:'clave-prueba'}}};
vm.createContext(sandbox);
vm.runInContext(code.slice(start,end),sandbox);
test('la beta bloquea servidores de produccion',()=>{
 for(const url of ['https://pedidos-comida-2ktc.onrender.com','https://example.org','https://localhost.evil.com']){
   sandbox.state.settings.serverUrl=url;
   assert.equal(vm.runInContext('syncConfigured()',sandbox),false,url);
 }
});
test('la beta solo permite sincronizar con un servidor local configurado',()=>{
 for(const url of ['http://127.0.0.1:5000','http://localhost:5000']){
   sandbox.state.settings.serverUrl=url;
   assert.equal(vm.runInContext('syncConfigured()',sandbox),true,url);
 }
 sandbox.state.settings.apiKey='';
 assert.equal(vm.runInContext('syncConfigured()',sandbox),false);
});
test('los estados de entrega preservan la primera fecha y la eliminan al reabrir',()=>{
 assert.match(code,/if\(val==="Entregado"\)\{o\.delivered=true;o\.deliveredAt=o\.deliveredAt\|\|new Date\(\)\.toISOString\(\)\}/);
 assert.match(code,/else if\(o\.delivered\)\{o\.delivered=false;o\.deliveredAt=null\}/);
});
