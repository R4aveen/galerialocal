package expo.modules.galeriamedia

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import androidx.paging.PagingSource
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class GaleriaMediaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GaleriaMedia")

    View(NativePhotoGridView::class) {
      Events("onPhotoPress", "onPhotoLongPress", "onEndReached")

      Prop("assets") { view: NativePhotoGridView, assets: List<Map<String, Any?>> ->
        view.setAssets(assets)
      }

      Prop("numColumns") { view: NativePhotoGridView, columns: Int ->
        view.setNumColumns(columns)
      }

      Prop("selectionMode") { view: NativePhotoGridView, enabled: Boolean ->
        view.setSelectionMode(enabled)
      }

      Prop("selectedIds") { view: NativePhotoGridView, ids: List<String> ->
        view.setSelectedIds(ids)
      }
    }

    AsyncFunction("shareFilesAsync") { requests: List<Map<String, Any?>>, dialogTitle: String?, promise: Promise ->
      CoroutineScope(Dispatchers.Main).launch {
        val context = appContext.reactContext
        if (context == null) {
          promise.resolve(false)
          return@launch
        }

        val normalized = requests.mapNotNull { request ->
          val uri = request["uri"] as? String
          val filename = request["filename"] as? String
          if (uri.isNullOrBlank()) {
            null
          } else {
            ShareIntents.ShareItem(uri = uri, filename = filename)
          }
        }

        val chooser = ShareIntents.buildChooserIntent(context, normalized, dialogTitle)
        if (chooser == null) {
          promise.resolve(false)
          return@launch
        }

        try {
          val activity = appContext.currentActivity
          if (activity != null) {
            activity.startActivity(chooser)
          } else {
            chooser.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(chooser)
          }
          promise.resolve(true)
        } catch (_: Exception) {
          promise.resolve(false)
        }
      }
    }

    AsyncFunction("shareMediaItemsAsync") { requests: List<Map<String, Any?>>, dialogTitle: String?, promise: Promise ->
      CoroutineScope(Dispatchers.Main).launch {
        val context = appContext.reactContext
        if (context == null) {
          promise.resolve(false)
          return@launch
        }

        val normalized = requests.mapNotNull { request ->
          val assetId = request["assetId"] as? String
          val sourceUri = request["sourceUri"] as? String
          val filename = request["filename"] as? String
          if (assetId.isNullOrBlank() && sourceUri.isNullOrBlank()) {
            null
          } else {
            ShareIntents.ShareMediaRequest(
              assetId = assetId,
              sourceUri = sourceUri,
              filename = filename
            )
          }
        }

        val chooser = ShareIntents.buildChooserIntentFromMediaRequests(context, normalized, dialogTitle)
        if (chooser == null) {
          promise.resolve(false)
          return@launch
        }

        try {
          val activity = appContext.currentActivity
          if (activity != null) {
            activity.startActivity(chooser)
          } else {
            chooser.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(chooser)
          }
          promise.resolve(true)
        } catch (_: Exception) {
          promise.resolve(false)
        }
      }
    }

    AsyncFunction("restoreFilesToLibraryAsync") { requests: List<Map<String, String>>, promise: Promise ->
      CoroutineScope(Dispatchers.IO).launch {
        val context = appContext.reactContext
        if (context == null) {
          promise.resolve(emptyList<Map<String, Any?>>())
          return@launch
        }

        val normalizedRequests = requests.mapNotNull { request ->
          val itemId = request["itemId"]
          val sourcePath = request["sourcePath"]
          val filename = request["filename"]
          if (itemId.isNullOrBlank() || sourcePath.isNullOrBlank()) {
            null
          } else {
            MediaStoreRestores.RestoreRequest(itemId, sourcePath, filename)
          }
        }

        val results = MediaStoreRestores.restoreFilesToLibrary(context, normalizedRequests).map { result ->
          mapOf(
            "itemId" to result.itemId,
            "restored" to result.restored,
            "createdUri" to result.createdUri,
            "assetId" to result.assetId
          )
        }

        promise.resolve(results)
      }
    }

    AsyncFunction("moveAssetsToTrashAsync") { requests: List<Map<String, String>>, promise: Promise ->
      CoroutineScope(Dispatchers.IO).launch {
        val context = appContext.reactContext
        if (context == null) {
          promise.resolve(emptyList<Map<String, Any?>>())
          return@launch
        }

        val normalizedRequests = requests.mapNotNull { request ->
          val assetId = request["assetId"]?.toLongOrNull()
          val destinationPath = request["destinationPath"]
          if (assetId == null || destinationPath.isNullOrBlank()) {
            null
          } else {
            MediaBatchOperations.MoveToTrashRequest(assetId, destinationPath)
          }
        }

        val results = MediaBatchOperations.moveAssetsToTrash(context, normalizedRequests).map { result ->
          mapOf(
            "assetId" to result.assetId.toString(),
            "destinationPath" to result.destinationPath,
            "copied" to result.copied,
            "deleted" to result.deleted,
            "sourceUri" to result.sourceUri
          )
        }

        promise.resolve(results)
      }
    }

    AsyncFunction("copyFilesAndDeleteAssetsAsync") { requests: List<Map<String, String>>, promise: Promise ->
      CoroutineScope(Dispatchers.IO).launch {
        val context = appContext.reactContext
        if (context == null) {
          promise.resolve(emptyList<Map<String, Any?>>())
          return@launch
        }

        val normalizedRequests = requests.mapNotNull { request ->
          val assetId = request["assetId"]?.toLongOrNull()
          val sourceUri = request["sourceUri"]
          val destinationPath = request["destinationPath"]
          if (assetId == null || sourceUri.isNullOrBlank() || destinationPath.isNullOrBlank()) {
            null
          } else {
            MediaBatchOperations.CopyAndDeleteRequest(assetId, sourceUri, destinationPath)
          }
        }

        val results = MediaBatchOperations.copyFilesAndDeleteAssets(context, normalizedRequests).map { result ->
          mapOf(
            "assetId" to result.assetId.toString(),
            "destinationPath" to result.destinationPath,
            "copied" to result.copied,
            "deleted" to result.deleted
          )
        }

        promise.resolve(results)
      }
    }

    AsyncFunction("copyFilesToPathsAsync") { requests: List<Map<String, String>>, promise: Promise ->
      CoroutineScope(Dispatchers.IO).launch {
        val context = appContext.reactContext
        if (context == null) {
          promise.resolve(emptyList<Map<String, Any?>>())
          return@launch
        }

        val normalizedRequests = requests.mapNotNull { request ->
          val sourceUri = request["sourceUri"]
          val destinationPath = request["destinationPath"]
          if (sourceUri.isNullOrBlank() || destinationPath.isNullOrBlank()) {
            null
          } else {
            FileCopyUtils.CopyRequest(sourceUri, destinationPath)
          }
        }

        val results = FileCopyUtils.copyFilesToPaths(context, normalizedRequests).map { result ->
          mapOf(
            "sourceUri" to result.sourceUri,
            "destinationPath" to result.destinationPath,
            "copied" to result.copied
          )
        }

        promise.resolve(results)
      }
    }

    AsyncFunction("deleteAssetsByIdsAsync") { ids: List<String>, promise: Promise ->
      CoroutineScope(Dispatchers.IO).launch {
        val context = appContext.reactContext
        if (context == null) {
          promise.resolve(0)
          return@launch
        }

        val numericIds = ids.mapNotNull { it.toLongOrNull() }.distinct()
        if (numericIds.isEmpty()) {
          promise.resolve(0)
          return@launch
        }

        val deleted = MediaStoreDeletes.deleteAssetsByIds(context, numericIds)
        promise.resolve(deleted)
      }
    }

    AsyncFunction("copyFileToPathAsync") { sourceUri: String, destinationPath: String, promise: Promise ->
      CoroutineScope(Dispatchers.IO).launch {
        val context = appContext.reactContext
        if (context == null) {
          promise.resolve(false)
          return@launch
        }

        val copied = FileCopyUtils.copyFileToPath(context, sourceUri, destinationPath)
        promise.resolve(copied)
      }
    }

    AsyncFunction("getGroupedAssetsAsync") { filter: String, promise: Promise ->
      // 1. Ejecutar query pesado en Dispatchers.IO (Background Thread)
      CoroutineScope(Dispatchers.IO).launch {
        val context = appContext.reactContext
        if (context == null) {
            promise.resolve(emptyList<Map<String, Any>>())
            return@launch
        }

        val results = MediaStoreQueries.getGroupedAssets(context)
        promise.resolve(results)
      }
    }

    AsyncFunction("getPagedAssetsAsync") { limit: Int, mediaFilter: String, sortOrder: String, promise: Promise ->
      CoroutineScope(Dispatchers.IO).launch {
        val context = appContext.reactContext
        if (context == null) {
          promise.resolve(emptyList<Map<String, Any?>>())
          return@launch
        }

        val results = MediaStoreQueries.getPagedAssets(context, limit, mediaFilter, sortOrder)
        promise.resolve(results)
      }
    }

    AsyncFunction("getPagedAssetsChunkAsync") { options: Map<String, Any?>, promise: Promise ->
      CoroutineScope(Dispatchers.IO).launch {
        val context = appContext.reactContext
        if (context == null) {
          promise.resolve(emptyList<Map<String, Any?>>())
          return@launch
        }

        val page = (options["page"] as? Number)?.toInt() ?: 0
        val pageSize = (options["pageSize"] as? Number)?.toInt() ?: 120
        val mediaFilter = (options["mediaFilter"] as? String) ?: "all"
        val sortOrder = (options["sortOrder"] as? String) ?: "newest"

        val safePage = page.coerceAtLeast(0)
        val safePageSize = pageSize.coerceIn(1, 300)
        val pagingSource = MediaStorePagingSource(
          context = context,
          mediaFilter = mediaFilter,
          sortOrder = sortOrder,
          pageSize = safePageSize
        )

        when (
          val loaded = pagingSource.load(
            PagingSource.LoadParams.Refresh<Int>(
              key = safePage,
              loadSize = safePageSize,
              placeholdersEnabled = false
            )
          )
        ) {
          is PagingSource.LoadResult.Page -> promise.resolve(loaded.data)
          is PagingSource.LoadResult.Error -> {
            promise.reject("E_PAGED_CHUNK", loaded.throwable.message ?: "Failed to load paged chunk", loaded.throwable)
          }
          else -> promise.resolve(emptyList<Map<String, Any?>>())
        }
      }
    }

    AsyncFunction("getAppStorageStatsAsync") { promise: Promise ->
      CoroutineScope(Dispatchers.IO).launch {
        val context = appContext.reactContext
        if (context == null) {
          promise.resolve(mapOf(
            "totalBytes" to 0L,
            "freeBytes" to 0L,
            "cacheBytes" to 0L,
            "appBytes" to 0L
          ))
          return@launch
        }

        val stats = CacheMaintenance.getStorageStats(context)
        promise.resolve(
          mapOf(
            "totalBytes" to stats.totalBytes,
            "freeBytes" to stats.freeBytes,
            "cacheBytes" to stats.cacheBytes,
            "appBytes" to stats.appBytes
          )
        )
      }
    }

    AsyncFunction("trimAppCacheAsync") { options: Map<String, Any?>, promise: Promise ->
      CoroutineScope(Dispatchers.IO).launch {
        val context = appContext.reactContext
        if (context == null) {
          promise.resolve(mapOf("freedBytes" to 0L, "cacheBytesAfter" to 0L))
          return@launch
        }

        val maxBytes = (options["maxBytes"] as? Number)?.toLong() ?: (220L * 1024L * 1024L)
        val maxAgeMs = (options["maxAgeMs"] as? Number)?.toLong() ?: (72L * 60L * 60L * 1000L)
        val result = CacheMaintenance.trimCache(context, maxBytes, maxAgeMs)
        promise.resolve(
          mapOf(
            "freedBytes" to result.freedBytes,
            "cacheBytesAfter" to result.cacheBytesAfter
          )
        )
      }
    }

    AsyncFunction("clearAppCacheAsync") { promise: Promise ->
      CoroutineScope(Dispatchers.IO).launch {
        val context = appContext.reactContext
        if (context == null) {
          promise.resolve(mapOf("freedBytes" to 0L, "cacheBytesAfter" to 0L))
          return@launch
        }

        val result = CacheMaintenance.clearCache(context)
        promise.resolve(
          mapOf(
            "freedBytes" to result.freedBytes,
            "cacheBytesAfter" to result.cacheBytesAfter
          )
        )
      }
    }
  }
}
