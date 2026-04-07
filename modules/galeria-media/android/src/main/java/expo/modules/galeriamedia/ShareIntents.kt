package expo.modules.galeriamedia

import android.content.ClipData
import android.content.ClipDescription
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.webkit.MimeTypeMap
import androidx.core.content.FileProvider
import java.io.File

internal object ShareIntents {
  data class ShareMediaRequest(
    val assetId: String?,
    val sourceUri: String?,
    val filename: String?
  )

  data class ShareItem(
    val uri: String,
    val filename: String?
  )

  fun buildChooserIntentFromMediaRequests(
    context: Context,
    requests: List<ShareMediaRequest>,
    dialogTitle: String?
  ): Intent? {
    if (requests.isEmpty()) return null

    val uris = requests.mapNotNull { request ->
      val byId = request.assetId?.toLongOrNull()?.let { id ->
        MediaStoreLookups.findAssetContentUri(context, id)
      }
      if (byId != null) {
        byId
      } else {
        toSharableUri(context, request.sourceUri)
      }
    }

    if (uris.isEmpty()) return null
    return buildChooserIntentFromUris(context, uris, dialogTitle)
  }

  fun buildChooserIntent(context: Context, items: List<ShareItem>, dialogTitle: String?): Intent? {
    if (items.isEmpty()) return null

    val uris = items.mapNotNull { item ->
      toSharableUri(context, item.uri)
    }
    if (uris.isEmpty()) return null

    return buildChooserIntentFromUris(context, uris, dialogTitle)
  }

  private fun buildChooserIntentFromUris(context: Context, uris: List<Uri>, dialogTitle: String?): Intent {
    val mimeType = resolveMimeType(context, uris)
    val baseIntent = if (uris.size == 1) {
      Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, uris.first())
      }
    } else {
      Intent(Intent.ACTION_SEND_MULTIPLE).apply {
        type = mimeType
        putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(uris))
      }
    }

    baseIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

    // Improve compatibility with targets that inspect ClipData permissions.
    val clip = buildClipData(mimeType, uris)
    if (clip != null) {
      baseIntent.clipData = clip
    }

    return Intent.createChooser(baseIntent, dialogTitle ?: "Compartir")
  }

  private fun buildClipData(mimeType: String, uris: List<Uri>): ClipData? {
    if (uris.isEmpty()) return null
    val description = ClipDescription("shared-media", arrayOf(mimeType))
    val first = ClipData.Item(uris.first())
    val clipData = ClipData(description, first)
    for (i in 1 until uris.size) {
      clipData.addItem(ClipData.Item(uris[i]))
    }
    return clipData
  }

  private fun toSharableUri(context: Context, rawUri: String?): Uri? {
    if (rawUri.isNullOrBlank()) return null
    return try {
      when {
        rawUri.startsWith("content://") -> Uri.parse(rawUri)
        rawUri.startsWith("file://") -> {
          val path = Uri.parse(rawUri).path ?: return null
          val file = File(path)
          if (!file.exists()) return null
          FileProvider.getUriForFile(context, "${context.packageName}.FileSystemFileProvider", file)
        }
        else -> {
          val file = File(rawUri)
          if (!file.exists()) return null
          FileProvider.getUriForFile(context, "${context.packageName}.FileSystemFileProvider", file)
        }
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun resolveMimeType(context: Context, uris: List<Uri>): String {
    if (uris.isEmpty()) return "*/*"

    val types = uris.mapNotNull { uri ->
      context.contentResolver.getType(uri) ?: guessFromPath(uri.toString())
    }.distinct()

    if (types.isEmpty()) return "*/*"
    if (types.size == 1) return types[0]

    val topLevel = types.map { it.substringBefore('/') }.distinct()
    return if (topLevel.size == 1) {
      "${topLevel[0]}/*"
    } else {
      "*/*"
    }
  }

  private fun guessFromPath(path: String): String? {
    val extension = MimeTypeMap.getFileExtensionFromUrl(path)?.lowercase() ?: return null
    return MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension)
  }
}
