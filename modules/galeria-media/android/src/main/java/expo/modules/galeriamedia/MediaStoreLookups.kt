package expo.modules.galeriamedia

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.provider.BaseColumns
import android.provider.MediaStore

internal object MediaStoreLookups {
  fun findAssetContentUri(context: Context, assetId: Long): Uri? {
    val imageUri = findInCollection(context, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, assetId)
    if (imageUri != null) return imageUri
    return findInCollection(context, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, assetId)
  }

  private fun findInCollection(context: Context, collection: Uri, assetId: Long): Uri? {
    val selection = "${BaseColumns._ID} = ?"
    val args = arrayOf(assetId.toString())

    context.contentResolver.query(
      collection,
      arrayOf(BaseColumns._ID),
      selection,
      args,
      null
    )?.use { cursor ->
      if (cursor.moveToFirst()) {
        return ContentUris.withAppendedId(collection, assetId)
      }
    }

    return null
  }
}