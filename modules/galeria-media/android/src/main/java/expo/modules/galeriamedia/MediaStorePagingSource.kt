package expo.modules.galeriamedia

import android.content.Context
import androidx.paging.PagingSource
import androidx.paging.PagingState

internal class MediaStorePagingSource(
  private val context: Context,
  private val mediaFilter: String,
  private val sortOrder: String,
  private val pageSize: Int
) : PagingSource<Int, Map<String, Any?>>() {

  override suspend fun load(params: LoadParams<Int>): LoadResult<Int, Map<String, Any?>> {
    return try {
      val pageIndex = (params.key ?: 0).coerceAtLeast(0)
      val limit = params.loadSize.coerceAtLeast(pageSize)
      val offset = pageIndex * pageSize
      val data = MediaStoreQueries.getPagedAssetsChunk(context, limit, offset, mediaFilter, sortOrder)

      val nextKey = if (data.size < limit) null else pageIndex + 1
      val prevKey = if (pageIndex == 0) null else pageIndex - 1

      LoadResult.Page(
        data = data,
        prevKey = prevKey,
        nextKey = nextKey
      )
    } catch (error: Exception) {
      LoadResult.Error(error)
    }
  }

  override fun getRefreshKey(state: PagingState<Int, Map<String, Any?>>): Int? {
    val anchor = state.anchorPosition ?: return null
    val anchorPage = state.closestPageToPosition(anchor) ?: return null
    return anchorPage.prevKey?.plus(1) ?: anchorPage.nextKey?.minus(1)
  }
}
