package expo.modules.galeriamedia

import android.content.Context
import android.net.Uri
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream

internal object FileCopyUtils {
  data class CopyRequest(
    val sourceUri: String,
    val destinationPath: String
  )

  data class CopyResult(
    val sourceUri: String,
    val destinationPath: String,
    val copied: Boolean
  )

  fun copyFileToPath(context: Context, sourceUri: String, destinationPath: String): Boolean {
    return try {
      val destinationFile = File(normalizeFilePath(destinationPath))
      destinationFile.parentFile?.mkdirs()

      val inputStream = openInputStream(context, sourceUri) ?: return false
      inputStream.use { input ->
        FileOutputStream(destinationFile).use { output ->
          input.copyTo(output)
          output.flush()
        }
      }

      true
    } catch (_: Exception) {
      false
    }
  }

  fun copyFilesToPaths(context: Context, requests: List<CopyRequest>): List<CopyResult> {
    return requests.map { request ->
      CopyResult(
        sourceUri = request.sourceUri,
        destinationPath = request.destinationPath,
        copied = copyFileToPath(context, request.sourceUri, request.destinationPath)
      )
    }
  }

  private fun openInputStream(context: Context, sourceUri: String): InputStream? {
    return when {
      sourceUri.startsWith("content://") -> context.contentResolver.openInputStream(Uri.parse(sourceUri))
      sourceUri.startsWith("file://") -> {
        val parsedPath = Uri.parse(sourceUri).path ?: return null
        FileInputStream(File(parsedPath))
      }
      else -> FileInputStream(File(sourceUri))
    }
  }

  private fun normalizeFilePath(pathOrUri: String): String {
    return if (pathOrUri.startsWith("file://")) {
      Uri.parse(pathOrUri).path ?: pathOrUri.removePrefix("file://")
    } else {
      pathOrUri
    }
  }
}
