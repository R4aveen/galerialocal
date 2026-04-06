#!/bin/bash

echo "Iniciando el servidor de Metro y el emulador de Android..."
# Fuerza al emulador a usar XCB (X11) en lugar de Wayland para evitar crasheos de Qt
export QT_QPA_PLATFORM=xcb
# Ejecuta el script 'android' definido en el package.json (expo run:android)
npm run android
