# Gestor de Pedidos para macOS

Aplicación de escritorio para administrar pedidos de comida, precios, costos, utilidad, margen, pagos, entregas y envío de resúmenes por WhatsApp.

## Funciones incluidas

- Crear y editar productos.
- Costo interno y precio de venta.
- Cálculo de utilidad y margen.
- Precio sugerido según margen objetivo.
- Nuevo pedido y carrito.
- Estados de cocina.
- Pago pendiente / pagado.
- Entrega pendiente / entregado.
- Notificaciones nativas de macOS cuando se marca pagado o entregado.
- Caja y rentabilidad por rango de fechas.
- Exportación CSV.
- Respaldo e importación de toda la información.
- Envío del resumen del pedido por WhatsApp.
- Datos guardados localmente en el Mac.

## Ejecutar en tu Mac

1. Instala Node.js LTS desde nodejs.org si todavía no lo tienes.
2. Abre Terminal.
3. Entra a la carpeta del proyecto:

   cd /ruta/a/gestor-pedidos-mac

4. Instala las dependencias:

   npm install

5. Ejecuta la aplicación:

   npm start

## Crear un instalador .dmg

### Mac Apple Silicon (M1/M2/M3/M4)

npm run dist:mac:arm64

### Mac Intel

npm run dist:mac:intel

El instalador quedará dentro de la carpeta `dist`.

> La primera compilación descargará Electron y electron-builder. Para distribuir públicamente la app sin advertencias de macOS, más adelante conviene firmarla y notarizarla con una cuenta Apple Developer.

## Próxima integración

Para que un mensaje entrante de WhatsApp se transforme automáticamente en pedido, se necesita conectar WhatsApp Business Platform (Cloud API) o un proveedor compatible y un pequeño backend con webhook. Para marcar pagos automáticamente, también se requiere conectar la pasarela de pago que uses.

## Mac con chip M1 (Apple Silicon)

Para un Mac M1 usa directamente:

1. `INSTALAR_M1.command` para instalar dependencias y abrir la aplicación.
2. `CREAR_DMG_M1.command` para generar el instalador `.dmg` ARM64.

El archivo resultante tendrá un nombre similar a:
`Gestor-de-Pedidos-0.1.0-arm64.dmg`
