#!/bin/bash
set -e
cd "$(dirname "$0")"
echo "============================================"
echo "  Crear instalador DMG"
echo "============================================"
if ! command -v node >/dev/null 2>&1; then
  echo "Instala Node.js LTS desde https://nodejs.org primero."
  read -n 1 -s -r -p "Presiona una tecla para cerrar..."
  exit 1
fi
npm install
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  npm run dist:mac:arm64
else
  npm run dist:mac:intel
fi
echo ""
echo "Listo. Revisa la carpeta dist."
open dist || true
