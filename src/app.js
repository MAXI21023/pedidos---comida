const defaultProducts=[
{id:1,name:"La Clásica",type:"Hamburguesa",desc:"110 g vacuno · queso · lechuga · tomate · salsa de la casa",price:6500,cost:3500,active:true},
{id:2,name:"La Criolla",type:"Hamburguesa",desc:"110 g vacuno · huevo · cebolla caramelizada · salsa de la casa",price:7500,cost:4100,active:true},
{id:3,name:"Bacon Crunch",type:"Hamburguesa",desc:"110 g vacuno · tocino · cebolla crispy · pepinillo · mermelada de tocino",price:7900,cost:4400,active:true},
{id:4,name:"Doble",type:"Hamburguesa",desc:"220 g vacuno · doble queso · pepinillos · salsa especial",price:8900,cost:5100,active:true},
{id:5,name:"Papas Fritas",type:"Acompañamiento",desc:"Porción de papas fritas",price:3000,cost:1200,active:true},
{id:6,name:"Bebida",type:"Bebestible",desc:"Bebida individual",price:2000,cost:900,active:true}
];

let state={products:[],orders:[],settings:{businessName:"Mi Hamburguesería",businessPhone:"",thanksMessage:"¡Gracias por tu pedido!",serverUrl:"https://pedidos-comida-2ktc.onrender.com",apiKey:"",syncInitialized:false}};
let cart=[];

