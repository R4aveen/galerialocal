# Auditoría de Módulos y Código Nativo (Android/Kotlin)

## 1. Módulos Nativos Personalizados

### `modules/galeria-media`
Este es el único módulo nativo personalizado (Local Expo Module) creado en el proyecto. 
- **Lenguaje:** Kotlin
- **Archivo Principal:** `android/src/main/java/expo/modules/galeriamedia/GaleriaMediaModule.kt`
- **Uso:** Implementa código fuertemente nativo utilizando las APIs de `MediaStore` de Android para consultar archivos multimedia (Imágenes/Videos). 
- **Tecnologías Nativas Involucradas:** 
  - `ContentUris`, `MediaStore` (APIs nativas de Android de acceso a la base de datos de medios local)
  - `Kotlin Coroutines` (`Dispatchers.IO`, `launch`) para procesos asíncronos en segundo plano (Background Threads).
  - Integración nativa con `Promise` para devolver datos de Android estructurados hasta el entorno JS/TS.

---

## 2. Aplicación Android Precompilada (`android/app`)

El proyecto actualmente es un **Bare Workflow / Prebuild**, lo cual significa que se ha generado el código fuente de las plataformas nativas.

- **Punto de Entrada Nativo:** `android/app/src/main/java/com/anonymous/galerialocal/MainApplication.kt`
- **Actividad Principal:** `android/app/src/main/java/com/anonymous/galerialocal/MainActivity.kt`
- **Lenguaje:** Kotlin
- **Uso:** Estos archivos inicializan el entorno de React Native junto con Expo Modules. A través de ellos, Android arranca su ciclo de vida y posteriormente monta el bundle de Javascript/TypeScript de la interfaz hecha en React.

---

## 3. Dependencias con Código Nativo (Librerías de Terceros de Expo / React Native)

Todos los siguientes paquetes listados en tu `package.json` integran **código nativo interno en Android (ya sea Java, Kotlin o C++)** e impactan la compilación mediante scripts de Gradle:

* **Expo SDK Core & File System:**
  * `expo` (Infraestructura de Módulos Core - C++/Kotlin)
  * `expo-file-system` (Acceso al almacenamiento interno/externo del dispositivo - Kotlin)
  * `expo-constants` (Obtención de propiedades del dispositivo a nivel sistema)
  * `expo-crypto` y `crypto-js` (Aunque crypto-js es JS, expo-crypto usa las API criptográficas nativas)

* **Media y Base de Datos:**
  * `expo-media-library` (Acceso, creación y manejo de álbumes de Android - Kotlin/Java - **El error crítico actual está relacionado con sus APIs de obtención sin permisos previos**).
  * `expo-image` y `expo-av` (Manejo de renderizado nativo de Bitmaps y reproducción de videos nativa ExoPlayer/MediaPlayer). *(Nota: expo-av avisa que está depreciado en futuras versiones)*.
  * `expo-sqlite` (Manejo de Base de datos SQL a nivel nativo - C/C++ y Kotlin).

* **Interfaz de Usuario y Animaciones (Muy dependientes de C++/JNI y Kotlin):**
  * `react-native-reanimated` (Aceleración de animaciones corriendo a 60/120fps en la capa nativa - C++).
  * `react-native-gesture-handler` (Interpretación nativa de gestos táctiles saltándose el puente de React).
  * `react-native-screens` (Maneja los ViewControllers y Fragmentos nativos directamente).
  * `react-native-safe-area-context` y `react-native-svg` (Dibujo nativo en lienzo).

---

## Conclusión y Recomendación

La aplicación es un híbrido entre un entorno de Javascript (React Native) y una fuerte interacción nativa, concentrada sobre todo en tu módulo hecho a medida (`galeria-media`) y en `expo-media-library`.

El error más recurrente que experimentas sobre "Missing permission" o fallos de compilación se debe a lo rápido que interacciona el código asíncrono de Javascript (`React useEffects`) pidiendo recursos (Álbumes / Fotos) antes de que la capa de Android (`Kotlin / Java`) valide los `Android Manifest Permissions` vía los hooks respectivos.
