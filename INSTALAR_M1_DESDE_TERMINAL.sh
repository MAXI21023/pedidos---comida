#!/bin/bash
set -e
cd "$(dirname "$0")"
chmod +x INSTALAR_M1.command CREAR_DMG_M1.command || true
xattr -dr com.apple.quarantine . 2>/dev/null || true
./INSTALAR_M1.command
