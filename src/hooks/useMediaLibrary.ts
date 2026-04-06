import * as MediaLibrary from 'expo-media-library';
import GaleriaMedia from '../../modules/galeria-media';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getSafeAssetTimestamp, hydrateTimestampCache, sortAssetsByTimestamp } from '../utils/mediaDate';

export type MediaFilter = 'all' | 'photo' | 'video' | 'screenshot';
export type DateFilter = 'all' | 'month' | 'year';
export type SortOrder = 'newest' | 'oldest';

interface UseMediaLibraryOptions {
  mediaFilter: MediaFilter;
  dateFilter: DateFilter;
  sortOrder: SortOrder;
  excludeIds?: string[];
}

interface MediaQueryCacheEntry {
  assets: MediaLibrary.Asset[];
  hasNextPage: boolean;
  endCursor?: string;
  updatedAt: number;
}

const isScreenshot = (asset: MediaLibrary.Asset) => {
  const name = (asset.filename || '').toLowerCase();
  return name.includes('screenshot') || name.includes('captura');
};

// Configuración de paginación optimizada
const INITIAL_LOAD = 80;
const PAGE_SIZE = 400;

const getMediaTypesForQuery = (mediaFilter: MediaFilter): MediaLibrary.MediaTypeValue[] => {
  if (mediaFilter === 'video') return [MediaLibrary.MediaType.video];
  if (mediaFilter === 'photo' || mediaFilter === 'screenshot') return [MediaLibrary.MediaType.photo];
  return [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video];
};

const CACHE_TTL_MS = 90_000;
const MAX_CACHE_ENTRIES = 12;
const PREFETCH_TARGET_ALL = 800;
const PREFETCH_TARGET_FILTERED = 400;
const mediaQueryCache = new Map<string, MediaQueryCacheEntry>();

const buildCacheKey = (mediaFilter: MediaFilter, sortOrder: SortOrder) => `${mediaFilter}::${sortOrder}`;

const updateCacheEntry = (key: string, entry: MediaQueryCacheEntry) => {
  mediaQueryCache.delete(key);
  mediaQueryCache.set(key, entry);

  while (mediaQueryCache.size > MAX_CACHE_ENTRIES) {
    const oldest = mediaQueryCache.keys().next().value;
    if (!oldest) break;
    mediaQueryCache.delete(oldest);
  }
};

const readCacheEntry = (key: string) => {
  const entry = mediaQueryCache.get(key);
  if (!entry) return null;

  mediaQueryCache.delete(key);
  mediaQueryCache.set(key, entry);
  return entry;
};

// Reemplazamos sortByCreationTime local por sortAssetsByTimestamp exportado desde mediaDate
// para usar el mismo parser unificado (evitando saltos post-carga).
// Constante que reemplaza su uso local:
const sortByCreationTime = sortAssetsByTimestamp;

