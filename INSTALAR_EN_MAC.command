#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "============================================"
echo "  Gestor de Pedidos - Instalación macOS"
echo "============================================"
if ! command -v node >/dev/null 2>&1; then
  echo "No se encontró Node.js. Instala Node.js LTS desde https://nodejs.org y vuelve a ejecutar este archivo."
  read -n 1 -s -r -p "Presiona una tecla para cerrar..."
  exit 1
fi
npm install
echo ""
echo "Dependencias instaladas. Abriendo la aplicación..."
npm start
