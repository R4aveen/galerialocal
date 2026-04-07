package expo.modules.galeriamedia

import android.content.Context
import android.os.StatFs
import java.io.File

internal object CacheMaintenance {
  data class StorageStats(
    val totalBytes: Long,
    val freeBytes: Long,
    val cacheBytes: Long,
    val appBytes: Long
  )

  data class TrimResult(
    val freedBytes: Long,
    val cacheBytesAfter: Long
  )

  fun getStorageStats(context: Context): StorageStats {
    val dataStat = StatFs(context.filesDir.absolutePath)
    val totalBytes = dataStat.totalBytes
    val freeBytes = dataStat.availableBytes

    val cacheDirs = listOfNotNull(context.cacheDir, context.externalCacheDir)
    val cacheBytes = cacheDirs.sumOf { getDirectorySize(it) }

    val appRoots = listOfNotNull(
      context.filesDir,
      context.noBackupFilesDir,
      context.cacheDir,
      context.codeCacheDir,
      context.externalCacheDir
    )
    val appBytes = appRoots.sumOf { getDirectorySize(it) }

    return StorageStats(
      totalBytes = totalBytes,
      freeBytes = freeBytes,
      cacheBytes = cacheBytes,
      appBytes = appBytes
    )
  }

  fun trimCache(context: Context, maxBytes: Long, maxAgeMs: Long): TrimResult {
    val cacheDirs = listOfNotNull(context.cacheDir, context.externalCacheDir)
    var freedBytes = 0L

    cacheDirs.forEach { dir ->
      if (!dir.exists() || !dir.isDirectory) return@forEach
      freedBytes += deleteOldFiles(dir, maxAgeMs)
      freedBytes += pruneToMaxSize(dir, maxBytes)
    }

    val cacheBytesAfter = cacheDirs.sumOf { getDirectorySize(it) }
    return TrimResult(freedBytes = freedBytes, cacheBytesAfter = cacheBytesAfter)
  }

  fun clearCache(context: Context): TrimResult {
    val cacheDirs = listOfNotNull(context.cacheDir, context.externalCacheDir)
    var freedBytes = 0L

    cacheDirs.forEach { dir ->
      if (!dir.exists() || !dir.isDirectory) return@forEach
      dir.listFiles()?.forEach { child ->
        freedBytes += deleteRecursively(child)
      }
    }

    val cacheBytesAfter = cacheDirs.sumOf { getDirectorySize(it) }
    return TrimResult(freedBytes = freedBytes, cacheBytesAfter = cacheBytesAfter)
  }

  private fun getDirectorySize(file: File?): Long {
    if (file == null || !file.exists()) return 0L
    if (file.isFile) return file.length().coerceAtLeast(0L)

    val children = file.listFiles() ?: return 0L
    var total = 0L
    children.forEach { child ->
      total += getDirectorySize(child)
    }
    return total
  }

  private fun deleteOldFiles(root: File, maxAgeMs: Long): Long {
    if (maxAgeMs <= 0L) return 0L
    val cutoff = System.currentTimeMillis() - maxAgeMs
    var freed = 0L

    root.walkTopDown().forEach { file ->
      if (!file.exists() || !file.isFile) return@forEach
      if (file.lastModified() > cutoff) return@forEach
      val size = file.length().coerceAtLeast(0L)
      if (file.delete()) {
        freed += size
      }
    }

    return freed
  }

  private fun pruneToMaxSize(root: File, maxBytes: Long): Long {
    if (maxBytes <= 0L) return 0L
    var currentSize = getDirectorySize(root)
    if (currentSize <= maxBytes) return 0L

    val files = root.walkTopDown()
      .filter { it.exists() && it.isFile }
      .sortedBy { it.lastModified() }
      .toList()

    var freed = 0L
    for (file in files) {
      if (currentSize <= maxBytes) break
      val size = file.length().coerceAtLeast(0L)
      if (file.delete()) {
        freed += size
        currentSize -= size
      }
    }

    return freed
  }

  private fun deleteRecursively(file: File): Long {
    if (!file.exists()) return 0L
    if (file.isFile) {
      val size = file.length().coerceAtLeast(0L)
      return if (file.delete()) size else 0L
    }

    var freed = 0L
    val children = file.listFiles() ?: emptyArray()
    children.forEach { child ->
      freed += deleteRecursively(child)
    }
    if (file.exists()) {
      file.delete()
    }
    return freed
  }
}
