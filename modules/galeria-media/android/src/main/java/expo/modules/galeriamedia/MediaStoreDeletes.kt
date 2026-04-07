package expo.modules.galeriamedia

import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.provider.BaseColumns
import android.provider.MediaStore

internal object MediaStoreDeletes {
  fun deleteAssetsByIds(context: Context, ids: List<Long>): Int {
    return deleteAssetsByIdsReturningIds(context, ids).size
  }

  fun deleteAssetsByIdsReturningIds(context: Context, ids: List<Long>): Set<Long> {
    val resolver = context.contentResolver
    val deletedIds = mutableSetOf<Long>()

    val imageIds = queryExistingIds(
      context,
      MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
      ids
    )
    if (imageIds.isNotEmpty()) {
      deletedIds.addAll(deleteFromCollection(resolver, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, imageIds))
    }

    val videoIds = queryExistingIds(
      context,
      MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
      ids
    )
    if (videoIds.isNotEmpty()) {
      deletedIds.addAll(deleteFromCollection(resolver, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, videoIds))
    }

    return deletedIds
  }

  private fun queryExistingIds(
    context: Context,
    collection: Uri,
    ids: List<Long>
  ): List<Long> {
    if (ids.isEmpty()) return emptyList()

    val placeholders = ids.joinToString(",") { "?" }
    val selection = "${BaseColumns._ID} IN ($placeholders)"
    val args = ids.map(Long::toString).toTypedArray()
    val results = mutableListOf<Long>()

    context.contentResolver.query(
      collection,
      arrayOf(BaseColumns._ID),
      selection,
      args,
      null
    )?.use { cursor ->
      val idCol = cursor.getColumnIndexOrThrow(BaseColumns._ID)
      while (cursor.moveToNext()) {
        results.add(cursor.getLong(idCol))
      }
    }

    return results
  }

  private fun deleteFromCollection(
    resolver: ContentResolver,
    collection: Uri,
    ids: List<Long>
  ): Set<Long> {
    if (ids.isEmpty()) return emptySet()

    val deleted = mutableSetOf<Long>()
    ids.forEach { id ->
      try {
        val itemUri = ContentUris.withAppendedId(collection, id)
        val rows = resolver.delete(itemUri, null, null)
        if (rows > 0) {
          deleted.add(id)
        }
      } catch (_: Exception) {
      }
    }

    return deleted
  }
}
