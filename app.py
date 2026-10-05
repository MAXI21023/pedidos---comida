from flask import Flask, request, render_template, redirect, url_for, session, flash, jsonify
import sqlite3, os, hmac
from datetime import datetime
from functools import wraps

app=Flask(__name__)
app.secret_key=os.getenv('SECRET_KEY','cambia-esta-clave')
DB=os.getenv('DB_PATH','pedidos.db')
ADMIN_PIN=os.getenv('ADMIN_PIN','1234')
API_KEY=os.getenv('API_KEY','')

def db():
 c=sqlite3.connect(DB); c.row_factory=sqlite3.Row; return c

def init_db():
 c=db(); c.executescript('''
 CREATE TABLE IF NOT EXISTS productos(id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,tipo TEXT NOT NULL,precio INTEGER NOT NULL,costo INTEGER NOT NULL DEFAULT 0,activo INTEGER DEFAULT 1);
 CREATE TABLE IF NOT EXISTS pedidos(id INTEGER PRIMARY KEY AUTOINCREMENT,cliente TEXT NOT NULL,telefono TEXT NOT NULL,direccion TEXT,entrega TEXT NOT NULL,pago TEXT NOT NULL,detalle TEXT NOT NULL,total INTEGER NOT NULL,estado TEXT DEFAULT 'Nuevo',pagado INTEGER DEFAULT 0,fecha TEXT NOT NULL);
 ''')
 if c.execute('SELECT COUNT(*) n FROM productos').fetchone()['n']==0:
  c.executemany('INSERT INTO productos(nombre,tipo,precio,costo) VALUES(?,?,?,?)',[
   ('Burger Clásica','Hamburguesas',6990,3500),('Burger Tocino','Hamburguesas',7990,4100),('Papas Fritas','Acompañamientos',2990,1200)])
 # Migraciones compatibles con bases existentes
 cols_prod={r['name'] for r in c.execute("PRAGMA table_info(productos)").fetchall()}
 if 'desktop_id' not in cols_prod: c.execute('ALTER TABLE productos ADD COLUMN desktop_id TEXT')
 if 'descripcion' not in cols_prod: c.execute("ALTER TABLE productos ADD COLUMN descripcion TEXT DEFAULT ''")
 cols_ped={r['name'] for r in c.execute("PRAGMA table_info(pedidos)").fetchall()}
 if 'notas' not in cols_ped: c.execute("ALTER TABLE pedidos ADD COLUMN notas TEXT DEFAULT ''")
 c.execute('''CREATE TABLE IF NOT EXISTS pedido_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL,
  producto_id INTEGER,
  nombre TEXT NOT NULL,
  tipo TEXT,
  cantidad INTEGER NOT NULL,
  precio INTEGER NOT NULL,
  costo INTEGER NOT NULL DEFAULT 0
 )''')
 c.commit(); c.close()

def api_required(f):
 @wraps(f)
 def w(*a,**k):
  supplied=request.headers.get('X-API-Key','')
  if not API_KEY or not supplied or not hmac.compare_digest(supplied,API_KEY):
   return jsonify({'error':'No autorizado'}),401
  return f(*a,**k)
 return w

def money(n): return '$'+f'{int(n):,}'.replace(',','.')
app.jinja_env.filters['money']=money

def admin_required(f):
 @wraps(f)
 def w(*a,**k):
  if not session.get('admin'): return redirect(url_for('login'))
  return f(*a,**k)
 return w

@app.route('/')
def menu():
 c=db(); ps=c.execute('SELECT * FROM productos WHERE activo=1 ORDER BY tipo,nombre').fetchall(); c.close()
 return render_template('menu.html',productos=ps)

@app.post('/ordenar')
def ordenar():
 c=db(); productos=c.execute('SELECT * FROM productos WHERE activo=1').fetchall(); mapa={str(p['id']):p for p in productos}
 items=[]; structured=[]; total=0
 for pid,p in mapa.items():
  try:q=max(0,int(request.form.get('q_'+pid,0)))
  except:q=0
  if q:
   items.append(f"{q} x {p['nombre']} ({money(p['precio'])} c/u)")
   structured.append((p['id'],p['nombre'],p['tipo'],q,p['precio'],p['costo']))
   total += q*p['precio']
 if not items:
  c.close(); flash('Selecciona al menos un producto.'); return redirect(url_for('menu'))
 cliente=request.form.get('cliente','').strip(); telefono=request.form.get('telefono','').strip(); entrega=request.form.get('entrega','Retiro'); direccion=request.form.get('direccion','').strip(); pago=request.form.get('pago','Efectivo'); notas=request.form.get('notas','').strip()
 cur=c.execute('INSERT INTO pedidos(cliente,telefono,direccion,entrega,pago,detalle,total,fecha,notas) VALUES(?,?,?,?,?,?,?,?,?)',(cliente,telefono,direccion,entrega,pago,' | '.join(items),total,datetime.now().isoformat(timespec='seconds'),notas))
 oid=cur.lastrowid
 c.executemany('INSERT INTO pedido_items(pedido_id,producto_id,nombre,tipo,cantidad,precio,costo) VALUES(?,?,?,?,?,?,?)',[(oid,*x) for x in structured])
 c.commit(); c.close()
 return render_template('confirmacion.html',pedido=oid,total=total,cliente=cliente)

@app.route('/admin/login',methods=['GET','POST'])
def login():
 if request.method=='POST' and request.form.get('pin')==ADMIN_PIN:
  session['admin']=True; return redirect(url_for('admin'))
 if request.method=='POST': flash('PIN incorrecto')
 return render_template('login.html')

