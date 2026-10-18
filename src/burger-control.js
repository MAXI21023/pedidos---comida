/* Burger Control: panel de lectura. No modifica pedidos ni el almacenamiento. */
(() => {
  const CL_TZ = 'America/Santiago';
  const moneyCL = n => '$' + Math.round(n).toLocaleString('es-CL');
  const dayKey = date => new Intl.DateTimeFormat('en-CA', {timeZone: CL_TZ, year:'numeric', month:'2-digit', day:'2-digit'}).format(date);
  const milliseconds = value => { const d = Date.parse(value || ''); return Number.isFinite(d) ? d : null; };
  let known = null, audioContext = null;
  const root = document.createElement('section');
  root.id = 'burgerControlPanel';
  root.className = 'card';
  root.style.cssText = 'margin:18px auto;max-width:1200px;padding:20px;';
  root.innerHTML = `
    <div class="row between wrap"><div><h2>🍔 Burger Control · Panel inteligente</h2>
    <div class="muted">Indicadores de los pedidos registrados en esta aplicación.</div></div>
    <button type="button" class="secondary small" id="burgerSoundButton">🔔 Activar sonido</button></div>
    <div class="stats topgap">
      <div class="stat"><span>Ventas hoy</span><b id="burgerSales">$0</b></div>
      <div class="stat"><span>Utilidad bruta estimada hoy</span><b id="burgerProfit">$0</b></div>
      <div class="stat"><span>Pedidos hoy</span><b id="burgerCount">0</b></div>
      <div class="stat"><span>Tiempo hasta entrega (promedio)</span><b id="burgerTime">Sin datos</b></div>
      <div class="stat"><span>Pedidos pendientes de entrega</span><b id="burgerPending">0</b></div>
      <div class="stat"><span>Más antiguo sin entregar</span><b id="burgerOldest">—</b></div>
    </div>
    <div id="burgerAdvice" class="notice topgap" role="status">Cargando métricas…</div>
    <div class="topgap"><h3>💬 Asistente del negocio</h3>
      <div class="muted">Consulta tus datos locales, sin enviarlos a servicios externos.</div>
      <form id="burgerQuestionForm" class="row wrap topgap">
        <input id="burgerQuestion" style="flex:1;min-width:200px" aria-label="Pregunta al asistente" placeholder="Ej.: ¿Cuánto gané hoy?" required>
        <button class="primary" type="submit">Consultar</button>
      </form>
      <div id="burgerAnswer" class="notice topgap" role="status">Pregúntame por ventas, ganancias, pedidos, pendientes o tiempos de entrega.</div>
    </div>
    <div class="smalltxt topgap">Utilidad bruta estimada = venta menos costo registrado de productos; no descuenta arriendo, sueldos ni otros gastos fijos. Los tiempos se calculan únicamente cuando existen marcas de recepción y entrega.</div>`;
  function beep() {
    if (!audioContext) return;
    try {
      const t = audioContext.currentTime;
      for (const [offset,frequency] of [[0,760],[0.20,950]]) {
        const oscillator = audioContext.createOscillator(), volume = audioContext.createGain();
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        volume.gain.setValueAtTime(0.0001,t+offset);
        volume.gain.exponentialRampToValueAtTime(0.16,t+offset+0.015);
        volume.gain.exponentialRampToValueAtTime(0.0001,t+offset+0.16);
        oscillator.connect(volume); volume.connect(audioContext.destination);
        oscillator.start(t+offset); oscillator.stop(t+offset+0.17);
      }
    } catch(e) { console.warn('Aviso sonoro no disponible',e); }
  }
  function mount() {
    if (!document.getElementById(root.id)) {
      const main = document.querySelector('main');
      if (main) main.insertBefore(root,main.firstChild);
    }
    root.querySelector('#burgerSoundButton').addEventListener('click',async () => {
      try {
        audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume(); beep();
        root.querySelector('#burgerSoundButton').textContent='🔔 Sonido activo';
      } catch(e) { root.querySelector('#burgerSoundButton').textContent='Sonido no disponible'; }
    },{once:true});
    root.querySelector('#burgerQuestionForm').addEventListener('submit', event => {
      event.preventDefault();
      const question = root.querySelector('#burgerQuestion').value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const all = (typeof state!=='undefined' && Array.isArray(state.orders)) ? state.orders : [];
      const today = dayKey(new Date());
      const daily = all.filter(o=> { const t=milliseconds(o.createdAt);return t!==null && dayKey(new Date(t))===today; });
      const sales = daily.reduce((v,o)=>v+Number(o.total||0),0);
      const costs = daily.reduce((v,o)=>v+(typeof currentOrderCost==='function'?Number(currentOrderCost(o)||0):Number(o.cost||0)),0);
      const pending = all.filter(o=>!o.delivered);
      const completed = daily.map(o=> {const a=milliseconds(o.createdAt),b=milliseconds(o.deliveredAt);return a!==null&&b!==null&&b>=a?(b-a)/60000:null;}).filter(x=>x!==null);
      let answer;
      if (/gan|utilidad|beneficio|margen/.test(question)) answer='La utilidad bruta estimada de hoy es '+moneyCL(sales-costs)+' (ventas '+moneyCL(sales)+' menos costos registrados '+moneyCL(costs)+'). No incluye gastos fijos.';
      else if (/vend|venta|ingreso|factur/.test(question)) answer='Las ventas registradas hoy suman '+moneyCL(sales)+' en '+daily.length+' pedidos. No significa necesariamente que ya estén cobradas.';
      else if (/demor|tiempo|entrega|rapide|promedio/.test(question)) answer=completed.length?'El tiempo promedio desde recepción hasta entrega de los '+completed.length+' pedidos entregados hoy con fechas válidas es '+Math.round(completed.reduce((a,b)=>a+b,0)/completed.length)+' minutos.':'No hay suficientes pedidos entregados hoy con fechas válidas para calcular el tiempo promedio.';
      else if (/pend|atras|espera/.test(question)) answer='Hay '+pending.length+' pedidos sin marcar como entregados en el historial.';
      else if (/pedido|orden|cuanto/.test(question)) answer='Hoy se registraron '+daily.length+' pedidos y hay '+pending.length+' sin marcar como entregados.';
      else answer='Puedo responder sobre ganancias, ventas, pedidos pendientes y tiempo promedio de entrega. Prueba con: ¿Cuánto vendí hoy?';
      root.querySelector('#burgerAnswer').textContent=answer;
    });
  }
  function render() {
    if (typeof state === 'undefined' || !Array.isArray(state.orders)) return;
    const all = state.orders;
    const identifiers = new Set(all.map(o=>String(o.remoteId ?? o.id)));
    if (known !== null) {
      const newlyReceived = all.filter(o=>o.remoteId != null && !known.has(String(o.remoteId)) && !o.delivered);
      if (newlyReceived.length) { beep(); root.querySelector('#burgerAdvice').textContent='🔔 '+newlyReceived.length+' pedido(s) nuevo(s) recibido(s)'; }
    }
    known=identifiers;
    const now=new Date(),today=dayKey(now);
    const todays=all.filter(o=>{const time=milliseconds(o.createdAt);return time!==null&&dayKey(new Date(time))===today;});
    const sum=todays.reduce((a,o)=>a+Number(o.total||0),0);
    const cost=todays.reduce((a,o)=>a+(typeof currentOrderCost==='function'?Number(currentOrderCost(o)||0):Number(o.cost||0)),0);
    const durations=todays.map(o=>{const start=milliseconds(o.createdAt),end=milliseconds(o.deliveredAt);return start!==null&&end!==null&&end>=start?(end-start)/60000:null;}).filter(n=>n!==null);
    const pending=all.filter(o=>!o.delivered);
    const age=pending.map(o=>milliseconds(o.createdAt)).filter(n=>n!==null);
    const oldest=age.length?Math.max(0,Math.round((Date.now()-Math.min(...age))/60000)):null;
    const values={burgerSales:moneyCL(sum),burgerProfit:moneyCL(sum-cost),burgerCount:String(todays.length),burgerTime:durations.length?Math.round(durations.reduce((a,b)=>a+b,0)/durations.length)+' min':'Sin datos',burgerPending:String(pending.length),burgerOldest:oldest===null?'—':oldest+' min'};
    for(const [id,value] of Object.entries(values)){const el=root.querySelector('#'+id);if(el)el.textContent=value;}
    if (!root.querySelector('#burgerAdvice').textContent.startsWith('🔔')) {
      root.querySelector('#burgerAdvice').textContent=oldest!==null&&oldest>=30?'⚠️ Hay un pedido pendiente hace '+oldest+' minutos. Revisa la cola.':'Indicadores actualizados. Los tiempos requieren pedidos marcados como entregados.';
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  setInterval(render,5000); render();
})();