export function useMediaLibrary(isGranted: boolean, options: UseMediaLibraryOptions) {
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const loadingRef = useRef(false);
  const assetsRef = useRef<MediaLibrary.Asset[]>([]);
  const queryVersionRef = useRef(0);
  const cacheKey = useMemo(
    () => buildCacheKey(options.mediaFilter, options.sortOrder),
    [options.mediaFilter, options.sortOrder]
  );

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  const loadAssets = useCallback(async (after?: string, reset = false) => {
    if (!isGranted || loadingRef.current || (!after && !reset && assetsRef.current.length > 0)) {
      return;
    }

    const requestVersion = queryVersionRef.current;
    loadingRef.current = true;
    setLoading(true);
    try {
      // ✅ [Nativo Local]: Para cuando se compile el bridge de Android, 
      // reemplazamos el fetch de expo-media-library con esto:
      /*
      if (!after) {
        const groupedData = await GaleriaMedia.getGroupedAssetsAsync('all');
        console.log("Assets Agrupados desde Kotlin:", groupedData.length);
      }
      */

      const { assets: nextAssets, hasNextPage: next, endCursor: cursor } = await MediaLibrary.getAssetsAsync({
        mediaType: getMediaTypesForQuery(options.mediaFilter),
        sortBy: [[MediaLibrary.SortBy.creationTime, options.sortOrder === 'oldest']],
        first: after ? PAGE_SIZE : INITIAL_LOAD,
        after,
      });

      if (requestVersion !== queryVersionRef.current) {
        return;
      }

      // Prevenimos repetidos deduplicando mediante Map por asset.id.
      // (Esto neutraliza el bug nativo de Android donde devuelve fotos duplicadas en saltos de paginación)
      const mergedBaseRaw = after ? [...assetsRef.current, ...nextAssets] : nextAssets;
      const mergedBase = Array.from(new Map(mergedBaseRaw.map(item => [item.id, item])).values());

      // Show assets IMMEDIATELY without sorting (already ordered by MediaLibrary):
      setAssets((prev) => {
        const merged = after ? [...prev, ...nextAssets] : nextAssets;
        const uniqueAssets = Array.from(new Map(merged.map(item => [item.id, item])).values());
        const ordered = sortByCreationTime(uniqueAssets, options.sortOrder);
        assetsRef.current = ordered;
        updateCacheEntry(cacheKey, {
          assets: ordered,
          hasNextPage: next,
          endCursor: cursor,
          updatedAt: Date.now(),
        });
        return ordered;
      });
      setHasNextPage(next);
      setEndCursor(cursor);

      // Load timestamp cache in background (non-blocking):
      void hydrateTimestampCache(mergedBase).then(() => {
        // After timestamp cache is populated, trigger re-sort if needed:
        if (requestVersion === queryVersionRef.current && options.sortOrder !== 'newest') {
          setAssets((prev) => {
            const resorted = sortAssetsByTimestamp(prev, options.sortOrder);
            assetsRef.current = resorted;
            updateCacheEntry(cacheKey, {
              assets: resorted,
              hasNextPage: next,
              endCursor: cursor,
              updatedAt: Date.now(),
            });
            return resorted;
          });
        }
      });
    } catch (error) {
      console.error('Error loading assets:', error);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cacheKey, isGranted, options.mediaFilter, options.sortOrder]);

  useEffect(() => {
    if (!isGranted) return;

    // Escuchar eventos dinámicos del sistema (ej: cuando se restaura o elimina una foto externamente)
    const subscription = MediaLibrary.addListener(() => {
      // Limpiar caché forzosamente para que la vista recargue fresca
      mediaQueryCache.clear();
      queryVersionRef.current += 1;
      loadAssets(undefined, true);
    });

    const cached = readCacheEntry(cacheKey);
    const isFresh = cached ? Date.now() - cached.updatedAt <= CACHE_TTL_MS : false;

    queryVersionRef.current += 1;
    const requestVersion = queryVersionRef.current;
    
    // Show cached assets IMMEDIATELY without sorting:
    if (cached) {
      const orderedCached = sortByCreationTime(cached.assets, options.sortOrder);
      assetsRef.current = orderedCached;
      loadingRef.current = false;
      setAssets(orderedCached);
      setHasNextPage(cached.hasNextPage);
      setEndCursor(cached.endCursor);

      // Hydrate timestamps in background:
      void hydrateTimestampCache(orderedCached).then(() => {
        if (requestVersion === queryVersionRef.current && options.sortOrder !== 'newest') {
          const resorted = sortAssetsByTimestamp(orderedCached, options.sortOrder);
          assetsRef.current = resorted;
          setAssets(resorted);
          updateCacheEntry(cacheKey, {
            assets: resorted,
            hasNextPage: cached.hasNextPage,
            endCursor: cached.endCursor,
            updatedAt: cached.updatedAt,
          });
        }
      });
    }

    if (!cached || !isFresh) {
      loadAssets(undefined, true);
    }

    return () => {
      subscription.remove();
    };
  }, [isGranted, cacheKey, options.dateFilter, options.sortOrder, loadAssets]);

  const filteredAssets = useMemo(() => {
    const now = Date.now();
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
    const yearAgo = now - 365 * 24 * 60 * 60 * 1000;
    const excludeSet = new Set(options.excludeIds || []);

    if (options.mediaFilter === 'all' && options.dateFilter === 'all' && excludeSet.size === 0) {
      return assets;
    }

    return assets.filter((asset) => {
      // Exclude items that are in trash
      if (excludeSet.has(asset.id)) return false;

      if (options.mediaFilter === 'photo' && asset.mediaType !== 'photo') return false;
      if (options.mediaFilter === 'video' && asset.mediaType !== 'video') return false;
      if (options.mediaFilter === 'screenshot' && !isScreenshot(asset)) return false;

      const createdAt = getSafeAssetTimestamp(asset);
      if (options.dateFilter === 'month' && createdAt < monthAgo) return false;
      if (options.dateFilter === 'year' && createdAt < yearAgo) return false;

      return true;
    });
  }, [assets, options.dateFilter, options.mediaFilter, options.excludeIds]);

  useEffect(() => {
    if (!isGranted || loadingRef.current) return;
    if (!hasNextPage || !endCursor) return;
    if (assets.length === 0) return;

    // Keep an ahead-of-scroll buffer so fast flings don't hit empty space while waiting for IO.
    const prefetchTarget = options.mediaFilter === 'all' && options.dateFilter === 'all'
      ? PREFETCH_TARGET_ALL
      : PREFETCH_TARGET_FILTERED;
    if (assets.length < prefetchTarget) {
      loadAssets(endCursor);
      return;
    }

    // If active filters leave too few visible items, keep paginating until we have enough
    // content to render or until there are no more pages.
    const minimumVisible = options.mediaFilter === 'all' && options.dateFilter === 'all' ? 24 : 10;
    if (filteredAssets.length < minimumVisible) {
      loadAssets(endCursor);
    }
  }, [
    isGranted,
    hasNextPage,
    endCursor,
    assets.length,
    filteredAssets.length,
    options.mediaFilter,
    options.dateFilter,
    loadAssets,
  ]);

  const loadMore = () => {
    if (hasNextPage && endCursor) {
      loadAssets(endCursor);
    }
  };

  return { assets: filteredAssets, loading, loadMore };
}