@app.route('/admin')
@admin_required
def admin():
 c=db(); pedidos=c.execute('SELECT * FROM pedidos ORDER BY id DESC').fetchall(); productos=c.execute('SELECT * FROM productos ORDER BY tipo,nombre').fetchall()
 stats=c.execute("SELECT COUNT(*) pedidos,COALESCE(SUM(total),0) ventas,SUM(CASE WHEN estado='Nuevo' THEN 1 ELSE 0 END) nuevos FROM pedidos WHERE date(fecha)=date('now','localtime')").fetchone(); c.close()
 return render_template('admin.html',pedidos=pedidos,productos=productos,stats=stats)

@app.post('/admin/pedido/<int:i>')
@admin_required
def actualizar(i):
 c=db(); c.execute('UPDATE pedidos SET estado=?,pagado=? WHERE id=?',(request.form['estado'],1 if request.form.get('pagado')=='1' else 0,i)); c.commit(); c.close(); return redirect(url_for('admin'))

@app.post('/admin/producto')
@admin_required
def producto():
 f=request.form; c=db(); c.execute('INSERT INTO productos(nombre,tipo,precio,costo) VALUES(?,?,?,?)',(f['nombre'],f['tipo'],int(f['precio']),int(f.get('costo') or 0))); c.commit(); c.close(); return redirect(url_for('admin'))

@app.get('/api/desktop/health')
@api_required
def desktop_health():
 return jsonify({'ok':True,'service':'pedidos-comida','version':'0.2.0'})

@app.get('/api/desktop/orders')
@api_required
def desktop_orders():
 c=db()
 rows=c.execute('SELECT * FROM pedidos ORDER BY id DESC LIMIT 200').fetchall()
 result=[]
 for r in rows:
  items=c.execute('SELECT producto_id,nombre,tipo,cantidad,precio,costo FROM pedido_items WHERE pedido_id=? ORDER BY id',(r['id'],)).fetchall()
  if items:
   out_items=[{'id':x['producto_id'],'name':x['nombre'],'type':x['tipo'] or 'Producto','qty':x['cantidad'],'price':x['precio'],'cost':x['costo']} for x in items]
  else:
   out_items=[{'id':None,'name':r['detalle'],'type':'Pedido web','qty':1,'price':r['total'],'cost':0}]
  result.append({
   'id':r['id'],'cliente':r['cliente'],'telefono':r['telefono'],'direccion':r['direccion'] or '',
   'entrega':r['entrega'],'pago':r['pago'],'detalle':r['detalle'],'total':r['total'],
   'estado':r['estado'],'pagado':bool(r['pagado']),'fecha':r['fecha'],
   'notas':r['notas'] if 'notas' in r.keys() else '','items':out_items
  })
 c.close()
 return jsonify(result)

@app.patch('/api/desktop/orders/<int:i>')
@api_required
def desktop_update_order(i):
 data=request.get_json(silent=True) or {}
 allowed={'Nuevo','Confirmado','Preparando','Listo','Entregado','Cancelado'}
 c=db()
 row=c.execute('SELECT id FROM pedidos WHERE id=?',(i,)).fetchone()
 if not row:
  c.close(); return jsonify({'error':'Pedido no encontrado'}),404
 if 'estado' in data:
  estado=str(data['estado'])
  if estado not in allowed:
   c.close(); return jsonify({'error':'Estado no válido'}),400
  c.execute('UPDATE pedidos SET estado=? WHERE id=?',(estado,i))
 if 'pagado' in data:
  c.execute('UPDATE pedidos SET pagado=? WHERE id=?',(1 if data['pagado'] else 0,i))
 c.commit(); c.close()
 return jsonify({'ok':True,'id':i})

@app.post('/api/desktop/products')
@api_required
def desktop_products():
 data=request.get_json(silent=True) or {}
 products=data.get('products',[])
 if not isinstance(products,list):
  return jsonify({'error':'Formato de productos no válido'}),400
 c=db()
 c.execute('UPDATE productos SET activo=0')
 for p in products:
  did=str(p.get('id','')).strip()
  name=str(p.get('name','')).strip()
  if not did or not name: continue
  tipo=str(p.get('type') or 'Producto').strip()
  desc=str(p.get('desc') or '').strip()
  precio=max(0,int(p.get('price') or 0))
  costo=max(0,int(p.get('cost') or 0))
  activo=1 if p.get('active',True) else 0
  old=c.execute('SELECT id FROM productos WHERE desktop_id=?',(did,)).fetchone()
  if old:
   c.execute('UPDATE productos SET nombre=?,tipo=?,descripcion=?,precio=?,costo=?,activo=? WHERE desktop_id=?',(name,tipo,desc,precio,costo,activo,did))
  else:
   c.execute('INSERT INTO productos(nombre,tipo,precio,costo,activo,desktop_id,descripcion) VALUES(?,?,?,?,?,?,?)',(name,tipo,precio,costo,activo,did,desc))
 c.commit(); c.close()
 return jsonify({'ok':True,'count':len(products)})

@app.get('/api/nuevos')
@admin_required
def nuevos():
 c=db(); rows=c.execute("SELECT id,cliente,detalle,total,fecha FROM pedidos WHERE estado='Nuevo' ORDER BY id DESC LIMIT 20").fetchall(); c.close(); return jsonify([dict(r) for r in rows])

init_db()
if __name__=='__main__':
 init_db(); app.run(host='0.0.0.0',port=int(os.getenv('PORT','5000')))
