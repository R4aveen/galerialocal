package expo.modules.galeriamedia

import android.content.Context
import android.view.ViewGroup
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

class NativePhotoGridView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val recyclerView = RecyclerView(context)
  private val layoutManager = GridLayoutManager(context, 4)
  private val recycledViewPool = RecyclerView.RecycledViewPool()
  private var lastEndReachedAt = 0L

  private val adapter = NativePhotoGridAdapter(
    context = context,
    onPress = { item ->
      onPhotoPress(
        mapOf(
          "key" to item.key,
          "id" to item.id
        )
      )
    },
    onLongPress = { item ->
      onPhotoLongPress(
        mapOf(
          "key" to item.key,
          "id" to item.id
        )
      )
    }
  )

  val onPhotoPress by EventDispatcher<Map<String, Any?>>()
  val onPhotoLongPress by EventDispatcher<Map<String, Any?>>()
  val onEndReached by EventDispatcher<Unit>()

  init {
    recyclerView.layoutParams = LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    )
    recyclerView.layoutManager = layoutManager
    recyclerView.adapter = adapter
    recyclerView.setHasFixedSize(true)
    recyclerView.setItemViewCacheSize(64)
    recyclerView.setRecycledViewPool(recycledViewPool)
    recycledViewPool.setMaxRecycledViews(0, 160)
    layoutManager.initialPrefetchItemCount = 24
    layoutManager.isItemPrefetchEnabled = true
    recyclerView.itemAnimator = null
    recyclerView.addOnScrollListener(object : RecyclerView.OnScrollListener() {
      override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
        if (dy <= 0) return
        val total = layoutManager.itemCount
        if (total <= 0) return
        val lastVisible = layoutManager.findLastVisibleItemPosition()
        if (lastVisible < total - 12) return

        val now = System.currentTimeMillis()
        if (now - lastEndReachedAt < 420) return
        lastEndReachedAt = now
        onEndReached(Unit)
      }
    })
    addView(recyclerView)
  }

  fun setNumColumns(columns: Int) {
    val safe = columns.coerceAtLeast(1)
    if (layoutManager.spanCount == safe) return
    layoutManager.spanCount = safe
    layoutManager.initialPrefetchItemCount = (safe * 6).coerceAtLeast(12)
    recycledViewPool.setMaxRecycledViews(0, (safe * 40).coerceAtLeast(120))
  }

  fun setSelectionMode(enabled: Boolean) {
    adapter.setSelectionMode(enabled)
  }

  fun setSelectedIds(ids: List<String>) {
    adapter.setSelectedIds(ids)
  }

  fun setAssets(rawAssets: List<Map<String, Any?>>) {
    val normalized = rawAssets.mapNotNull { raw ->
      val key = raw["key"] as? String
      val id = raw["id"] as? String
      val uri = raw["uri"] as? String
      val mediaType = raw["mediaType"] as? String
      if (id.isNullOrBlank() || uri.isNullOrBlank()) {
        null
      } else {
        NativePhotoGridItem(
          key = if (key.isNullOrBlank()) "$id::$uri" else key,
          id = id,
          uri = uri,
          mediaType = mediaType
        )
      }
    }
    adapter.setItems(normalized)
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    val width = right - left
    if (width > 0) {
      val columns = layoutManager.spanCount.coerceAtLeast(1)
      val size = width / columns
      adapter.setItemSize(size)
    }
  }
}
