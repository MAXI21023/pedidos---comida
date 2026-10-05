#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "============================================"
echo "  Crear DMG - Mac M1 / Apple Silicon ARM64"
echo "============================================"

if ! command -v node >/dev/null 2>&1; then
  echo "No se encontró Node.js. Instala Node.js LTS ARM64 desde https://nodejs.org primero."
  read -n 1 -s -r -p "Presiona una tecla para cerrar..."
  exit 1
fi

npm install
npm run dist:mac:arm64

echo ""
echo "DMG ARM64 generado correctamente."
echo "Revisa la carpeta dist."
open dist || true
