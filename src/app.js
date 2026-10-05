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
const todayISO=()=>new Date().toISOString().slice(0,10);
const calcMargin=(price,cost)=>price?((price-cost)/price*100):0;
const calcSuggested=(cost,margin)=>{const m=Number(margin)/100;return m>=1?0:Number(cost)/(1-m)};
const escapeHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

async function persist(){await window.desktopAPI.setData(state)}
async function init(){
  const saved=await window.desktopAPI.getData();
  state=saved||state;
  if(!Array.isArray(state.products)||!state.products.length) state.products=defaultProducts;
  if(!Array.isArray(state.orders)) state.orders=[];
  state.settings={businessName:"Mi Hamburguesería",businessPhone:"",thanksMessage:"¡Gracias por tu pedido!",serverUrl:"https://pedidos-comida-2ktc.onrender.com",apiKey:"",syncInitialized:false,...(state.settings||{})};
  await persist();
  renderAll();
  startServerSync();
}

function renderAll(){
  document.getElementById("brandName").textContent=(state.settings.businessName||"Mi Hamburguesería").toUpperCase();
  document.getElementById("businessName").value=state.settings.businessName||"";
  document.getElementById("businessPhone").value=state.settings.businessPhone||"";
  document.getElementById("thanksMessage").value=state.settings.thanksMessage||"";
  document.getElementById("serverUrl").value=state.settings.serverUrl||"";
  document.getElementById("apiKey").value=state.settings.apiKey||"";
  renderProducts();renderCart();renderBadges();renderOrders();renderStats();renderAdmin();
}
function goTab(id,btn){["new","orders","cash","admin","settings"].forEach(x=>document.getElementById(x).classList.toggle("hidden",x!==id));document.querySelectorAll(".nav button").forEach(x=>x.classList.remove("active"));btn.classList.add("active");if(id==="orders")renderOrders();if(id==="cash")renderStats();if(id==="admin")renderAdmin()}
function fillCategoryFilter(){const sel=document.getElementById("categoryFilter"),current=sel.value||"all",cats=[...new Set(state.products.map(p=>p.type).filter(Boolean))].sort();sel.innerHTML='<option value="all">Todas las categorías</option>'+cats.map(c=>`<option ${c===current?"selected":""}>${escapeHtml(c)}</option>`).join("")}
function renderProducts(){fillCategoryFilter();const filter=document.getElementById("categoryFilter").value,list=state.products.filter(p=>p.active&&(filter==="all"||p.type===filter));document.getElementById("products").innerHTML=list.length?list.map(p=>`<div class="product"><div class="row between"><span class="status">${escapeHtml(p.type||"Producto")}</span><span class="smalltxt">#${p.id}</span></div><h3>${escapeHtml(p.name)}</h3><div class="muted">${escapeHtml(p.desc||"")}</div><div class="price">${money(p.price)}</div><button class="primary full" onclick="addToCart(${p.id})">+ Agregar</button></div>`).join(""):'<div class="muted">No hay productos disponibles.</div>'}
function addToCart(id){const p=state.products.find(x=>x.id===id);if(!p)return;const c=cart.find(x=>x.id===id);c?c.qty++:cart.push({...p,qty:1});renderCart()}
function changeQty(id,d){const c=cart.find(x=>x.id===id);if(!c)return;c.qty+=d;if(c.qty<=0)cart=cart.filter(x=>x.id!==id);renderCart()}
function cartTotal(){return cart.reduce((s,x)=>s+x.price*x.qty,0)}function cartCost(){return cart.reduce((s,x)=>s+x.cost*x.qty,0)}
function renderCart(){const el=document.getElementById("cart");el.innerHTML=cart.length?cart.map(x=>`<div class="cart-item"><div class="row between"><div><b>${escapeHtml(x.name)}</b><div class="muted">${money(x.price)} c/u</div></div><div class="row"><button class="secondary small" onclick="changeQty(${x.id},-1)">−</button><span class="qty">${x.qty}</span><button class="secondary small" onclick="changeQty(${x.id},1)">+</button></div></div></div>`).join(""):'<div class="muted">Agrega productos desde el menú.</div>';const t=cartTotal(),c=cartCost();document.getElementById("total").textContent=money(t);document.getElementById("cartCost").textContent=money(c);document.getElementById("cartProfit").textContent=money(t-c);document.getElementById("cartMargin").textContent=(t?((t-c)/t*100):0).toFixed(1)+"%"}
function getOrderData(){const t=cartTotal(),c=cartCost();return{id:Date.now(),number:(state.orders.length?Math.max(...state.orders.map(o=>o.number||0)):0)+1,createdAt:new Date().toISOString(),date:new Date().toLocaleString("es-CL"),client:document.getElementById("client").value.trim()||"Sin nombre",phone:document.getElementById("phone").value.trim(),delivery:document.getElementById("delivery").value,payment:document.getElementById("payment").value,address:document.getElementById("address").value.trim(),notes:document.getElementById("notes").value.trim(),items:cart.map(x=>({id:x.id,name:x.name,price:x.price,cost:x.cost,qty:x.qty,type:x.type})),total:t,cost:c,profit:t-c,paid:false,delivered:false,status:"Nuevo"}}
function clearCurrentOrder(){cart=[];renderCart();["client","phone","address","notes"].forEach(id=>document.getElementById(id).value="")}
async function saveOrder(showAlert=true){if(!cart.length){alert("Agrega al menos un producto.");return null}const o=getOrderData();state.orders.unshift(o);await persist();clearCurrentOrder();renderBadges();renderStats();if(showAlert)alert("Pedido #"+o.number+" registrado.");return o}
async function saveAndWhatsApp(){const o=await saveOrder(false);if(!o)return;openWhatsApp(o);alert("Pedido #"+o.number+" registrado y preparado para WhatsApp.")}
function orderMessage(o){return `🍔 *PEDIDO #${o.number}*\nCliente: ${o.client}\n\n${o.items.map(x=>`${x.qty} x ${x.name} — ${money(x.price*x.qty)}`).join("\n")}\n\n*TOTAL: ${money(o.total)}*\nEntrega: ${o.delivery}\nPago: ${o.payment}${o.address?`\nDirección: ${o.address}`:""}${o.notes?`\nObservaciones: ${o.notes}`:""}\n\n${state.settings.thanksMessage||"¡Gracias por tu pedido!"}`}
function openWhatsApp(o){const phone=(o.phone||"").replace(/\D/g,"");const url=phone?`https://wa.me/${phone}?text=${encodeURIComponent(orderMessage(o))}`:`https://wa.me/?text=${encodeURIComponent(orderMessage(o))}`;window.open(url,"_blank")}
async function setOrderStatus(id,val){const o=state.orders.find(x=>x.id===id);if(!o)return;o.status=val;o.statusChangedAt=Date.now();if(val==="Entregado"){o.delivered=true;o.deliveredAt=new Date().toISOString()}await persist();renderOrders();renderBadges();renderStats();const synced=await syncOrderToServer(o);if(!synced&&o.remoteId){setSyncStatus("warn","Estado guardado localmente · pendiente de servidor");return}if(["Confirmado","Preparando","Listo"].includes(val)){const title=val==="Confirmado"?"Pedido confirmado":val==="Listo"?"Pedido listo":"Pedido en preparación";await window.desktopAPI.notify(title,`Pedido #${o.number} · ${o.client}`);await openWhatsAppById(id)}}
async function setPaid(id,val){const o=state.orders.find(x=>x.id===id);if(!o)return;o.paid=val==="true";o.paidAt=o.paid?new Date().toISOString():null;await persist();renderOrders();renderBadges();renderStats();if(o.paid)await window.desktopAPI.notify("Pedido pagado",`Pedido #${o.number} · ${o.client} · ${money(o.total)}`);await syncOrderToServer(o)}
async function setDelivered(id,val){const o=state.orders.find(x=>x.id===id);if(!o)return;o.delivered=val==="true";o.deliveredAt=o.delivered?new Date().toISOString():null;if(o.delivered)o.status="Entregado";await persist();renderOrders();renderBadges();renderStats();if(o.delivered)await window.desktopAPI.notify("Pedido entregado",`Pedido #${o.number} · ${o.client}`);await syncOrderToServer(o)}
async function deleteOrder(id){const o=state.orders.find(x=>x.id===id);if(!o||!confirm("¿Eliminar este pedido?"))return;if(o.remoteId&&syncConfigured()){const res=await apiCall("/api/desktop/orders/"+o.remoteId,"DELETE");if(!res.ok){alert("No se pudo eliminar el pedido del servidor.");return}}state.orders=state.orders.filter(x=>x.id!==id);await persist();renderOrders();renderBadges();renderStats()}
function orderFilterPass(o){const f=document.getElementById("orderFilter")?.value||"all";if(f==="unpaid")return !o.paid;if(f==="undelivered")return !o.delivered;if(f==="today")return(o.createdAt||"").slice(0,10)===todayISO();return true}
function renderOrders(){const list=state.orders.filter(orderFilterPass);document.getElementById("ordersList").innerHTML=list.length?list.map(o=>{const cost=o.cost??o.items.reduce((a,x)=>a+(x.cost||0)*x.qty,0),profit=o.total-cost,margin=calcMargin(o.total,cost);return `<div class="order ${o.paid?"paid":"unpaid"}"><div class="row between wrap"><div><b>#${o.number} · ${escapeHtml(o.client)}</b><div class="smalltxt">${escapeHtml(o.date||"")}</div></div><div class="row wrap"><span class="status ${o.paid?"ok":"bad"}">${o.paid?"PAGADO":"PAGO PENDIENTE"}</span><span class="status ${o.delivered?"ok":"warn"}">${o.delivered?"ENTREGADO":"POR ENTREGAR"}</span></div></div><div class="muted" style="margin:8px 0">${o.items.map(x=>x.qty+"× "+escapeHtml(x.name)).join(" · ")}</div><div class="row between wrap"><b>${money(o.total)}</b><span class="smalltxt">Costo ${money(cost)} · Utilidad ${money(profit)} · Margen ${margin.toFixed(1)}%</span></div><div class="two" style="margin-top:9px"><select class="paid-select" data-id="${o.id}"><option value="false" ${!o.paid?"selected":""}>💳 Pago pendiente</option><option value="true" ${o.paid?"selected":""}>💰 Pagado</option></select><select class="delivered-select" data-id="${o.id}"><option value="false" ${!o.delivered?"selected":""}>🛵 Entrega pendiente</option><option value="true" ${o.delivered?"selected":""}>✅ Entregado</option></select></div><div class="row wrap" style="margin-top:9px"><select style="flex:1" class="order-status-select" data-id="${o.id}">${["Nuevo","Confirmado","Preparando","Listo","Entregado"].map(s=>`<option ${s===o.status?"selected":""}>${s}</option>`).join("")}</select><button class="secondary voucher-btn" data-id="${o.id}">🖨️ Voucher</button><button class="success whatsapp-btn" data-id="${o.id}">💬 Avisar cliente</button><button class="danger delete-order-btn" data-id="${o.id}">Eliminar</button></div></div>`}).join("") :'<div class="muted">No hay pedidos para mostrar.</div>';bindOrderActionButtons()}
function bindOrderActionButtons(){document.querySelectorAll(".voucher-btn").forEach(b=>b.addEventListener("click",()=>printVoucher(b.dataset.id)));document.querySelectorAll(".whatsapp-btn").forEach(b=>b.addEventListener("click",()=>openWhatsAppById(b.dataset.id)));document.querySelectorAll(".order-status-select").forEach(x=>x.addEventListener("change",()=>setOrderStatus(x.dataset.id,x.value)));document.querySelectorAll(".paid-select").forEach(x=>x.addEventListener("change",()=>setPaid(x.dataset.id,x.value)));document.querySelectorAll(".delivered-select").forEach(x=>x.addEventListener("change",()=>setDelivered(x.dataset.id,x.value)));document.querySelectorAll(".delete-order-btn").forEach(b=>b.addEventListener("click",()=>deleteOrder(b.dataset.id)))}
function statusMessage(o){
 if(o.status==="Confirmado")return `✅ Hola ${o.client}, confirmamos tu pedido #${o.number}. Ya fue recibido por nuestro equipo y comenzaremos a prepararlo.`;
 if(o.status==="Preparando")return `🍔 Hola ${o.client}, tu pedido #${o.number} ya está siendo preparado.`;
 if(o.status==="Listo"&&String(o.delivery||"").toLowerCase().includes("delivery"))return `🛵 Hola ${o.client}, tu pedido #${o.number} está listo y comienza el reparto. ¡Va en camino!`;
 if(o.status==="Listo")return `✅ Hola ${o.client}, tu pedido #${o.number} está listo. Ya puedes venir a retirarlo.`;
 if(o.status==="Entregado")return `✅ Hola ${o.client}, tu pedido #${o.number} fue entregado. ¡Muchas gracias!`;
 return orderMessage(o)
}
async function openWhatsAppById(id){const o=state.orders.find(x=>x.id===id);if(!o)return;const phone=(o.phone||"").replace(/\\D/g,"");const msg=statusMessage(o),url=phone?`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`:`https://wa.me/?text=${encodeURIComponent(msg)}`;const res=await window.desktopAPI.openExternal(url);if(!res?.ok)alert("No se pudo abrir WhatsApp.");}
function voucherHtml(o){
 const items=(o.items||[]).map(x=>`<tr><td>${escapeHtml(x.qty)} x ${escapeHtml(x.name)}</td><td>${money((x.price||0)*(x.qty||0))}</td></tr>`).join("");
 return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;width:72mm;margin:0;color:#000;font-size:12px}.center{text-align:center}.order{font-size:22px;font-weight:900}.client{font-size:25px;font-weight:900;margin:8px 0;text-transform:uppercase;border-top:2px dashed #000;border-bottom:2px dashed #000;padding:8px 0}table{width:100%;border-collapse:collapse;font-size:14px}td{padding:5px 0;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}.notes{font-size:16px;font-weight:800;border:2px solid #000;padding:7px;margin:8px 0}.total{font-size:20px;font-weight:900;text-align:right;border-top:2px solid #000;padding-top:7px}.meta{font-size:12px;margin-top:5px}.footer{border-top:2px dashed #000;margin-top:10px;padding-top:7px}</style></head><body><div class="center"><div>${escapeHtml(state.settings.businessName||"PEDIDOS")}</div><div class="order">PEDIDO #${escapeHtml(o.number)}</div><div class="client">${escapeHtml(o.client||"SIN NOMBRE")}</div></div><table>${items}</table>${o.notes?`<div class="notes">OBSERVACIONES:<br>${escapeHtml(o.notes)}</div>`:""}<div class="meta"><b>${escapeHtml(o.delivery||"Retiro")}</b>${o.address?`<br>Dirección: ${escapeHtml(o.address)}`:""}<br>Pago: ${escapeHtml(o.payment||"")}<br>Hora: ${escapeHtml(new Date(o.createdAt||Date.now()).toLocaleTimeString("es-CL",{hour:"2-digit",minute:"2-digit"}))}</div><div class="total">TOTAL: ${money(o.total)}</div><div class="center footer">Gracias</div></body></html>`
}
async function printVoucher(id){const o=state.orders.find(x=>x.id===id);if(!o)return;const res=await window.desktopAPI.printVoucher(voucherHtml(o));if(!res?.ok)alert("No se pudo imprimir el voucher.");}
function selectedOrdersForStats(){const from=document.getElementById("cashFrom")?.value,to=document.getElementById("cashTo")?.value;return state.orders.filter(o=>{const d=(o.createdAt||"").slice(0,10);if(from&&d<from)return false;if(to&&d>to)return false;return true})}
function renderStats(){const list=selectedOrdersForStats(),sales=list.reduce((s,o)=>s+(o.total||0),0),costs=list.reduce((s,o)=>s+(o.cost??o.items.reduce((a,x)=>a+(x.cost||0)*x.qty,0)),0),profit=sales-costs,collected=list.filter(o=>o.paid).reduce((s,o)=>s+o.total,0),pending=sales-collected;document.getElementById("sales").textContent=money(sales);document.getElementById("costs").textContent=money(costs);document.getElementById("profit").textContent=money(profit);document.getElementById("margin").textContent=(sales?profit/sales*100:0).toFixed(1)+"%";document.getElementById("count").textContent=list.length;document.getElementById("avg").textContent=money(list.length?sales/list.length:0);document.getElementById("collected").textContent=money(collected);document.getElementById("pending").textContent=money(pending)}
function clearCashDates(){document.getElementById("cashFrom").value="";document.getElementById("cashTo").value="";renderStats()}
function renderBadges(){document.getElementById("unpaidBadge").textContent=`💳 ${state.orders.filter(o=>!o.paid).length} por pagar`;document.getElementById("deliveryBadge").textContent=`🛵 ${state.orders.filter(o=>!o.delivered).length} por entregar`}
function renderAdmin(){document.getElementById("adminRows").innerHTML=state.products.map(p=>{const u=p.price-p.cost,m=calcMargin(p.price,p.cost);return `<tr><td><b>${escapeHtml(p.name)}</b><div class="smalltxt">${escapeHtml(p.desc||"")}</div></td><td>${escapeHtml(p.type||"")}</td><td>${money(p.cost)}</td><td>${money(p.price)}</td><td class="green">${money(u)}</td><td>${m.toFixed(1)}%</td><td><span class="status ${p.active?"ok":"bad"}">${p.active?"Disponible":"Oculto"}</span></td><td><div class="row"><button class="blue small" onclick="editProduct(${p.id})">Editar</button><button class="danger small" onclick="deleteProduct(${p.id})">Eliminar</button></div></td></tr>`}).join("")}
function openProductModal(){document.getElementById("modalTitle").textContent="Nuevo producto";document.getElementById("editId").value="";["pName","pType","pDesc","pCost","pPrice"].forEach(id=>document.getElementById(id).value="");document.getElementById("pMargin").value=45;document.getElementById("pActive").value="true";updateSuggestedPrice();document.getElementById("productModal").classList.remove("hidden")}
function closeProductModal(){document.getElementById("productModal").classList.add("hidden")}
function updateSuggestedPrice(){const c=Number(document.getElementById("pCost").value||0),m=Number(document.getElementById("pMargin").value||0);document.getElementById("suggestedPrice").textContent=money(calcSuggested(c,m))}
function editProduct(id){const p=state.products.find(x=>x.id===id);if(!p)return;document.getElementById("modalTitle").textContent="Editar producto";document.getElementById("editId").value=id;document.getElementById("pName").value=p.name;document.getElementById("pType").value=p.type||"";document.getElementById("pDesc").value=p.desc||"";document.getElementById("pCost").value=p.cost;document.getElementById("pPrice").value=p.price;document.getElementById("pActive").value=String(p.active!==false);document.getElementById("pMargin").value=Math.max(1,Math.min(95,Math.round(calcMargin(p.price,p.cost))));updateSuggestedPrice();document.getElementById("productModal").classList.remove("hidden")}
async function saveProduct(){const id=Number(document.getElementById("editId").value||0),name=document.getElementById("pName").value.trim(),type=document.getElementById("pType").value.trim()||"Producto",desc=document.getElementById("pDesc").value.trim(),cost=Number(document.getElementById("pCost").value||0),price=Number(document.getElementById("pPrice").value||0),active=document.getElementById("pActive").value==="true";if(!name){alert("Ingresa el nombre.");return}if(price<=0){alert("Ingresa un precio de venta válido.");return}if(id){Object.assign(state.products.find(x=>x.id===id),{name,type,desc,cost,price,active})}else state.products.push({id:Date.now(),name,type,desc,cost,price,active});await persist();closeProductModal();renderProducts();renderAdmin();await pushProducts(false)}
async function deleteProduct(id){const used=state.orders.some(o=>o.items.some(i=>i.id===id));if(used){if(!confirm("Este producto aparece en pedidos históricos. Se eliminará solo del menú actual. ¿Continuar?"))return}else if(!confirm("¿Eliminar este producto?"))return;state.products=state.products.filter(x=>x.id!==id);await persist();renderProducts();renderAdmin();await pushProducts(false)}
async function saveSettings(){state.settings.businessName=document.getElementById("businessName").value.trim()||"Mi Hamburguesería";state.settings.businessPhone=document.getElementById("businessPhone").value.trim();state.settings.thanksMessage=document.getElementById("thanksMessage").value.trim()||"¡Gracias por tu pedido!";state.settings.serverUrl=document.getElementById("serverUrl").value.trim().replace(/\/$/,"");state.settings.apiKey=document.getElementById("apiKey").value.trim();await persist();renderAll();alert("Configuración guardada.");await syncNow(true)}
async function exportBackup(){const ok=await window.desktopAPI.exportBackup(state);if(ok)alert("Respaldo guardado.")}
async function importBackup(){try{const data=await window.desktopAPI.importBackup();if(!data)return;if(!confirm("Se reemplazarán los datos actuales por el respaldo seleccionado. ¿Continuar?"))return;state=data;await persist();renderAll();alert("Respaldo importado.")}catch(e){alert("No se pudo importar el respaldo.")}}
async function exportOrdersCSV(){const headers=["N°","Fecha","Cliente","Teléfono","Total","Costo","Utilidad","Pagado","Entregado","Estado","Entrega","Pago","Productos"],rows=state.orders.map(o=>[o.number,o.date,o.client,o.phone,o.total,o.cost??0,o.total-(o.cost??0),o.paid?"Sí":"No",o.delivered?"Sí":"No",o.status,o.delivery,o.payment,o.items.map(i=>`${i.qty}x ${i.name}`).join(" | ")]),esc=v=>`"${String(v??"").replace(/"/g,'""')}"`,csv=[headers,...rows].map(r=>r.map(esc).join(";")).join("\n");const ok=await window.desktopAPI.exportCSV(csv);if(ok)alert("CSV exportado.")}


