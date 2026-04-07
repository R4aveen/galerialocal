package expo.modules.galeriamedia

import android.content.Context
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.dispose
import coil.load
import coil.size.Precision

internal data class NativePhotoGridItem(
  val key: String,
  val id: String,
  val uri: String,
  val mediaType: String?
)

internal class NativePhotoGridAdapter(
  private val context: Context,
  private val onPress: (NativePhotoGridItem) -> Unit,
  private val onLongPress: (NativePhotoGridItem) -> Unit
) : ListAdapter<NativePhotoGridItem, NativePhotoGridAdapter.ItemViewHolder>(DiffCallback) {
  private val selectedIds = mutableSetOf<String>()
  private var selectionMode = false
  private var itemSizePx: Int = 0
  private val idToPosition = mutableMapOf<String, Int>()

  init {
    setHasStableIds(true)
  }

  override fun getItemId(position: Int): Long {
    return getItem(position).key.hashCode().toLong()
  }

  fun setItems(next: List<NativePhotoGridItem>) {
    submitList(next.toList()) {
      rebuildIndexMap()
    }
  }

  fun setSelectionMode(enabled: Boolean) {
    if (selectionMode == enabled) return
    selectionMode = enabled
    if (itemCount > 0) {
      notifyItemRangeChanged(0, itemCount, PAYLOAD_SELECTION)
    }
  }

  fun setSelectedIds(ids: Collection<String>) {
    val next = ids.toSet()
    if (selectedIds.size == next.size && selectedIds.containsAll(next)) return

    val changedIds = mutableSetOf<String>()
    changedIds.addAll(selectedIds)
    changedIds.addAll(next)

    selectedIds.clear()
    selectedIds.addAll(next)

    changedIds.forEach { id ->
      val index = idToPosition[id] ?: return@forEach
      if (index in 0 until itemCount) {
        notifyItemChanged(index, PAYLOAD_SELECTION)
      }
    }
  }

  fun setItemSize(sizePx: Int) {
    if (sizePx <= 0 || itemSizePx == sizePx) return
    itemSizePx = sizePx
    if (itemCount > 0) {
      notifyItemRangeChanged(0, itemCount, PAYLOAD_SIZE)
    }
  }

  override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ItemViewHolder {
    val root = FrameLayout(context)
    root.layoutParams = RecyclerView.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT
    )

    val image = ImageView(context).apply {
      scaleType = ImageView.ScaleType.CENTER_CROP
      adjustViewBounds = false
    }

    val overlay = View(context).apply {
      visibility = View.GONE
      setBackgroundColor(0x5534D399)
    }

    root.addView(
      image,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
        Gravity.CENTER
      )
    )
    root.addView(
      overlay,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
        Gravity.CENTER
      )
    )

    return ItemViewHolder(
      view = root,
      imageView = image,
      selectionOverlay = overlay,
      onPress = onPress,
      onLongPress = onLongPress
    )
  }

  override fun onBindViewHolder(holder: ItemViewHolder, position: Int) {
    bindFull(holder, getItem(position))
  }

  override fun onBindViewHolder(holder: ItemViewHolder, position: Int, payloads: MutableList<Any>) {
    if (payloads.isEmpty()) {
      bindFull(holder, getItem(position))
      return
    }

    val item = getItem(position)
    holder.boundItem = item
    val mergedPayloads = payloads.toSet()

    if (!mergedPayloads.any { it == PAYLOAD_SIZE || it == PAYLOAD_SELECTION || it == PAYLOAD_MEDIA }) {
      bindFull(holder, item)
      return
    }

    if (PAYLOAD_SIZE in mergedPayloads) {
      applyCellSize(holder)
    }
    if (PAYLOAD_MEDIA in mergedPayloads) {
      applyImage(holder, item)
    }
    if (PAYLOAD_SELECTION in mergedPayloads) {
      applySelectionState(holder, item)
    }
  }

  override fun onViewRecycled(holder: ItemViewHolder) {
    holder.imageView.dispose()
    holder.boundItem = null
    super.onViewRecycled(holder)
  }

  override fun onCurrentListChanged(
    previousList: List<NativePhotoGridItem>,
    currentList: List<NativePhotoGridItem>
  ) {
    super.onCurrentListChanged(previousList, currentList)
    rebuildIndexMap()
  }

  private fun bindFull(holder: ItemViewHolder, item: NativePhotoGridItem) {
    holder.boundItem = item
    applyCellSize(holder)
    applyImage(holder, item)
    applySelectionState(holder, item)
  }

  private fun applyImage(holder: ItemViewHolder, item: NativePhotoGridItem) {
    val targetSize = if (itemSizePx > 0) itemSizePx else (holder.itemView.resources.displayMetrics.widthPixels / 4)
    holder.imageView.load(item.uri) {
      crossfade(false)
      allowHardware(true)
      size(targetSize, targetSize)
      precision(Precision.INEXACT)
      memoryCachePolicy(coil.request.CachePolicy.ENABLED)
      diskCachePolicy(coil.request.CachePolicy.ENABLED)
    }
  }

  private fun applyCellSize(holder: ItemViewHolder) {
    val cellSize = if (itemSizePx > 0) itemSizePx else (holder.itemView.resources.displayMetrics.widthPixels / 4)
    val params = holder.itemView.layoutParams as? RecyclerView.LayoutParams
      ?: RecyclerView.LayoutParams(cellSize, cellSize)
    if (params.width != cellSize || params.height != cellSize) {
      params.width = cellSize
      params.height = cellSize
      holder.itemView.layoutParams = params
    }
  }

  private fun applySelectionState(holder: ItemViewHolder, item: NativePhotoGridItem) {
    if (selectionMode && selectedIds.contains(item.key)) {
      holder.selectionOverlay.visibility = View.VISIBLE
      holder.itemView.alpha = 0.92f
    } else {
      holder.selectionOverlay.visibility = View.GONE
      holder.itemView.alpha = 1f
    }
  }

  private fun rebuildIndexMap() {
    idToPosition.clear()
    currentList.forEachIndexed { index, item ->
      idToPosition[item.key] = index
    }
  }

  internal class ItemViewHolder(
    view: View,
    val imageView: ImageView,
    val selectionOverlay: View,
    private val onPress: (NativePhotoGridItem) -> Unit,
    private val onLongPress: (NativePhotoGridItem) -> Unit
  ) : RecyclerView.ViewHolder(view) {
    var boundItem: NativePhotoGridItem? = null

    init {
      itemView.setOnClickListener {
        val item = boundItem ?: return@setOnClickListener
        onPress(item)
      }
      itemView.setOnLongClickListener {
        val item = boundItem ?: return@setOnLongClickListener true
        onLongPress(item)
        true
      }
    }
  }

  private companion object {
    const val PAYLOAD_SELECTION = "payload_selection"
    const val PAYLOAD_SIZE = "payload_size"
    const val PAYLOAD_MEDIA = "payload_media"

    val DiffCallback = object : DiffUtil.ItemCallback<NativePhotoGridItem>() {
      override fun areItemsTheSame(oldItem: NativePhotoGridItem, newItem: NativePhotoGridItem): Boolean {
        return oldItem.key == newItem.key
      }

      override fun areContentsTheSame(oldItem: NativePhotoGridItem, newItem: NativePhotoGridItem): Boolean {
        return oldItem == newItem
      }

      override fun getChangePayload(oldItem: NativePhotoGridItem, newItem: NativePhotoGridItem): Any? {
        return if (oldItem.uri != newItem.uri || oldItem.mediaType != newItem.mediaType) {
          PAYLOAD_MEDIA
        } else {
          null
        }
      }
    }
  }
}
