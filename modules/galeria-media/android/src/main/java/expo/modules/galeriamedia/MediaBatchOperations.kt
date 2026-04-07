package expo.modules.galeriamedia

import android.content.Context

internal object MediaBatchOperations {
  data class MoveToTrashRequest(
    val assetId: Long,
    val destinationPath: String
  )

  data class MoveToTrashResult(
    val assetId: Long,
    val destinationPath: String,
    val copied: Boolean,
    val deleted: Boolean,
    val sourceUri: String?
  )

  data class CopyAndDeleteRequest(
    val assetId: Long,
    val sourceUri: String,
    val destinationPath: String
  )

  data class CopyAndDeleteResult(
    val assetId: Long,
    val destinationPath: String,
    val copied: Boolean,
    val deleted: Boolean
  )

  fun moveAssetsToTrash(
    context: Context,
    requests: List<MoveToTrashRequest>
  ): List<MoveToTrashResult> {
    val copiedIds = mutableListOf<Long>()
    val copiedById = mutableMapOf<Long, Boolean>()
    val sourceById = mutableMapOf<Long, String?>()

    requests.forEach { request ->
      val sourceUri = MediaStoreLookups.findAssetContentUri(context, request.assetId)?.toString()
      sourceById[request.assetId] = sourceUri

      val copied = if (sourceUri.isNullOrBlank()) {
        false
      } else {
        FileCopyUtils.copyFileToPath(context, sourceUri, request.destinationPath)
      }

      copiedById[request.assetId] = copied
      if (copied) {
        copiedIds.add(request.assetId)
      }
    }

    val deletedById = mutableMapOf<Long, Boolean>()
    if (copiedIds.isNotEmpty()) {
      val deletedIds = MediaStoreDeletes.deleteAssetsByIdsReturningIds(context, copiedIds)
      deletedIds.forEach { deletedId ->
        deletedById[deletedId] = true
      }
    }

    return requests.map { request ->
      val copied = copiedById[request.assetId] == true
      MoveToTrashResult(
        assetId = request.assetId,
        destinationPath = request.destinationPath,
        copied = copied,
        deleted = copied && deletedById[request.assetId] == true,
        sourceUri = sourceById[request.assetId]
      )
    }
  }

  fun copyFilesAndDeleteAssets(
    context: Context,
    requests: List<CopyAndDeleteRequest>
  ): List<CopyAndDeleteResult> {
    val copiedByAssetId = mutableMapOf<Long, Boolean>()

    requests.forEach { request ->
      val initialCopy = FileCopyUtils.copyFileToPath(context, request.sourceUri, request.destinationPath)
      if (initialCopy) {
        copiedByAssetId[request.assetId] = true
        return@forEach
      }

      // Fallback: resolve a fresh MediaStore content URI from assetId and retry natively.
      val lookupUri = MediaStoreLookups.findAssetContentUri(context, request.assetId)?.toString()
      val retriedCopy = if (lookupUri.isNullOrBlank()) {
        false
      } else {
        FileCopyUtils.copyFileToPath(context, lookupUri, request.destinationPath)
      }

      copiedByAssetId[request.assetId] = retriedCopy
    }

    val copiedIds = requests
      .filter { copiedByAssetId[it.assetId] == true }
      .map { it.assetId }

    val deletedCountById = mutableMapOf<Long, Boolean>()
    if (copiedIds.isNotEmpty()) {
      val deletedIds = MediaStoreDeletes.deleteAssetsByIdsReturningIds(context, copiedIds)
      deletedIds.forEach { deletedId ->
        deletedCountById[deletedId] = true
      }
    }

    return requests.map { request ->
      val copied = copiedByAssetId[request.assetId] == true
      CopyAndDeleteResult(
        assetId = request.assetId,
        destinationPath = request.destinationPath,
        copied = copied,
        deleted = copied && deletedCountById[request.assetId] == true
      )
    }
  }
}