const money=n=>"$"+Math.round(Number(n)||0).toLocaleString("es-CL");
const CHILE_TIME_ZONE="America/Santiago";
const formatChileDateTime=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?String(value||""):new Intl.DateTimeFormat("es-CL",{timeZone:CHILE_TIME_ZONE,day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(d)};
const parseServerDate=value=>{if(!value)return new Date().toISOString();const raw=String(value).trim();if(/[zZ]$|[+-]\\d{2}:?\\d{2}$/.test(raw))return new Date(raw).toISOString();return raw.replace(" ","T")};
const todayISO=()=>new Intl.DateTimeFormat("en-CA",{timeZone:CHILE_TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const calcMargin=(price,cost)=>price?((price-cost)/price*100):0;
const calcSuggested=(cost,margin)=>{const m=Number(margin)/100;return m>=1?0:Number(cost)/(1-m)};
const escapeHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

let persistQueue=Promise.resolve();
function persist(){
 const snapshot=JSON.parse(JSON.stringify(state));
 persistQueue=persistQueue.then(()=>window.desktopAPI.setData(snapshot)).catch(e=>{console.error("Error guardando datos",e)});
 return persistQueue
}
document.getElementById("delivery")?.addEventListener("change",renderCart);
async function init(){
  const saved=await window.desktopAPI.getData();
  state=saved||state;
  localMenuHasSavedProducts=Boolean(saved && Array.isArray(saved.products) && saved.products.length);
  if(!Array.isArray(state.products)||!state.products.length) state.products=defaultProducts;
  if(!Array.isArray(state.orders)) state.orders=[];
  if(!Array.isArray(state.ingredients)) state.ingredients=[];
  if(!state.dailyStock) state.dailyStock={};
  state.settings={businessName:"Mi Hamburguesería",businessPhone:"",thanksMessage:"¡Gracias por tu pedido!",serverUrl:"https://pedidos-comida-2ktc.onrender.com",apiKey:"",sessionToken:"",licenseActive:false,licensedBusiness:"",businessId:null,syncInitialized:false,...(state.settings||{})};
  await persist();
  renderAll();
  await validateLicense();
  startServerSync();
  if(saved && Array.isArray(saved.products) && saved.products.length && saved.products.some(p=>p.active)) publishMenuOnStartup();
}


function orderChileISO(o){
 const raw=o.createdAt||"";
 const d=new Date(raw);
 if(Number.isNaN(d.getTime()))return String(raw).slice(0,10);
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const v=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return v.year+"-"+v.month+"-"+v.day;
}
function renderSoldProducts(){
 const from=document.getElementById("soldFrom")?.value||"";
 const to=document.getElementById("soldTo")?.value||"";
 const orders=state.orders.filter(o=>{const d=orderChileISO(o);return (!from||d>=from)&&(!to||d<=to)});
 const grouped=new Map();let burgers=0,fries=0,comboFries=0,drinks=0,extraCheese=0,extraMeat=0,others=0;
 for(const o of orders){
  for(const x of (Array.isArray(o.items)?o.items:[])){
   const qty=Number(x.qty||0);
   if(!Number.isFinite(qty)||qty<=0)continue;
   const name=String(x.name||"Producto"),type=String(x.type||"").toLowerCase();
   const isExtraCheese=/(extra|adicional)\s+(de\s+)?queso|queso\s+(extra|adicional)/i.test(name);
   const isExtraMeat=/(extra|adicional)\s+(de\s+)?carne|carne\s+(extra|adicional)/i.test(name);
   const isDrink=/bebida|bebestible|gaseosa|refresco|coca.?cola|sprite|fanta|jugo|agua mineral/i.test(type+" "+name);
   const isBurger=type.includes("hamburg")||/burger|hamburg|clásica|criolla|bacon crunch/i.test(name);
   const isFries=/papa|fries|frita/i.test(type+" "+name);
   const category=isExtraCheese?"cheese":isExtraMeat?"meat":isDrink?"drink":isBurger?"burger":isFries?"fries":"other";
   if(isBurger)comboFries+=qty;
   if(category==="burger")burgers+=qty;else if(category==="fries")fries+=qty;else if(category==="drink")drinks+=qty;else if(category==="cheese")extraCheese+=qty;else if(category==="meat")extraMeat+=qty;else others+=qty;
   const key=category+"|"+name.toLocaleLowerCase("es");
   const old=grouped.get(key)||{name,category,qty:0,amount:0};
   old.qty+=qty;old.amount+=qty*Number(x.price||0);grouped.set(key,old);
  }
 }
 document.getElementById("soldBurgers").textContent=burgers.toLocaleString("es-CL");
 document.getElementById("soldFries").textContent=fries.toLocaleString("es-CL");
 document.getElementById("soldComboFries").textContent=comboFries.toLocaleString("es-CL");
 document.getElementById("soldAllFries").textContent=(fries+comboFries).toLocaleString("es-CL");
 document.getElementById("soldDrinks").textContent=drinks.toLocaleString("es-CL");
 document.getElementById("soldExtraCheese").textContent=extraCheese.toLocaleString("es-CL");
 document.getElementById("soldExtraMeat").textContent=extraMeat.toLocaleString("es-CL");
 document.getElementById("soldOthers").textContent=others.toLocaleString("es-CL");
 document.getElementById("soldUnits").textContent=(burgers+fries+comboFries+drinks+extraCheese+extraMeat+others).toLocaleString("es-CL");
 document.getElementById("soldOrders").textContent=orders.length.toLocaleString("es-CL");
 const catalog=new Map();
 for(const p of (state.products||[])){
  const name=String(p.name||"").trim();
  if(!name)continue;
  const key=name.toLocaleLowerCase("es");
  if(!catalog.has(key))catalog.set(key,{name,qty:0,amount:0});
 }
 for(const x of grouped.values()){
  const key=x.name.toLocaleLowerCase("es");
  const old=catalog.get(key);
  if(old){old.qty+=x.qty;old.amount+=x.amount}
  else catalog.set(key,{name:x.name,qty:x.qty,amount:x.amount});
 }
 const list=[...catalog.values()].sort((a,b)=>b.qty-a.qty||a.name.localeCompare(b.name));
 document.getElementById("soldDetails").innerHTML=list.length?'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Producto</th><th>Unidades</th><th>Venta de productos</th></tr></thead><tbody>'+list.map(x=>'<tr><td>'+escapeHtml(x.name)+'</td><td style="text-align:center">'+x.qty.toLocaleString("es-CL")+'</td><td style="text-align:right">'+money(x.amount)+'</td></tr>').join("")+'</tbody></table></div>':'No hay productos vendidos en el período seleccionado.';
}
function clearSoldDates(){document.getElementById("soldFrom").value="";document.getElementById("soldTo").value="";renderSoldProducts()}

function renderAll(){
  document.getElementById("brandName").textContent=(state.settings.businessName||"Mi Hamburguesería").toUpperCase();
  document.getElementById("businessName").value=state.settings.businessName||"";
  document.getElementById("businessPhone").value=state.settings.businessPhone||"";
  document.getElementById("thanksMessage").value=state.settings.thanksMessage||"";
  document.getElementById("serverUrl").value=state.settings.serverUrl||"";
  document.getElementById("apiKey").value=state.settings.apiKey||"";
  renderLicenseStatus();
  renderProducts();renderCart();renderBadges();renderOrders();renderStats();renderSoldProducts();renderAdmin();renderInventory();renderDailyStock();
}
function goTab(id,btn){["new","orders","cash","sold","admin","settings"].forEach(x=>document.getElementById(x).classList.toggle("hidden",x!==id));document.querySelectorAll(".nav button").forEach(x=>x.classList.remove("active"));btn.classList.add("active");if(id==="orders")renderOrders();if(id==="cash")renderStats();if(id==="sold")renderSoldProducts();if(id==="admin"){renderAdmin();renderInventory()}}
function fillCategoryFilter(){const sel=document.getElementById("categoryFilter"),current=sel.value||"all",cats=[...new Set(state.products.map(p=>p.type).filter(Boolean))].sort();sel.innerHTML='<option value="all">Todas las categorías</option>'+cats.map(c=>`<option ${c===current?"selected":""}>${escapeHtml(c)}</option>`).join("")}

let stockEditing=false;
function markStockEditing(){stockEditing=true}
function renderDailyStock(){
 const body=document.getElementById("dailyStockRows"); if(!body)return;
 body.innerHTML=state.products.filter(p=>p.active).map(p=>{
  const s=state.dailyStock[String(p.id)]||{stock:0,available:true};
  return '<tr><td><b>'+escapeHtml(p.name)+'</b></td><td><input data-stock-id="'+p.id+'" type="number" min="0" value="'+(Number(s.stock)||0)+'"></td><td><select data-stock-available="'+p.id+'"><option value="true" '+(s.available!==false?'selected':'')+'>Disponible</option><option value="false" '+(s.available===false?'selected':'')+'>No disponible</option></select></td></tr>';
 }).join("");
 body.querySelectorAll("[data-stock-id], [data-stock-available]").forEach(el=>el.addEventListener("input",markStockEditing));
 body.querySelectorAll("[data-stock-available]").forEach(el=>el.addEventListener("change",markStockEditing));
}
async function loadDailyStock(){
 if(!syncConfigured())return false;
 if(stockEditing||document.activeElement?.matches?.("[data-stock-id], [data-stock-available]"))return false;
 const res=await apiCall("/api/desktop/stock");
 if(!res.ok)return false;
 for(const x of (res.data||[])){
  const key=String(x.desktop_id||x.id);
  state.dailyStock[key]={stock:Number(x.stock_diario)||0,available:Boolean(x.disponible)};
 }
 await persist(); renderDailyStock(); return true;
}
async function saveDailyStock(){
 stockEditing=true;
 document.querySelectorAll("[data-stock-id]").forEach(el=>{
  const id=String(el.dataset.stockId);
  const av=document.querySelector('[data-stock-available="'+id+'"]');
  state.dailyStock[id]={stock:Math.max(0,Number(el.value)||0),available:av?av.value==="true":true};
 });
 await persist();
 const products=state.products.filter(p=>p.active).map(p=>({id:String(p.id),stock:state.dailyStock[String(p.id)]?.stock||0,available:state.dailyStock[String(p.id)]?.available!==false}));
 if(!syncConfigured()){setSyncStatus("warn","Stock guardado localmente; pendiente de sincronización");alert("Stock guardado en este computador. Configura la sincronización para publicarlo en la web.");return true;}
 const res=await apiCall("/api/desktop/stock","POST",{products:products});
 if(!res.ok){setSyncStatus("warn","Stock local guardado; sincronización pendiente");alert("Stock guardado en este computador, pero NO se actualizó en la web: "+(res.error||res.status));return false;}
 stockEditing=false;
 await loadDailyStock();
 setSyncStatus("on","Stock sincronizado"); alert("Stock del día guardado y sincronizado."); return true;
}

function renderProducts(){fillCategoryFilter();const filter=document.getElementById("categoryFilter").value,list=state.products.filter(p=>p.active&&(filter==="all"||p.type===filter));document.getElementById("products").innerHTML=list.length?list.map(p=>`<div class="product"><div class="row between"><span class="status">${escapeHtml(p.type||"Producto")}</span><span class="smalltxt">#${p.id}</span></div><h3>${escapeHtml(p.name)}</h3><div class="muted">${escapeHtml(p.desc||"")}</div><div class="price">${money(p.price)}</div><button class="primary full" onclick="addToCart(${p.id})">+ Agregar</button></div>`).join(""):'<div class="muted">No hay productos disponibles.</div>'}
function addToCart(id){const p=state.products.find(x=>x.id===id);if(!p)return;const c=cart.find(x=>x.id===id);c?c.qty++:cart.push({...p,qty:1});renderCart()}
function changeQty(id,d){const c=cart.find(x=>x.id===id);if(!c)return;c.qty+=d;if(c.qty<=0)cart=cart.filter(x=>x.id!==id);renderCart()}
function deliveryCharge(){return document.getElementById("delivery")?.value==="Delivery"?1000:0}
function cartTotal(){return cart.reduce((s,x)=>s+Number(x.price||0)*Number(x.qty||0),0)+deliveryCharge()}function cartCost(){return cart.reduce((s,x)=>s+Number(x.cost||0)*Number(x.qty||0),0)}
function renderCart(){const el=document.getElementById("cart");el.innerHTML=cart.length?cart.map(x=>`<div class="cart-item"><div class="row between"><div><b>${escapeHtml(x.name)}</b><div class="muted">${money(x.price)} c/u</div></div><div class="row"><button class="secondary small" onclick="changeQty(${x.id},-1)">−</button><span class="qty">${x.qty}</span><button class="secondary small" onclick="changeQty(${x.id},1)">+</button></div></div></div>`).join(""):'<div class="muted">Agrega productos desde el menú.</div>';const t=cartTotal(),c=cartCost();const tip=Number(document.getElementById("newOrderTip")?.value||0);document.getElementById("total").textContent=money(t+(Number.isFinite(tip)&&tip>=0?tip:0));document.getElementById("orderSubtotal").textContent=money(t);document.getElementById("orderTipPreview").textContent=money(Number.isFinite(tip)&&tip>=0?tip:0);document.getElementById("cartCost").textContent=money(c);document.getElementById("cartProfit").textContent=money(t-c);document.getElementById("cartMargin").textContent=(t?((t-c)/t*100):0).toFixed(1)+"%"}
function getOrderData(){const t=cartTotal(),c=cartCost(),tip=Number(document.getElementById("newOrderTip")?.value||0);return{tip,id:Date.now(),number:(state.orders.length?Math.max(...state.orders.map(o=>o.number||0)):0)+1,createdAt:new Date().toISOString(),date:formatChileDateTime(new Date()),client:document.getElementById("client").value.trim()||"Sin nombre",phone:document.getElementById("phone").value.trim(),delivery:document.getElementById("delivery").value,payment:document.getElementById("payment").value,address:document.getElementById("address").value.trim(),notes:document.getElementById("notes").value.trim(),items:cart.map(x=>({id:x.id,name:x.name,price:x.price,cost:x.cost,qty:x.qty,type:x.type})),total:t,cost:c,profit:t-c,paid:false,delivered:false,status:"Nuevo"}}
function clearCurrentOrder(){cart=[];document.getElementById("delivery").value="Retiro en local";document.getElementById("newOrderTip").value="0";renderCart();["client","phone","address","notes"].forEach(id=>document.getElementById(id).value="")}
async function saveOrder(showAlert=true){
 const tip=Number(document.getElementById("newOrderTip").value||0);
 if(!Number.isInteger(tip)||tip<0){alert("Ingresa una propina válida.");return null}
 if(!cart.length){alert("Agrega al menos un producto.");return null}
 const o=getOrderData();
 state.orders.unshift(o);
 try{
  await persist();
  const saved=await window.desktopAPI.getData();
  if(!saved||!Array.isArray(saved.orders)||!saved.orders.some(x=>String(x.id)===String(o.id)))
   throw new Error("El pedido no figura en el archivo local después de guardar.");
 }catch(e){
  alert("No se pudo verificar el guardado del pedido. No cierres la aplicación y guarda un respaldo. Detalle: "+(e?.message||e));
  return null;
 }
 clearCurrentOrder();renderOrders();renderBadges();renderStats();renderSoldProducts();
 let synced=false;
 if(syncConfigured()){
  const res=await apiCall("/api/desktop/orders","POST",{
   client_id:String(o.id),client:o.client,phone:o.phone,address:o.address,
   delivery:o.delivery,payment:o.payment,notes:o.notes,total:o.total,
   tip:o.tip||0,paid:Boolean(o.paid),status:o.status,createdAt:o.createdAt,items:o.items
  });
  if(res.ok&&res.data?.id){o.remoteId=res.data.id;await persist();synced=true}
  else setSyncStatus("warn","Pedido guardado en Mac; envío a Render pendiente");
 }
 if(showAlert)alert("Pedido #"+o.number+" guardado en Mac."+ (synced?" También registrado en Render.":" Pendiente de confirmar en Render."));
 return o
}
async function saveAndWhatsApp(){const o=await saveOrder(false);if(!o)return;openWhatsApp(o);alert("Pedido #"+o.number+" guardado en Mac y preparado para WhatsApp."+(o.remoteId?" Sincronizado con Render.":" Envío a Render pendiente."))}
function orderMessage(o){return `🍔 *PEDIDO #${o.number}*\nCliente: ${o.client}\n\n${o.items.map(x=>`${x.qty} x ${x.name} — ${money(x.price*x.qty)}`).join("\n")}\n\n*TOTAL: ${money(o.total)}*\nEntrega: ${o.delivery}\nPago: ${o.payment}${o.address?`\nDirección: ${o.address}`:""}${o.notes?`\nObservaciones: ${o.notes}`:""}\n\n${state.settings.thanksMessage||"¡Gracias por tu pedido!"}`}
function openWhatsApp(o){const phone=(o.phone||"").replace(/\D/g,"");const url=phone?`https://wa.me/${phone}?text=${encodeURIComponent(orderMessage(o))}`:`https://wa.me/?text=${encodeURIComponent(orderMessage(o))}`;window.open(url,"_blank")}
async function setOrderStatus(id,val){
 const o=state.orders.find(x=>String(x.id)===String(id));if(!o)return;
 const previous=o.status;
 if(o.remoteId&&syncConfigured()){
  const res=await apiCall("/api/desktop/orders/"+o.remoteId,"PATCH",{estado:val,pagado:Boolean(o.paid)});
  if(!res.ok){
   setSyncStatus("warn","No se pudo confirmar: "+(res.error||res.status));
   alert("No se pudo cambiar el estado del pedido #"+o.number+": "+(res.error||res.status)+". El pedido sigue en "+previous+".");
   return;
  }
  setSyncStatus("on","Pedido actualizado en servidor");
 }else if(o.remoteId){
  alert("Sin conexión con el servidor. No se confirmó el pedido web. Revisa la licencia y sincronización.");
  return;
 }
 o.status=val;o.statusChangedAt=Date.now();
 if(val==="Entregado"){o.delivered=true;o.deliveredAt=new Date().toISOString()}
 await persist();renderOrders();renderBadges();renderStats();
 if(o.remoteId&&val==="Confirmado")await loadDailyStock();
 if(["Confirmado","Preparando","Listo","En reparto"].includes(val)){
  const title=val==="Confirmado"?"Pedido confirmado":val==="Listo"?"Pedido listo":val==="En reparto"?"Pedido en reparto":"Pedido en preparación";
  try{await window.desktopAPI.notify(title,`Pedido #${o.number} · ${o.client}`)}catch(e){console.error("Notificación:",e)}
  await openWhatsAppById(id);
 }
}
async function setPaid(id,val){const o=state.orders.find(x=>String(x.id)===String(id));if(!o)return;o.paid=val==="true";o.paidAt=o.paid?new Date().toISOString():null;await persist();renderOrders();renderBadges();renderStats();if(o.paid)await window.desktopAPI.notify("Pedido pagado",`Pedido #${o.number} · ${o.client} · ${money(o.total)}`);await syncOrderToServer(o)}
async function setDelivered(id,val){const o=state.orders.find(x=>String(x.id)===String(id));if(!o)return;o.delivered=val==="true";o.deliveredAt=o.delivered?new Date().toISOString():null;if(o.delivered)o.status="Entregado";await persist();renderOrders();renderBadges();renderStats();if(o.delivered)await window.desktopAPI.notify("Pedido entregado",`Pedido #${o.number} · ${o.client}`);await syncOrderToServer(o)}
async function deleteOrder(id){
 const o=state.orders.find(x=>String(x.id)===String(id));
 if(!o||!confirm("¿Eliminar definitivamente el pedido #"+o.number+"?"))return;
 if(o.remoteId){
  const res=await apiCall("/api/desktop/orders/"+encodeURIComponent(o.remoteId)+"/delete","POST");
  if(!res.ok&&res.status!==404){
   alert("No se pudo eliminar el pedido del servidor. No se borró de la aplicación: "+(res.error||res.status));
   return;
  }
 }
 state.orders=state.orders.filter(x=>String(x.id)!==String(id));
 await persist();renderOrders();renderBadges();renderStats();
}
function orderFilterPass(o){const f=document.getElementById("orderFilter")?.value||"all";if(f==="unpaid")return !o.paid;if(f==="undelivered")return !o.delivered;if(f==="today")return(o.createdAt||"").slice(0,10)===todayISO();return true}
function currentOrderCost(o){
 return (Array.isArray(o.items)?o.items:[]).reduce((sum,x)=>{
  const p=state.products.find(p=>String(p.id)===String(x.id))||
   state.products.find(p=>String(p.name||"").trim().toLocaleLowerCase("es")===String(x.name||"").trim().toLocaleLowerCase("es"));
  const unit=p&&Number.isFinite(Number(p.cost))?Number(p.cost):Number(x.cost||0);
  return sum+unit*Number(x.qty||0);
 },0);
}
function renderOrders(){const list=state.orders.filter(orderFilterPass);document.getElementById("ordersList").innerHTML=list.length?list.map(o=>{const cost=currentOrderCost(o),profit=o.total-cost,margin=calcMargin(o.total,cost);return `<div class="order ${o.paid?"paid":"unpaid"}"><div class="row between wrap"><div><b>#${o.number} · ${escapeHtml(o.client)}</b><div class="smalltxt">${escapeHtml(o.remoteId?formatChileDateTime(parseServerDate(o.createdAt)):formatChileDateTime(o.createdAt||Date.now()))}</div></div><div class="row wrap"><span class="status ${o.paid?"ok":"bad"}">${o.paid?"PAGADO":"PAGO PENDIENTE"}</span><span class="status ${o.delivered?"ok":"warn"}">${o.delivered?"ENTREGADO":"POR ENTREGAR"}</span></div></div><div class="muted" style="margin:8px 0">${o.items.map(x=>x.qty+"× "+escapeHtml(x.name)).join(" · ")}</div><div class="row between wrap"><b>${money(o.total)}${Number(o.tip||0)>0?` · Propina ${money(o.tip)}`:""}</b><span class="smalltxt">Costo ${money(cost)} · Utilidad ${money(profit)} · Margen ${margin.toFixed(1)}%</span></div><div class="two" style="margin-top:9px"><select class="paid-select" data-id="${o.id}"><option value="false" ${!o.paid?"selected":""}>💳 Pago pendiente</option><option value="true" ${o.paid?"selected":""}>💰 Pagado</option></select><select class="delivered-select" data-id="${o.id}"><option value="false" ${!o.delivered?"selected":""}>🛵 Entrega pendiente</option><option value="true" ${o.delivered?"selected":""}>✅ Entregado</option></select></div><div class="row wrap" style="margin-top:9px"><select style="flex:1" class="order-status-select" data-id="${o.id}">${["Nuevo","Confirmado","Preparando","Listo","En reparto","Entregado"].map(s=>`<option ${s===o.status?"selected":""}>${s}</option>`).join("")}</select><label class="smalltxt">💰 Propina $ <input class="tip-input" data-id="${o.id}" type="number" min="0" step="1" style="width:100px" value="${Number(o.tip||0)}"></label><button class="secondary tip-btn" data-id="${o.id}">Guardar propina</button><button class="secondary voucher-preview-btn" data-id="${o.id}">👁️ Ver voucher</button><button class="secondary voucher-pdf-btn" data-id="${o.id}">⬇️ PDF</button><button class="secondary voucher-btn" data-id="${o.id}">🖨️ Imprimir</button><button class="success whatsapp-btn" data-id="${o.id}">💬 Avisar cliente</button><button class="danger delete-order-btn" data-id="${o.id}">Eliminar</button></div></div>`}).join("") :'<div class="muted">No hay pedidos para mostrar.</div>';bindOrderActionButtons()}
async function editOrderTip(id){
 const o=state.orders.find(x=>String(x.id)===String(id));if(!o)return;
 const input=[...document.querySelectorAll(".tip-input")].find(x=>x.dataset.id===String(id));
 if(!input)return;
 const tip=Number(input.value);
 if(!Number.isInteger(tip)||tip<0||input.value.trim()===""){alert("Ingresa una propina válida en pesos.");return}
 o.tip=tip;
 await persist();
 renderOrders();renderStats();
}
function bindOrderActionButtons(){document.querySelectorAll(".tip-btn").forEach(b=>b.addEventListener("click",()=>editOrderTip(b.dataset.id)));document.querySelectorAll(".voucher-preview-btn").forEach(b=>b.addEventListener("click",()=>previewVoucher(b.dataset.id)));document.querySelectorAll(".voucher-pdf-btn").forEach(b=>b.addEventListener("click",()=>saveVoucherPDF(b.dataset.id)));document.querySelectorAll(".voucher-btn").forEach(b=>b.addEventListener("click",()=>printVoucher(b.dataset.id)));document.querySelectorAll(".whatsapp-btn").forEach(b=>b.addEventListener("click",()=>openWhatsAppById(b.dataset.id)));document.querySelectorAll(".order-status-select").forEach(x=>x.addEventListener("change",()=>setOrderStatus(x.dataset.id,x.value)));document.querySelectorAll(".paid-select").forEach(x=>x.addEventListener("change",()=>setPaid(x.dataset.id,x.value)));document.querySelectorAll(".delivered-select").forEach(x=>x.addEventListener("change",()=>setDelivered(x.dataset.id,x.value)));document.querySelectorAll(".delete-order-btn").forEach(b=>b.addEventListener("click",()=>deleteOrder(b.dataset.id)))}
function statusMessage(o){
 if(o.status==="Confirmado")return `✅ Hola ${o.client}, confirmamos tu pedido #${o.number}. Ya fue recibido por nuestro equipo y comenzaremos a prepararlo.`;
 if(o.status==="Preparando")return `🍔 Hola ${o.client}, tu pedido #${o.number} ya está siendo preparado.`;
 if(o.status==="Listo"&&String(o.delivery||"").toLowerCase().includes("delivery"))return `🛵 Hola ${o.client}, tu pedido #${o.number} está listo y comienza el reparto. ¡Va en camino!`;
 if(o.status==="Listo")return `✅ Hola ${o.client}, tu pedido #${o.number} está listo. Ya puedes venir a retirarlo.`;
 if(o.status==="En reparto")return `🛵 Hola ${o.client}, tu pedido #${o.number} está en reparto y va en camino. ¡Nos vemos pronto!`;
 if(o.status==="Entregado")return `✅ Hola ${o.client}, tu pedido #${o.number} fue entregado. ¡Muchas gracias!`;
 return orderMessage(o)
}
async function openWhatsAppById(id){const o=state.orders.find(x=>String(x.id)===String(id));if(!o)return;let phone=String(o.phone||"").replace(/\\D/g,"");if(phone.startsWith("0"))phone=phone.slice(1);if(phone.length===9&&phone.startsWith("9"))phone="56"+phone;if(phone.length===8)phone="569"+phone;const msg=statusMessage(o);if(!phone){alert("Este pedido no tiene un número de WhatsApp válido.");return}const url=`https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;const res=await window.desktopAPI.openExternal(url);if(!res?.ok)alert("No se pudo abrir WhatsApp.");}
function voucherHtml(o){
 const items=(o.items||[]).map(x=>`<tr><td>${escapeHtml(x.qty)} x ${escapeHtml(x.name)}</td><td>${money((x.price||0)*(x.qty||0))}</td></tr>`).join("");
 return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;width:72mm;margin:0;color:#000;font-size:12px}.center{text-align:center}.order{font-size:22px;font-weight:900}.client{font-size:25px;font-weight:900;margin:8px 0;text-transform:uppercase;border-top:2px dashed #000;border-bottom:2px dashed #000;padding:8px 0}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:5px 0;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}.notes{font-size:16px;font-weight:800;border:2px solid #000;padding:7px;margin:8px 0}.total{font-size:20px;font-weight:900;text-align:right;border-top:2px solid #000;padding-top:7px}.meta{font-size:12px;margin-top:5px}.footer{border-top:2px dashed #000;margin-top:10px;padding-top:7px}</style></head><body><div class="center"><div>${escapeHtml(state.settings.businessName||"PEDIDOS")}</div><div class="order">PEDIDO #${escapeHtml(o.number)}</div><div class="client">${escapeHtml(o.client||"SIN NOMBRE")}</div></div><table>${items}</table>${o.notes?`<div class="notes">OBSERVACIONES:<br>${escapeHtml(o.notes)}</div>`:""}<div class="meta"><b>${escapeHtml(o.delivery||"Retiro")}</b>${o.address?`<br>Dirección: ${escapeHtml(o.address)}`:""}<br>Pago: ${escapeHtml(o.payment||"")}<br>Hora: ${escapeHtml(new Date(o.createdAt||Date.now()).toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"}))}</div><div class="total">TOTAL: ${money(o.total)}</div><div class="center footer">Gracias</div></body></html>`
}
async function previewVoucher(id){const o=state.orders.find(x=>String(x.id)===String(id));if(!o)return;const res=await window.desktopAPI.previewVoucher(voucherHtml(o));if(!res?.ok)alert("No se pudo abrir la vista previa.");}
async function saveVoucherPDF(id){const o=state.orders.find(x=>String(x.id)===String(id));if(!o)return;const res=await window.desktopAPI.saveVoucherPDF(voucherHtml(o));if(!res?.ok&&!res?.canceled)alert("No se pudo guardar el PDF.");}
async function printVoucher(id){const o=state.orders.find(x=>String(x.id)===String(id));if(!o)return;const res=await window.desktopAPI.printVoucher(voucherHtml(o));if(!res?.ok)alert("No se pudo imprimir el voucher.");}
function selectedOrdersForStats(){const from=document.getElementById("cashFrom")?.value,to=document.getElementById("cashTo")?.value;return state.orders.filter(o=>{const raw=o.createdAt||"";const parsed=new Date(raw);const d=Number.isNaN(parsed.getTime())?String(raw).slice(0,10):new Intl.DateTimeFormat("en-CA",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(parsed);if(from&&d<from)return false;if(to&&d>to)return false;return true})}
function renderStats(){const list=selectedOrdersForStats(),sales=list.reduce((s,o)=>s+(o.total||0),0),tips=list.reduce((s,o)=>s+Number(o.tip||0),0),costs=list.reduce((s,o)=>s+(currentOrderCost(o)),0),profit=sales-costs,collected=list.filter(o=>o.paid).reduce((s,o)=>s+o.total,0),pending=sales-collected;document.getElementById("sales").textContent=money(sales);document.getElementById("tipsTotal").textContent=money(tips);document.getElementById("incomeTotal").textContent=money(sales+tips);document.getElementById("costs").textContent=money(costs);document.getElementById("profit").textContent=money(profit);document.getElementById("margin").textContent=(sales?profit/sales*100:0).toFixed(1)+"%";document.getElementById("count").textContent=list.length;document.getElementById("avg").textContent=money(list.length?sales/list.length:0);document.getElementById("collected").textContent=money(collected);document.getElementById("pending").textContent=money(pending);const bank=Number(document.getElementById("bankActual")?.value||0),audit=document.getElementById("cashAudit");if(audit){const deliveries=list.filter(o=>String(o.delivery||"").toLowerCase().includes("delivery")),deliveryTotal=deliveries.length*1000,bankGap=bank-sales-tips,invalid=list.filter(o=>!Number.isFinite(Number(o.total))||Number(o.total)<0),itemMismatch=list.filter(o=>{const subtotal=(o.items||[]).reduce((n,x)=>n+Number(x.price||0)*Number(x.qty||0),0);return Math.abs(Number(o.total||0)-subtotal-(String(o.delivery||"").toLowerCase().includes("delivery")?1000:0))>1});audit.innerHTML=`<p><b>Banco:</b> ${money(bank)} · <b>Ventas:</b> ${money(sales)} · <b>Propinas:</b> ${money(tips)} · <b>Ingresos esperados:</b> ${money(sales+tips)} · <b>Diferencia:</b> ${money(bankGap)} (${bankGap>0?"banco mayor":bankGap<0?"sistema mayor":"cuadrado"})</p><p><b>Repartos registrados:</b> ${deliveries.length} (${money(deliveryTotal)}) · <b>Pedidos con diferencia entre detalle y total:</b> ${itemMismatch.length} · <b>Totales inválidos:</b> ${invalid.length}</p>${itemMismatch.length?`<p><b>Revisar pedidos:</b> ${itemMismatch.map(o=>"#"+o.number).join(", ")}</p>`:""}<p>El saldo bancario se compara con ventas más propinas, no con «Cobrado», que depende de marcar cada pedido como pagado. Esta revisión no modifica pedidos.</p>`}}
function clearCashDates(){document.getElementById("cashFrom").value="";document.getElementById("cashTo").value="";renderStats()}
function renderBadges(){document.getElementById("unpaidBadge").textContent=`💳 ${state.orders.filter(o=>!o.paid).length} por pagar`;document.getElementById("deliveryBadge").textContent=`🛵 ${state.orders.filter(o=>!o.delivered).length} por entregar`}
function inventoryUnitCost(i){return Number(i.purchaseQty)>0?Number(i.purchasePrice||0)/Number(i.purchaseQty):0}
function renderInventory(){const body=document.getElementById("inventoryRows");if(!body)return;body.innerHTML=(state.ingredients||[]).length?state.ingredients.map(i=>`<tr><td><input data-inv="${i.id}" data-field="name" value="${escapeHtml(i.name||"")}"></td><td><input data-inv="${i.id}" data-field="purchaseQty" type="number" min="0" step="0.01" value="${i.purchaseQty||0}"></td><td><select data-inv="${i.id}" data-field="unit"><option value="g" ${i.unit==="g"?"selected":""}>g</option><option value="ml" ${i.unit==="ml"?"selected":""}>ml</option><option value="un" ${i.unit==="un"?"selected":""}>un</option></select></td><td><input data-inv="${i.id}" data-field="purchasePrice" type="number" min="0" step="1" value="${i.purchasePrice||0}"></td><td>${money(inventoryUnitCost(i))} / ${escapeHtml(i.unit||"un")}</td><td><button class="danger small" onclick="deleteInventoryIngredient(${i.id})">Eliminar</button></td></tr>`).join(""):'<tr><td colspan="6" class="muted">Todavía no hay ingredientes. Agrega carne, pan, queso, salsas, etc.</td></tr>';body.querySelectorAll("[data-inv]").forEach(el=>el.addEventListener("change",()=>updateInventoryIngredient(Number(el.dataset.inv),el.dataset.field,el.value)))}
async function addInventoryIngredient(){state.ingredients.push({id:Date.now(),name:"Nuevo ingrediente",purchaseQty:1000,unit:"g",purchasePrice:0});await persist();renderInventory()}
async function updateInventoryIngredient(id,field,value){const i=state.ingredients.find(x=>x.id===id);if(!i)return;i[field]=["purchaseQty","purchasePrice"].includes(field)?Number(value||0):value;await persist();recalculateProductsFromInventory();renderInventory();renderAdmin();renderOrders();renderStats();renderCart()}
async function deleteInventoryIngredient(id){if(!confirm("¿Eliminar este ingrediente del inventario? Las recetas existentes conservarán su último costo guardado."))return;state.ingredients=state.ingredients.filter(x=>x.id!==id);await persist();renderInventory()}
function recalculateProductsFromInventory(){for(const p of state.products){if(!Array.isArray(p.ingredients))continue;for(const x of p.ingredients){if(!x.inventoryId)continue;const i=state.ingredients.find(v=>v.id===x.inventoryId);if(i){x.name=i.name;x.purchaseQty=i.purchaseQty;x.purchasePrice=i.purchasePrice;x.unit=i.unit}}p.cost=Math.round(p.ingredients.reduce((s,x)=>s+ingredientLineCost(x),0))}persist()}
function renderAdmin(){document.getElementById("adminRows").innerHTML=state.products.map(p=>{const u=p.price-p.cost,m=calcMargin(p.price,p.cost);return `<tr><td><b>${escapeHtml(p.name)}</b><div class="smalltxt">${escapeHtml(p.desc||"")}</div></td><td>${escapeHtml(p.type||"")}</td><td>${money(p.cost)}</td><td>${money(p.price)}</td><td class="green">${money(u)}</td><td>${m.toFixed(1)}%</td><td><span class="status ${p.active?"ok":"bad"}">${p.active?"Disponible":"Oculto"}</span></td><td><div class="row"><button class="blue small" onclick="editProduct(${p.id})">Editar</button><button class="danger small" onclick="deleteProduct(${p.id})">Eliminar</button></div></td></tr>`}).join("")}
function ingredientRowsFromUI(){return [...document.querySelectorAll(".ingredient-row")].map(r=>({inventoryId:Number(r.querySelector(".ing-stock").value||0)||null,name:r.querySelector(".ing-name").value.trim(),purchaseQty:Number(r.querySelector(".ing-buyqty").value||0),unit:r.querySelector(".ing-unit").value,purchasePrice:Number(r.querySelector(".ing-buyprice").value||0),usedQty:Number(r.querySelector(".ing-used").value||0)})).filter(x=>x.name||x.purchaseQty||x.purchasePrice||x.usedQty)}
function ingredientLineCost(x){return x.purchaseQty>0?x.purchasePrice*(x.usedQty/x.purchaseQty):0}
function addIngredientRow(v={}){
 const legacy=v.unitPrice!==undefined&&!v.purchasePrice,data=legacy?{name:v.name,purchaseQty:v.qty||1,unit:"un",purchasePrice:(v.unitPrice||0)*(v.qty||1),usedQty:v.qty||1}:v;
 const box=document.getElementById("ingredientRows"),row=document.createElement("div");row.className="ingredient-row";row.style.cssText="display:grid;grid-template-columns:1.5fr 1.3fr .75fr .7fr 1fr .8fr 1fr auto;gap:6px;align-items:end;margin:8px 0";
 const opts='<option value="">Manual</option>'+(state.ingredients||[]).map(i=>`<option value="${i.id}">${escapeHtml(i.name)}</option>`).join("");
 row.innerHTML=`<div><label>Inventario</label><select class="ing-stock">${opts}</select></div><div><label>Ingrediente</label><input class="ing-name" placeholder="Carne vacuno" value="${escapeHtml(data.name||"")}"></div><div><label>Cant. compra</label><input class="ing-buyqty" type="number" min="0" step="0.01" value="${data.purchaseQty??1}"></div><div><label>Unidad</label><select class="ing-unit"><option value="g">g</option><option value="ml">ml</option><option value="un">un</option></select></div><div><label>Precio compra</label><input class="ing-buyprice" type="number" min="0" step="1" value="${data.purchasePrice??0}"></div><div><label>Uso burger</label><input class="ing-used" type="number" min="0" step="0.01" value="${data.usedQty??0}"></div><div><label>Costo porción</label><input class="ing-linecost" readonly value="$0"></div><button type="button" class="danger small ing-remove">✕</button>`;
 row.querySelector(".ing-unit").value=data.unit||"g";row.querySelector(".ing-stock").value=data.inventoryId||"";
 row.querySelector(".ing-stock").addEventListener("change",()=>{const i=state.ingredients.find(x=>x.id===Number(row.querySelector(".ing-stock").value));if(i){row.querySelector(".ing-name").value=i.name;row.querySelector(".ing-buyqty").value=i.purchaseQty;row.querySelector(".ing-unit").value=i.unit;row.querySelector(".ing-buyprice").value=i.purchasePrice}updateIngredientCost()});
 row.querySelectorAll("input,select").forEach(x=>x.addEventListener("input",updateIngredientCost));row.querySelector(".ing-remove").addEventListener("click",()=>{row.remove();updateIngredientCost()});box.appendChild(row);updateIngredientCost()
}
function updateIngredientCost(){
 let total=0;document.querySelectorAll(".ingredient-row").forEach(r=>{const x={purchaseQty:Number(r.querySelector(".ing-buyqty").value||0),purchasePrice:Number(r.querySelector(".ing-buyprice").value||0),usedQty:Number(r.querySelector(".ing-used").value||0)};const c=ingredientLineCost(x);total+=c;r.querySelector(".ing-linecost").value=money(c)});
 document.getElementById("pCost").value=Math.round(total);document.getElementById("ingredientCost").textContent=money(total);updateSuggestedPrice()
}
function openProductModal(){document.getElementById("modalTitle").textContent="Nuevo producto";document.getElementById("editId").value="";["pName","pType","pDesc","pCost","pPrice"].forEach(id=>document.getElementById(id).value="");document.getElementById("pMargin").value=45;document.getElementById("pActive").value="true";document.getElementById("ingredientRows").innerHTML="";addIngredientRow();updateSuggestedPrice();document.getElementById("productModal").classList.remove("hidden")}
function closeProductModal(){document.getElementById("productModal").classList.add("hidden")}
function updateSuggestedPrice(){const c=Number(document.getElementById("pCost").value||0),m=Number(document.getElementById("pMargin").value||0);document.getElementById("suggestedPrice").textContent=money(calcSuggested(c,m))}
function editProduct(id){const p=state.products.find(x=>x.id===id);if(!p)return;document.getElementById("modalTitle").textContent="Editar producto";document.getElementById("editId").value=id;document.getElementById("pName").value=p.name;document.getElementById("pType").value=p.type||"";document.getElementById("pDesc").value=p.desc||"";document.getElementById("pPrice").value=p.price;document.getElementById("pActive").value=String(p.active!==false);document.getElementById("pMargin").value=Math.max(1,Math.min(95,Math.round(calcMargin(p.price,p.cost))));document.getElementById("ingredientRows").innerHTML="";(Array.isArray(p.ingredients)&&p.ingredients.length?p.ingredients:[{name:"Costo anterior",purchaseQty:1,unit:"un",purchasePrice:Number(p.cost)||0,usedQty:1}]).forEach(addIngredientRow);updateIngredientCost();document.getElementById("productModal").classList.remove("hidden")}
async function saveProduct(){const id=Number(document.getElementById("editId").value||0),name=document.getElementById("pName").value.trim(),type=document.getElementById("pType").value.trim()||"Producto",desc=document.getElementById("pDesc").value.trim(),ingredients=ingredientRowsFromUI(),cost=Math.round(ingredients.reduce((s,x)=>s+ingredientLineCost(x),0)),price=Number(document.getElementById("pPrice").value||0),active=document.getElementById("pActive").value==="true";if(!name){alert("Ingresa el nombre.");return}if(price<=0){alert("Ingresa un precio de venta válido.");return}if(id){Object.assign(state.products.find(x=>x.id===id),{name,type,desc,ingredients,cost,price,active})}else state.products.push({id:Date.now(),name,type,desc,ingredients,cost,price,active});await persist();closeProductModal();renderProducts();renderAdmin();renderOrders();renderStats();renderCart();localMenuHasSavedProducts=true;const ok=await pushProducts(false);if(!ok)alert("El producto quedó guardado en la app, pero no se pudo actualizar la página web.")}
async function deleteProduct(id){const used=state.orders.some(o=>o.items.some(i=>i.id===id));if(used){if(!confirm("Este producto aparece en pedidos históricos. Se eliminará solo del menú actual. ¿Continuar?"))return}else if(!confirm("¿Eliminar este producto?"))return;state.products=state.products.filter(x=>x.id!==id);await persist();renderProducts();renderAdmin();const ok=await pushProducts(false);if(!ok)alert("El cambio quedó guardado en la app, pero no se pudo actualizar la página web.")}
async function saveSettings(){state.settings.businessName=document.getElementById("businessName").value.trim()||"Mi Hamburguesería";state.settings.businessPhone=document.getElementById("businessPhone").value.trim();state.settings.thanksMessage=document.getElementById("thanksMessage").value.trim()||"¡Gracias por tu pedido!";state.settings.serverUrl=document.getElementById("serverUrl").value.trim().replace(/\/$/,"");state.settings.apiKey=document.getElementById("apiKey").value.trim();await persist();renderAll();alert("Configuración guardada.");await syncNow(true)}
async function exportBackup(){const ok=await window.desktopAPI.exportBackup(state);if(ok)alert("Respaldo guardado.")}
async function importBackup(){try{const data=await window.desktopAPI.importBackup();if(!data)return;if(!confirm("Se reemplazarán los datos actuales por el respaldo seleccionado. ¿Continuar?"))return;state=data;await persist();renderAll();alert("Respaldo importado.")}catch(e){alert("No se pudo importar el respaldo.")}}
async function exportOrdersCSV(){const headers=["N°","Fecha","Cliente","Teléfono","Total","Costo","Utilidad","Pagado","Entregado","Estado","Entrega","Pago","Productos"],rows=state.orders.map(o=>[o.number,o.date,o.client,o.phone,o.total,o.cost??0,o.total-(o.cost??0),o.paid?"Sí":"No",o.delivered?"Sí":"No",o.status,o.delivery,o.payment,o.items.map(i=>`${i.qty}x ${i.name}`).join(" | ")]),esc=v=>`"${String(v??"").replace(/"/g,'""')}"`,csv=[headers,...rows].map(r=>r.map(esc).join(";")).join("\n");const ok=await window.desktopAPI.exportCSV(csv);if(ok)alert("CSV exportado.")}


function syncConfigured(){return Boolean(state.settings.serverUrl&&state.settings.apiKey)}
function setSyncStatus(kind,text){const b=document.getElementById("syncBadge"),m=document.getElementById("syncMessage");if(b){b.classList.remove("sync-on","sync-warn","sync-off");b.classList.add(kind==="on"?"sync-on":kind==="warn"?"sync-warn":"sync-off");b.textContent=(kind==="on"?"☁️ ":"⚠️ ")+text}if(m)m.textContent=text}
async function apiCall(path,method="GET",body=null){if(!syncConfigured())return{ok:false,status:0,error:"Activa la licencia o configura la sincronización."};return window.desktopAPI.serverRequest({baseUrl:state.settings.serverUrl,apiKey:state.settings.apiKey,sessionToken:state.settings.sessionToken,path,method,body})}
async function activateLicense(){
 const input=document.getElementById("licenseKey"),msg=document.getElementById("licenseMessage");
 const key=(input?.value||"").trim(); if(!key){if(msg)msg.textContent="Ingresa la clave de licencia.";return}
 if(msg)msg.textContent="Activando...";
 const deviceId=await window.desktopAPI.getDeviceId();
 const res=await window.desktopAPI.serverRequest({baseUrl:state.settings.serverUrl,path:"/api/license/activate",method:"POST",body:{license_key:key,device_id:deviceId,device_name:"Gestor de Pedidos"}});
 if(!res.ok){if(msg)msg.textContent=res.error||"No se pudo activar la licencia.";return}
 state.settings.sessionToken=res.data.session_token||"";
 state.settings.businessId=res.data.business_id||null;
 state.settings.licensedBusiness=res.data.business_name||"";
 state.settings.licenseActive=true;
 await persist(); renderLicenseStatus(); startServerSync(); if(msg)msg.textContent="Licencia activada correctamente.";
}
async function validateLicense(){
 if(!state.settings.sessionToken){renderLicenseStatus();return false}
 const res=await apiCall("/api/license/status");
 if(res.ok){state.settings.licenseActive=true;state.settings.businessId=res.data.business_id||state.settings.businessId;state.settings.licensedBusiness=res.data.business_name||state.settings.licensedBusiness;await persist();renderLicenseStatus();return true}
 state.settings.licenseActive=false;if(res.status===401)state.settings.sessionToken="";await persist();renderLicenseStatus();return false
}
function renderLicenseStatus(){
 const box=document.getElementById("licenseStatus"),input=document.getElementById("licenseKey");
 if(!box)return;
 if(state.settings.licenseActive&&state.settings.sessionToken){box.textContent="✓ Licencia activa"+(state.settings.licensedBusiness?" · "+state.settings.licensedBusiness:"");box.className="license-status license-ok";if(input)input.value=""}
 else{box.textContent="Licencia no activada";box.className="license-status license-off"}
}
function remoteToLocal(r){
 const items=Array.isArray(r.items)?r.items.map(x=>({id:x.id,name:x.name||"Producto",type:x.type||"Producto",qty:Number(x.qty)||1,price:Number(x.price)||0,cost:Number(x.cost)||0})):[];
 const cost=items.reduce((s,x)=>s+x.cost*x.qty,0),total=Number(r.total)||0;
 return{id:"server-"+r.id,remoteId:r.id,clientId:r.client_id||null,tip:Number(r.tip)||0,number:r.id,createdAt:parseServerDate(r.fecha),date:r.fecha?formatChileDateTime(parseServerDate(r.fecha)):formatChileDateTime(new Date()),client:r.cliente||"Sin nombre",phone:r.telefono||"",delivery:r.entrega||"Retiro",payment:r.pago||"Efectivo",address:r.direccion||"",notes:r.notas||"",items,total,cost,profit:total-cost,paid:Boolean(r.pagado),delivered:r.estado==="Entregado",status:r.estado||"Nuevo"}
}
async function pullRemoteOrders(showFeedback=false){
 const res=await apiCall("/api/desktop/orders");
 if(!res.ok){setSyncStatus("off",res.error||"Sin conexión");if(showFeedback)alert("No se pudo sincronizar: "+(res.error||res.status));return false}
 const rows=Array.isArray(res.data)?res.data:[],first=!state.settings.syncInitialized;let added=0;
 for(const r of rows.slice().reverse()){
  try{
  const found=state.orders.find(o=>r.client_id&&String(o.id)===String(r.client_id)) || state.orders.find(o=>o.remoteId!=null&&Number(o.remoteId)===Number(r.id)&&!String(o.id).startsWith("remote-"));
  if(found){const fresh=remoteToLocal(r);const keepLocal=Boolean(found.statusChangedAt);Object.assign(found,{remoteId:r.id,client:fresh.client,phone:fresh.phone,delivery:fresh.delivery,payment:fresh.payment,address:fresh.address,notes:fresh.notes,items:fresh.items,total:fresh.total,cost:fresh.cost,profit:fresh.profit,tip:found.tip??fresh.tip,paid:keepLocal?found.paid:fresh.paid,delivered:keepLocal?found.delivered:fresh.delivered,status:keepLocal?found.status:fresh.status})}
  else{const fresh=remoteToLocal(r);state.orders.unshift(fresh);added++;if(!first){try{await window.desktopAPI.notify("Nuevo pedido web",`Pedido #${fresh.number} · ${fresh.client} · ${money(fresh.total)}`)}catch(e){console.error("Notificación de pedido",e)}}}
  }catch(e){console.error("Error al procesar pedido web",r?.id,e)}
 }
 state.settings.syncInitialized=true;await persist();renderOrders();renderBadges();renderStats();setSyncStatus("on",`Pedidos conectados · ${rows.length} en servidor${added?" · "+added+" nuevo(s)":""}`);if(showFeedback)alert(`Recepción de pedidos correcta. ${rows.length} en servidor, ${added} nuevos descargados.`);return true
}
async function pushLocalOrders(){
 if(!syncConfigured())return false;
 const pending=state.orders.filter(o=>!o.remoteId&&!String(o.id).startsWith("remote-"));
 let uploaded=0;
 for(const o of pending){
  const res=await apiCall("/api/desktop/orders","POST",{
   client_id:String(o.id),client:o.client,phone:o.phone,address:o.address,
   delivery:o.delivery,payment:o.payment,notes:o.notes,total:o.total,
   tip:o.tip||0,paid:Boolean(o.paid),status:o.status,createdAt:o.createdAt,
   items:o.items
  });
  if(!res.ok){setSyncStatus("warn","Pedidos locales pendientes: "+(res.error||res.status));return false}
  o.remoteId=res.data.id;
  await persist();
  uploaded++;
 }
 if(uploaded){renderOrders();setSyncStatus("on",uploaded+" pedidos locales respaldados en servidor")}
 return true
}
async function pushProducts(showFeedback=false){
 if(!syncConfigured()){setSyncStatus("off","Falta clave API del servidor");if(showFeedback)alert("La página de Render requiere una clave API. Configura en la app la misma API_KEY que está guardada en Render.");return false}
 if(!state.products.length){if(showFeedback)alert("No se publicará un menú vacío. Revisa los productos guardados.");return false}
 if(!state.products.some(p=>p.active)){if(showFeedback)alert("No hay productos activos para publicar. Actívalos en Administrar menú.");return false}
 if(state.products.length<=3){setSyncStatus("warn","Menú incompleto: publicación bloqueada");if(showFeedback)alert("Solo hay "+state.products.length+" productos en esta instancia. Se bloqueó la publicación para proteger el menú web.");return false}
 const res=await apiCall("/api/desktop/products","POST",{products:state.products});
 if(!res.ok){const msg=res.status===401?"Clave API incorrecta o no configurada en Render":(res.error||"No se pudo publicar el menú");setSyncStatus("warn",msg);if(showFeedback)alert("No se pudo publicar el menú: "+msg);return false}
 setSyncStatus("on",`Menú publicado · ${state.products.filter(p=>p.active).length} activos`);if(showFeedback)alert(`Menú publicado: ${state.products.filter(p=>p.active).length} productos activos de ${state.products.length} registrados. Revisa la página de clientes y el stock del día.`);return true
}
async function syncOrderToServer(o){
 if(!o?.remoteId||!syncConfigured())return false;
 const res=await apiCall("/api/desktop/orders/"+o.remoteId,"PATCH",{estado:o.status,pagado:Boolean(o.paid)});
 if(!res.ok){setSyncStatus("warn","Cambio pendiente de sincronizar");return false}
 setSyncStatus("on","Sincronizado");return true
}
let activityLastId=Number(localStorage.getItem("activityLastId")||0),draftActivities=new Map();
function activeDrafts(){
 const now=Date.now(),byCustomer=new Map();
 for(const a of draftActivities.values()){
  const confirmed=a.confirmado===true||a.confirmado===1||a.confirmado==="1"||a.confirmado==="true";
  if(confirmed)continue;
  const ap=String(a.telefono||"").replace(/\\D/g,""),name=String(a.cliente||"").trim().toLowerCase();
  const ordered=state.orders.some(o=>{const op=String(o.phone||"").replace(/\\D/g,"");return (ap&&op===ap)||(name&&String(o.client||"").trim().toLowerCase()===name)});
  if(ordered)continue;
  const t=Date.parse(a.fecha||"")||now;if(now-t>10*60*1000)continue;
  const key=ap||name||a.token,prev=byCustomer.get(key);
  if(!prev||Number(a.id)>Number(prev.id))byCustomer.set(key,a);
 }
 return [...byCustomer.values()]
}
function renderDraftActivities(){
 const box=document.getElementById("ordersList");if(!box)return;
 const drafts=activeDrafts();if(!drafts.length)return;
 const html=drafts.map(a=>`<div class="order" style="border:2px solid #f0b429;background:#fffaf0"><div class="row between wrap"><div><b>🟡 PEDIDO EN PROCESO</b><div class="smalltxt">${escapeHtml((a.cliente||"Cliente").trim()||"Cliente")}</div></div><span class="status warn">ARMANDO PEDIDO…</span></div><div class="muted" style="margin-top:8px">El cliente todavía no confirma el pedido.</div></div>`).join("");
 box.insertAdjacentHTML("afterbegin",html)
}
async function pullOrderActivity(){
 if(!syncConfigured())return;
 const res=await apiCall("/api/desktop/activity?after="+activityLastId);
 if(!res.ok||!Array.isArray(res.data))return;
 for(const a of res.data){
  const isNew=!draftActivities.has(a.token)&&Number(a.id)>activityLastId;
  activityLastId=Math.max(activityLastId,Number(a.id)||0);
  const confirmed=a.confirmado===true||a.confirmado===1||a.confirmado==="1"||a.confirmado==="true";
  if(confirmed)draftActivities.delete(a.token);else draftActivities.set(a.token,a);
  if(isNew&&!confirmed){const who=(a.cliente||"Cliente").trim()||"Cliente";await window.desktopAPI.notify("🟡 Cliente preparando pedido",who+" está armando un pedido en la web.")}
 }
 for(const [token,a] of draftActivities){if(!activeDrafts().some(x=>x.token===token))draftActivities.delete(token)}
 localStorage.setItem("activityLastId",String(activityLastId));
 // No reconstruir los controles cada 2 segundos mientras el usuario confirma o edita pedidos.
 const box=document.getElementById("ordersList");
 if(box){box.querySelectorAll(".draft-activity").forEach(el=>el.remove());const drafts=activeDrafts();if(drafts.length){const html=drafts.map(a=>`<div class="order draft-activity" style="border:2px solid #f0b429;background:#fffaf0"><b>🟡 PEDIDO EN PROCESO</b><div class="smalltxt">${escapeHtml((a.cliente||"Cliente").trim()||"Cliente")}</div><span class="status warn">ARMANDO PEDIDO…</span></div>`).join("");box.insertAdjacentHTML("afterbegin",html)}}
}
let syncBusy=false;let syncTimersStarted=false;let menuStartupPublishDone=false;let localMenuHasSavedProducts=false;
async function publishMenuOnStartup(){
 if(menuStartupPublishDone || !localMenuHasSavedProducts || !syncConfigured() || !state.products.some(p=>p.active))return;
 menuStartupPublishDone=true;
 const ok=await pushProducts(false);
 if(!ok){menuStartupPublishDone=false;console.warn("Menú web pendiente de publicación");}
}

async function syncNow(showFeedback=false){if(syncBusy)return false;if(!syncConfigured()){setSyncStatus("off","Falta clave API de Render");if(showFeedback)alert("Configura la URL y la misma clave API que está en Render.");return false}syncBusy=true;try{const ok=await pullRemoteOrders(showFeedback);if(ok){await pushLocalOrders();await loadDailyStock()}return ok}catch(e){setSyncStatus("off","Error recibiendo pedidos: "+(e?.message||e));if(showFeedback)alert("Error recibiendo pedidos: "+(e?.message||e));return false}finally{syncBusy=false}}
function startServerSync(){if(syncConfigured()){setSyncStatus("warn","Conectando…");syncNow(false);publishMenuOnStartup().catch(e=>console.error("Publicación menú",e));pullOrderActivity().catch(e=>console.error("Actividad web",e))}else setSyncStatus("off","Sin conexión");if(syncTimersStarted)return;syncTimersStarted=true;setInterval(()=>syncNow(false),5000);setInterval(()=>publishMenuOnStartup().catch(e=>console.error("Reintento menú",e)),60000);setInterval(()=>pullOrderActivity().catch(e=>console.error("Actividad web",e)),5000)}

window.addEventListener("beforeunload",()=>{window.desktopAPI.setData(state)});
setInterval(()=>persist(),15000);
init();
