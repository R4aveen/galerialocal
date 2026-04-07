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

---

## 4. Evaluación de Nativización de Componentes UI (Drag Select / Grid)

### Estado actual

- La grilla está en `src/components/PhotoGrid.tsx` con `FlashList`.
- El drag select vive en JS/TS (`PhotoGrid` + `useSelectionStore`) y ya fue optimizado con delta incremental.
- El cuello principal restante es CPU en JS durante gestos largos y reactividad por celdas visibles.

### Qué SÍ conviene nativizar

1. `PhotoGrid` como vista nativa Android (`RecyclerView`)
- Motivo: hit testing, autoscroll y actualización de rango viven mejor en UI thread nativo.
- Impacto esperado: drag select y scroll más fluidos en galerías grandes.

2. Motor de selección de rango en nativo
- Motivo: elimina el costo de recalcular/propagar estado de selección en JS por frame.
- Impacto esperado: menos jank al arrastrar rápido sobre cientos de items.

3. Timeline rail/scrubber en nativo (opcional)
- Motivo: interacción continua de alta frecuencia.
- Impacto esperado: scrub anual/mes más estable.

### Qué NO conviene nativizar primero

1. `PhotoThumbnail` aislado
- Ganancia baja si la lista y el gesto principal siguen en JS.

2. Pantallas de negocio (`albums.tsx`, `private.tsx`, `trash.tsx`)
- Mejor mantenerlas en TS; no son el cuello duro de frames.

### Ruta recomendada (sin reescritura total)

Fase A (rápida)
- Crear `NativePhotoGridView` (Expo View Module) con:
  - render de thumbnails por `content://` uri
  - selección simple
  - evento `onSelectionChange`

Fase B (alto impacto)
- Añadir drag select nativo:
  - ancla de rango
  - autoscroll de borde
  - `onDragSelectionDelta`

Fase C (integración híbrida)
- Mantener navegación, actions bar y lógica de producto en React.
- Usar la vista nativa solo para la grilla en `index.tsx` y luego `album/[id].tsx`.

### Criterio de decisión para migrar 100% grid a nativo

- Si con optimizaciones JS (ya aplicadas) el drag select sigue con jank perceptible en dispositivos medios.
- Si la tasa de frames cae de forma consistente en lotes > 5k assets.

### Recomendación final

- Mantener arquitectura híbrida:
  - UI de producto en TS/React
  - Grid interactiva + selección de rango en nativo
- Esta combinación da la mayor mejora de fluidez con menor riesgo que migrar toda la app a Compose ahora.
