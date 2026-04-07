package expo.modules.galeriamedia

import android.content.ContentValues
import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import java.io.File
import java.io.FileInputStream

internal object MediaStoreRestores {
  data class RestoreRequest(
    val itemId: String,
    val sourcePath: String,
    val filename: String?
  )

  data class RestoreResult(
    val itemId: String,
    val restored: Boolean,
    val createdUri: String?,
    val assetId: String?
  )

  fun restoreFilesToLibrary(context: Context, requests: List<RestoreRequest>): List<RestoreResult> {
    return requests.map { request ->
      val createdUri = restoreSingleFile(context, request.sourcePath, request.filename)
      val assetId = createdUri?.let {
        try {
          ContentUris.parseId(Uri.parse(it)).toString()
        } catch (_: Exception) {
          null
        }
      }
      RestoreResult(
        itemId = request.itemId,
        restored = createdUri != null,
        createdUri = createdUri,
        assetId = assetId
      )
    }
  }

  private fun restoreSingleFile(context: Context, sourcePath: String, filename: String?): String? {
    val sourceFile = resolveFileFromPath(sourcePath) ?: return null
    if (!sourceFile.exists()) return null

    val resolvedFilename = filename?.takeIf { it.isNotBlank() } ?: sourceFile.name
    val ext = resolvedFilename.substringAfterLast('.', "").lowercase()
    val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
    val isVideo = (mime?.startsWith("video/") == true) || ext in setOf("mp4", "mkv", "webm", "mov", "3gp")
    val collection = if (isVideo) {
      MediaStore.Video.Media.EXTERNAL_CONTENT_URI
    } else {
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    }

    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, resolvedFilename)
      put(MediaStore.MediaColumns.MIME_TYPE, mime ?: if (isVideo) "video/mp4" else "image/jpeg")
      put(MediaStore.MediaColumns.DATE_ADDED, System.currentTimeMillis() / 1000)
      put(MediaStore.MediaColumns.DATE_MODIFIED, System.currentTimeMillis() / 1000)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        put(MediaStore.MediaColumns.RELATIVE_PATH, if (isVideo) "Movies/GaleriaLocal" else "Pictures/GaleriaLocal")
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
    }

    val resolver = context.contentResolver
    val destinationUri = resolver.insert(collection, values) ?: return null

    return try {
      FileInputStream(sourceFile).use { input ->
        resolver.openOutputStream(destinationUri)?.use { output ->
          input.copyTo(output)
          output.flush()
        } ?: throw IllegalStateException("output-stream-null")
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val readyValues = ContentValues().apply {
          put(MediaStore.MediaColumns.IS_PENDING, 0)
        }
        resolver.update(destinationUri, readyValues, null, null)
      }

      destinationUri.toString()
    } catch (_: Exception) {
      try {
        resolver.delete(destinationUri, null, null)
      } catch (_: Exception) {
      }
      null
    }
  }

  private fun resolveFileFromPath(path: String): File? {
    return when {
      path.startsWith("file://") -> {
        val parsedPath = Uri.parse(path).path ?: return null
        File(parsedPath)
      }
      path.startsWith("content://") -> null
      else -> File(path)
    }
  }
}