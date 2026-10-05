from flask import Flask, request, render_template, redirect, url_for, session, flash, jsonify
import sqlite3, os
from datetime import datetime
from functools import wraps

app=Flask(__name__)
app.secret_key=os.getenv('SECRET_KEY','cambia-esta-clave')
DB=os.getenv('DB_PATH','pedidos.db')
ADMIN_PIN=os.getenv('ADMIN_PIN','1234')

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
 c.commit(); c.close()

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
 items=[]; total=0
 for pid,p in mapa.items():
  try:q=max(0,int(request.form.get('q_'+pid,0)))
  except:q=0
  if q: items.append(f"{q} x {p['nombre']} ({money(p['precio'])} c/u)"); total += q*p['precio']
 if not items:
  c.close(); flash('Selecciona al menos un producto.'); return redirect(url_for('menu'))
 cliente=request.form.get('cliente','').strip(); telefono=request.form.get('telefono','').strip(); entrega=request.form.get('entrega','Retiro'); direccion=request.form.get('direccion','').strip(); pago=request.form.get('pago','Efectivo')
 cur=c.execute('INSERT INTO pedidos(cliente,telefono,direccion,entrega,pago,detalle,total,fecha) VALUES(?,?,?,?,?,?,?,?)',(cliente,telefono,direccion,entrega,pago,' | '.join(items),total,datetime.now().isoformat(timespec='seconds')))
 oid=cur.lastrowid; c.commit(); c.close()
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

@app.get('/api/nuevos')
@admin_required
def nuevos():
 c=db(); rows=c.execute("SELECT id,cliente,detalle,total,fecha FROM pedidos WHERE estado='Nuevo' ORDER BY id DESC LIMIT 20").fetchall(); c.close(); return jsonify([dict(r) for r in rows])

if __name__=='__main__':
 init_db(); app.run(host='0.0.0.0',port=int(os.getenv('PORT','5000')))
