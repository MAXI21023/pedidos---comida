# Pedidos por link

App web para que los clientes entren a un link, elijan productos y envíen el pedido al panel del local.

## Uso local
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```
Cliente: http://127.0.0.1:5000
Panel: http://127.0.0.1:5000/admin
PIN inicial: 1234

## Publicar y obtener un link
Sube esta carpeta a un servicio compatible con Python/Flask (por ejemplo Render/Railway/Fly.io). Configura variables `ADMIN_PIN` y `SECRET_KEY`. El servicio te entregará una URL pública para compartir con clientes.

## Avisos
El panel solicita permiso del navegador y revisa nuevos pedidos cada 5 segundos. Cuando detecta uno nuevo, muestra una notificación del navegador y actualiza el panel.

## WhatsApp
El número de teléfono del cliente queda registrado. La notificación directa por WhatsApp al dueño requiere conectar WhatsApp Business Cloud API y sus credenciales oficiales; no se incluyen credenciales en el proyecto.
