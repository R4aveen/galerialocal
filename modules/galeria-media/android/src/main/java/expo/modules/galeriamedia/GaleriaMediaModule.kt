package expo.modules.galeriamedia

import android.content.ContentUris
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

import expo.modules.kotlin.Promise
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

class GaleriaMediaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GaleriaMedia")

    AsyncFunction("getGroupedAssetsAsync") { filter: String, promise: Promise ->
      // 1. Ejecutar query pesado en Dispatchers.IO (Background Thread)
      CoroutineScope(Dispatchers.IO).launch {
        val context = appContext.reactContext
        if (context == null) {
            promise.resolve(emptyList<Map<String, Any>>())
            return@launch
        }

        
        val projection = arrayOf(
          MediaStore.Images.Media._ID,
          MediaStore.Images.Media.DATE_ADDED,
          MediaStore.Images.Media.DATA
        )

        // 2. Aquí agruparemos via SQL o Map nativo para DEVOLVER 
        // JSON listo a JS, evadiendo iteraciones en el MainThread
        val results = mutableListOf<Map<String, Any>>()
        val query = context.contentResolver.query(
          MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
          projection,
          null,
          null,
          "${MediaStore.Images.Media.DATE_ADDED} DESC"
        )

        query?.use { cursor ->
          val idCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID)
          val dateCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED)
          val pathCol = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATA)

          while (cursor.moveToNext()) {
            val id = cursor.getLong(idCol)
            val dateAdded = cursor.getLong(dateCol) * 1000 // A milisegundos
            val path = cursor.getString(pathCol)

            // Simplificación del agrupador
            results.add(mapOf(
              "id" to id.toString(),
              "uri" to path,
              "creationTime" to dateAdded
            ))
          }
        }
        
        // 3. Resultado final enviado por JSI / React Bridge
        promise.resolve(results)
      }
    }
  }
}
