package expo.modules.galeriamedia

import android.content.ContentUris
import android.content.Context
import android.os.Bundle
import android.os.Build
import android.provider.MediaStore

internal object MediaStoreQueries {
  private const val PAGED_CACHE_TTL_MS = 3_500L
  private const val MAX_PAGED_CACHE_ENTRIES = 10

  private data class PagedCacheEntry(
    val results: List<Map<String, Any?>>,
    val cachedAt: Long
  )

  private val pagedCache = LinkedHashMap<String, PagedCacheEntry>(16, 0.75f, true)

  @Synchronized
  private fun getCachedPagedResults(key: String): List<Map<String, Any?>>? {
    val now = System.currentTimeMillis()
    val entry = pagedCache[key] ?: return null
    if (now - entry.cachedAt > PAGED_CACHE_TTL_MS) {
      pagedCache.remove(key)
      return null
    }
    return entry.results
  }

  @Synchronized
  private fun putCachedPagedResults(key: String, results: List<Map<String, Any?>>) {
    pagedCache[key] = PagedCacheEntry(results = results, cachedAt = System.currentTimeMillis())
    while (pagedCache.size > MAX_PAGED_CACHE_ENTRIES) {
      val oldestKey = pagedCache.entries.firstOrNull()?.key ?: break
      pagedCache.remove(oldestKey)
    }
  }

  fun getGroupedAssets(context: Context): List<Map<String, Any>> {
    val projection = arrayOf(
      MediaStore.Images.Media._ID,
      MediaStore.Images.Media.DATE_ADDED,
      MediaStore.Images.Media.DATA
    )

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
        val dateAdded = cursor.getLong(dateCol) * 1000
        val path = cursor.getString(pathCol)

        results.add(
          mapOf(
            "id" to id.toString(),
            "uri" to path,
            "creationTime" to dateAdded
          )
        )
      }
    }

    return results
  }

  fun getPagedAssets(context: Context, limit: Int, mediaFilter: String, sortOrder: String): List<Map<String, Any?>> {
    val normalizedFilter = mediaFilter.lowercase()
    val normalizedSort = sortOrder.lowercase()
    val safeLimit = limit.coerceIn(1, 300)
    val cacheKey = "${normalizedFilter}|${normalizedSort}|${safeLimit}|0"
    val cached = getCachedPagedResults(cacheKey)
    if (cached != null) {
      return cached
    }

    val results = queryPagedAssetsChunk(context, safeLimit, 0, normalizedFilter, normalizedSort)
    putCachedPagedResults(cacheKey, results)
    return results
  }

  fun getPagedAssetsChunk(
    context: Context,
    limit: Int,
    offset: Int,
    mediaFilter: String,
    sortOrder: String
  ): List<Map<String, Any?>> {
    val normalizedFilter = mediaFilter.lowercase()
    val normalizedSort = sortOrder.lowercase()
    val safeLimit = limit.coerceIn(1, 300)
    val safeOffset = offset.coerceAtLeast(0)
    val cacheKey = "${normalizedFilter}|${normalizedSort}|${safeLimit}|${safeOffset}"
    val cached = getCachedPagedResults(cacheKey)
    if (cached != null) {
      return cached
    }

    val results = queryPagedAssetsChunk(context, safeLimit, safeOffset, normalizedFilter, normalizedSort)
    putCachedPagedResults(cacheKey, results)
    return results
  }

  private fun queryPagedAssetsChunk(
    context: Context,
    limit: Int,
    offset: Int,
    normalizedFilter: String,
    normalizedSort: String
  ): List<Map<String, Any?>> {
    val projection = arrayOf(
      MediaStore.Files.FileColumns._ID,
      MediaStore.Files.FileColumns.DATE_ADDED,
      MediaStore.Files.FileColumns.DATE_MODIFIED,
      MediaStore.Files.FileColumns.DISPLAY_NAME,
      MediaStore.Files.FileColumns.MEDIA_TYPE,
      MediaStore.Files.FileColumns.MIME_TYPE
    )

    val collection = MediaStore.Files.getContentUri("external")
    val mediaTypePhoto = MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE
    val mediaTypeVideo = MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO

    val selection = when (normalizedFilter) {
      "photo", "screenshot" -> "${MediaStore.Files.FileColumns.MEDIA_TYPE} = $mediaTypePhoto"
      "video" -> "${MediaStore.Files.FileColumns.MEDIA_TYPE} = $mediaTypeVideo"
      else -> "${MediaStore.Files.FileColumns.MEDIA_TYPE} IN ($mediaTypePhoto, $mediaTypeVideo)"
    }

    val sortDirection = if (normalizedSort == "oldest") "ASC" else "DESC"
    val sortColumn = MediaStore.Files.FileColumns.DATE_ADDED
    val sortOrderClause = "$sortColumn $sortDirection"

    val results = mutableListOf<Map<String, Any?>>()

    val query = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val queryArgs = Bundle().apply {
        putString(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION, selection)
        putStringArray(android.content.ContentResolver.QUERY_ARG_SORT_COLUMNS, arrayOf(sortColumn))
        putInt(
          android.content.ContentResolver.QUERY_ARG_SORT_DIRECTION,
          if (normalizedSort == "oldest") {
            android.content.ContentResolver.QUERY_SORT_DIRECTION_ASCENDING
          } else {
            android.content.ContentResolver.QUERY_SORT_DIRECTION_DESCENDING
          }
        )
        putInt(android.content.ContentResolver.QUERY_ARG_LIMIT, limit)
        putInt(android.content.ContentResolver.QUERY_ARG_OFFSET, offset)
      }
      context.contentResolver.query(collection, projection, queryArgs, null)
    } else {
      context.contentResolver.query(collection, projection, selection, null, "$sortOrderClause LIMIT $limit OFFSET $offset")
    }

    query?.use { cursor ->
      val idCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns._ID)
      val dateAddedCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_ADDED)
      val dateModifiedCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DATE_MODIFIED)
      val displayNameCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.DISPLAY_NAME)
      val mediaTypeCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MEDIA_TYPE)
      val mimeTypeCol = cursor.getColumnIndexOrThrow(MediaStore.Files.FileColumns.MIME_TYPE)

      while (cursor.moveToNext()) {
        val id = cursor.getLong(idCol)
        val dateAdded = cursor.getLong(dateAddedCol) * 1000L
        val dateModified = cursor.getLong(dateModifiedCol) * 1000L
        val displayName = cursor.getString(displayNameCol) ?: id.toString()
        val mediaType = cursor.getInt(mediaTypeCol)
        val mimeType = cursor.getString(mimeTypeCol) ?: ""
        val contentUri = when (mediaType) {
          mediaTypeVideo -> ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id)
          else -> ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
        }

        if (normalizedFilter == "screenshot") {
          val normalizedName = displayName.lowercase()
          if (!normalizedName.contains("screenshot") && !normalizedName.contains("captura")) {
            continue
          }
        }

        results.add(
          mapOf(
            "id" to id.toString(),
            "uri" to contentUri.toString(),
            "filename" to displayName,
            "mediaType" to if (mediaType == mediaTypeVideo) "video" else "photo",
            "creationTime" to dateAdded,
            "modificationTime" to dateModified,
            "mimeType" to mimeType
          )
        )
      }
    }

    return results
  }
}