function syncConfigured(){return Boolean(state.settings.serverUrl&&state.settings.apiKey)}
function setSyncStatus(kind,text){const b=document.getElementById("syncBadge"),m=document.getElementById("syncMessage");if(b){b.classList.remove("sync-on","sync-warn","sync-off");b.classList.add(kind==="on"?"sync-on":kind==="warn"?"sync-warn":"sync-off");b.textContent=(kind==="on"?"☁️ ":"⚠️ ")+text}if(m)m.textContent=text}
async function apiCall(path,method="GET",body=null){if(!syncConfigured())return{ok:false,status:0,error:"Configura el servidor y la clave de sincronización."};return window.desktopAPI.serverRequest({baseUrl:state.settings.serverUrl,apiKey:state.settings.apiKey,path,method,body})}
function remoteToLocal(r){
 const items=Array.isArray(r.items)?r.items.map(x=>({id:x.id,name:x.name||"Producto",type:x.type||"Producto",qty:Number(x.qty)||1,price:Number(x.price)||0,cost:Number(x.cost)||0})):[];
 const cost=items.reduce((s,x)=>s+x.cost*x.qty,0),total=Number(r.total)||0;
 return{id:"remote-"+r.id,remoteId:r.id,number:r.id,createdAt:r.fecha||new Date().toISOString(),date:r.fecha?new Date(r.fecha).toLocaleString("es-CL"):new Date().toLocaleString("es-CL"),client:r.cliente||"Sin nombre",phone:r.telefono||"",delivery:r.entrega||"Retiro",payment:r.pago||"Efectivo",address:r.direccion||"",notes:r.notas||"",items,total,cost,profit:total-cost,paid:Boolean(r.pagado),delivered:r.estado==="Entregado",status:r.estado||"Nuevo"}
}
async function pullRemoteOrders(showFeedback=false){
 const res=await apiCall("/api/desktop/orders");
 if(!res.ok){setSyncStatus("off",res.error||"Sin conexión");if(showFeedback)alert("No se pudo sincronizar: "+(res.error||res.status));return false}
 const rows=Array.isArray(res.data)?res.data:[],first=!state.settings.syncInitialized;let added=0;
 for(const r of rows.slice().reverse()){
  const found=state.orders.find(o=>Number(o.remoteId)===Number(r.id));
  if(found){const fresh=remoteToLocal(r);const localStatusChangedAt=Number(found.statusChangedAt||0),keepLocal=localStatusChangedAt&&Date.now()-localStatusChangedAt<15000;Object.assign(found,{client:fresh.client,phone:fresh.phone,delivery:fresh.delivery,payment:fresh.payment,address:fresh.address,notes:fresh.notes,items:fresh.items,total:fresh.total,cost:fresh.cost,profit:fresh.profit,paid:fresh.paid,delivered:keepLocal?found.delivered:fresh.delivered,status:keepLocal?found.status:fresh.status})}
  else{const fresh=remoteToLocal(r);state.orders.unshift(fresh);added++;if(!first)await window.desktopAPI.notify("Nuevo pedido web",`Pedido #${fresh.number} · ${fresh.client} · ${money(fresh.total)}`)}
 }
 state.settings.syncInitialized=true;await persist();renderOrders();renderBadges();renderStats();setSyncStatus("on","Sincronizado");if(showFeedback)alert(`Sincronización completa. ${added} pedido(s) nuevo(s).`);return true
}
async function pushProducts(showFeedback=false){
 if(!syncConfigured())return false;
 const res=await apiCall("/api/desktop/products","POST",{products:state.products});
 if(!res.ok){setSyncStatus("warn",res.error||"No se pudo publicar el menú");if(showFeedback)alert("No se pudo publicar el menú: "+(res.error||res.status));return false}
 setSyncStatus("on","Menú sincronizado");return true
}
async function syncOrderToServer(o){
 if(!o?.remoteId||!syncConfigured())return false;
 const res=await apiCall("/api/desktop/orders/"+o.remoteId,"PATCH",{estado:o.status,pagado:Boolean(o.paid)});
 if(!res.ok){setSyncStatus("warn","Cambio pendiente de sincronizar");return false}
 setSyncStatus("on","Sincronizado");return true
}
let activityLastId=Number(localStorage.getItem("activityLastId")||0),draftActivities=new Map();
function renderDraftActivities(){
 const box=document.getElementById("ordersList");if(!box)return;
 const drafts=[...draftActivities.values()].filter(a=>!Number(a.confirmado));
 if(!drafts.length)return;
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
  if(Number(a.confirmado))draftActivities.delete(a.token);else draftActivities.set(a.token,a);
  if(isNew){const who=(a.cliente||"Cliente").trim()||"Cliente";await window.desktopAPI.notify("🟡 Cliente preparando pedido",who+" está armando un pedido en la web.")}
 }
 localStorage.setItem("activityLastId",String(activityLastId));
 renderOrders();renderDraftActivities();
}
let syncBusy=false;
async function syncNow(showFeedback=false){if(syncBusy)return false;if(!syncConfigured()){setSyncStatus("off","Configura la sincronización");if(showFeedback)alert("Ingresa la URL de Render y la clave de sincronización.");return false}syncBusy=true;try{const ok=await pullRemoteOrders(showFeedback);if(ok)await pushProducts(false);return ok}finally{syncBusy=false}}
function startServerSync(){if(syncConfigured()){setSyncStatus("warn","Conectando…");syncNow(false);pullOrderActivity()}else setSyncStatus("off","Sin conexión");setInterval(()=>syncNow(false),10000);setInterval(()=>pullOrderActivity(),2000)}

init();
