import { useEffect, useMemo, useState } from 'react';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import GaleriaMedia from '../../modules/galeria-media';

interface StorageStats {
  loading: boolean;
  totalBytes: number;
  freeBytes: number;
  mediaBytes: number;
  appBytes: number;
  cacheBytes: number;
  trimCache: (maxBytes?: number, maxAgeMs?: number) => Promise<number>;
  clearCache: () => Promise<number>;
}

const MEDIA_PAGE_SIZE = 500;
const MEDIA_HARD_LIMIT = 80000;

async function getDirectorySize(path: string, visited: Set<string>): Promise<number> {
  if (!path || visited.has(path)) return 0;
  visited.add(path);

  try {
    const info = await FileSystemLegacy.getInfoAsync(path);
    if (!info.exists) return 0;

    if (!(info as any).isDirectory) {
      return typeof info.size === 'number' ? info.size : 0;
    }

    const entries = await FileSystemLegacy.readDirectoryAsync(path);
    let total = 0;

    for (const name of entries) {
      const child = path.endsWith('/') ? `${path}${name}` : `${path}/${name}`;
      total += await getDirectorySize(child, visited);
    }

    return total;
  } catch {
    return 0;
  }
}

async function getAppStorageBytes(): Promise<number> {
  const visited = new Set<string>();
  const dirs = [FileSystemLegacy.documentDirectory, FileSystemLegacy.cacheDirectory].filter(
    (v): v is string => Boolean(v)
  );

  let total = 0;
  for (const dir of dirs) {
    total += await getDirectorySize(dir, visited);
  }

  return total;
}

async function getMediaStorageBytes(): Promise<number> {
  let after: string | undefined;
  let hasNextPage = true;
  let scanned = 0;
  let total = 0;
  let hasAnySize = false;
  const sampleWithoutSize: MediaLibrary.Asset[] = [];

  while (hasNextPage && scanned < MEDIA_HARD_LIMIT) {
    const page = await MediaLibrary.getAssetsAsync({
      first: MEDIA_PAGE_SIZE,
      after,
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });

    for (const asset of page.assets) {
      const size = Number((asset as any).fileSize || 0);
      if (size > 0) {
        total += size;
        hasAnySize = true;
      } else if (sampleWithoutSize.length < 120) {
        sampleWithoutSize.push(asset);
      }
    }

    scanned += page.assets.length;
    hasNextPage = page.hasNextPage;
    after = page.endCursor;

    if (page.assets.length === 0) {
      break;
    }
  }

  if (hasAnySize || sampleWithoutSize.length === 0) {
    return total;
  }

  for (const asset of sampleWithoutSize) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset.id);
      const uri = info.localUri || info.uri;
      if (!uri) continue;
      const file = await FileSystemLegacy.getInfoAsync(uri);
      if (file.exists && typeof file.size === 'number' && file.size > 0) {
        total += file.size;
      }
    } catch {
      // Ignore sample lookup failures.
    }
  }

  return total;
}

export function useStorageStats() {
  const [stats, setStats] = useState<StorageStats>({
    loading: true,
    totalBytes: 0,
    freeBytes: 0,
    mediaBytes: 0,
    appBytes: 0,
    cacheBytes: 0,
    trimCache: async () => 0,
    clearCache: async () => 0,
  });

  const refreshStats = async () => {
    const [nativeStats, mediaBytes] = await Promise.all([
      GaleriaMedia.getAppStorageStatsAsync().catch(() => ({ totalBytes: 0, freeBytes: 0, cacheBytes: 0, appBytes: 0 })),
      getMediaStorageBytes().catch(() => 0),
    ]);

    setStats((prev) => ({
      ...prev,
      loading: false,
      totalBytes: Number(nativeStats.totalBytes || 0),
      freeBytes: Number(nativeStats.freeBytes || 0),
      mediaBytes: Number(mediaBytes || 0),
      appBytes: Number(nativeStats.appBytes || 0),
      cacheBytes: Number(nativeStats.cacheBytes || 0),
    }));
  };

  const trimCache = async (maxBytes = 220 * 1024 * 1024, maxAgeMs = 72 * 60 * 60 * 1000) => {
    const result = await GaleriaMedia.trimAppCacheAsync({ maxBytes, maxAgeMs }).catch(() => ({ freedBytes: 0 }));
    await refreshStats();
    return Number((result as any).freedBytes || 0);
  };

  const clearCache = async () => {
    const result = await GaleriaMedia.clearAppCacheAsync().catch(() => ({ freedBytes: 0 }));
    await refreshStats();
    return Number((result as any).freedBytes || 0);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setStats((prev) => ({ ...prev, loading: true }));

      try {
        const [nativeStats, mediaBytes] = await Promise.all([
          GaleriaMedia.getAppStorageStatsAsync().catch(() => ({ totalBytes: 0, freeBytes: 0, cacheBytes: 0, appBytes: 0 })),
          getMediaStorageBytes().catch(() => 0),
        ]);

        if (cancelled) return;

        setStats({
          loading: false,
          totalBytes: Number((nativeStats as any).totalBytes || 0),
          freeBytes: Number((nativeStats as any).freeBytes || 0),
          mediaBytes: Number(mediaBytes || 0),
          appBytes: Number((nativeStats as any).appBytes || 0),
          cacheBytes: Number((nativeStats as any).cacheBytes || 0),
          trimCache,
          clearCache,
        });
      } catch {
        if (!cancelled) {
          setStats((prev) => ({ ...prev, loading: false }));
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => ({ ...stats, trimCache, clearCache }), [stats]);
}

export default useStorageStats;
