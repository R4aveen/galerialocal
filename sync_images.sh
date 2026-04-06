#!/bin/bash

echo "Sincronizando imágenes de /home/az4th0th/Imagenes/Screenshots/ al emulador..."

# Esperar a que el emulador esté encendido (opcional pero ayuda si está arrancando)
adb wait-for-device

# Crear la carpeta Pictures en el emulador por si no existe
adb shell mkdir -p /sdcard/Pictures/Screenshots

# Pushear las imágenes de la PC al emulador
adb push /home/az4th0th/Imagenes/Screenshots/. /sdcard/Pictures/Screenshots/
adb push /home/az4th0th/Vídeos/. /sdcard/Pictures/Screenshots/
# Forzar a Android a escanear los nuevos archivos en la galería
echo "Avisando a Android para que actualice la galería..."
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/Screenshots/

echo "¡Listo! Tus imágenes ya deberían aparecer en GaleriaLocal."
