#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "============================================"
echo "  Gestor de Pedidos - Mac M1 / Apple Silicon"
echo "============================================"

ARCH=$(uname -m)
if [ "$ARCH" != "arm64" ]; then
  echo "Aviso: este instalador está preparado para Apple Silicon (M1/M2/M3/M4)."
  echo "Arquitectura detectada: $ARCH"
fi

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "No se encontró Node.js."
  echo "Instala Node.js LTS para macOS ARM64 desde https://nodejs.org y vuelve a ejecutar este archivo."
  read -n 1 -s -r -p "Presiona una tecla para cerrar..."
  exit 1
fi

echo "Arquitectura detectada: $(uname -m)"
echo "Node: $(node -v)"
echo "NPM: $(npm -v)"
echo ""
echo "Instalando dependencias..."
npm install

echo ""
echo "Abriendo Gestor de Pedidos..."
npm start
