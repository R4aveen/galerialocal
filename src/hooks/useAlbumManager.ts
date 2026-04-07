import { useCallback, useEffect, useState } from 'react';
import * as MediaLibrary from 'expo-media-library';
import { deleteAssetsBatch } from '../utils/nativeMediaOps';

interface MoveResult {
  moved: number;
  failed: number;
  movedIds: string[];
}

type ProgressCallback = (processed: number, total: number) => void;

const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function useAlbumManager(isGranted: boolean) {
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshAlbums = useCallback(async () => {
    if (!isGranted) return;

    setLoading(true);
    try {
      const allAlbums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: false });
      setAlbums(allAlbums);
    } catch (error) {
      console.error('Error loading albums for manager:', error);
    } finally {
      setLoading(false);
    }
  }, [isGranted]);

  useEffect(() => {
    refreshAlbums();
  }, [refreshAlbums]);

  const moveAssetToAlbumSafe = useCallback(
    async (asset: MediaLibrary.Asset, targetAlbumId: string, copy: boolean) => {
      const assetId = asset.id;
      let localUri: string | undefined;

      try {
        const info = await MediaLibrary.getAssetInfoAsync(assetId);
        localUri = info.localUri ?? info.uri ?? undefined;
      } catch {
        return false;
      }

      try {
        const ok = await MediaLibrary.addAssetsToAlbumAsync([asset], targetAlbumId, copy);
        if (ok) return true;
      } catch {
        // Continue with next fallback.
      }

      try {
        const okById = await MediaLibrary.addAssetsToAlbumAsync([assetId], targetAlbumId, copy);
        if (okById) return true;
      } catch {
        // Continue with file-based fallback.
      }

      if (!localUri) return false;

      try {
        await MediaLibrary.createAssetAsync(localUri, targetAlbumId);
        if (!copy) {
          try {
            await deleteAssetsBatch([assetId]);
          } catch {
            // Ignore delete failure after successful copy to target.
          }
        }
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const moveAssetsToAlbum = useCallback(
    async (
      assets: MediaLibrary.Asset[],
      targetAlbumId: string,
      mode: 'move' | 'copy' = 'move',
      onProgress?: ProgressCallback
    ): Promise<MoveResult> => {
      if (assets.length === 0) return { moved: 0, failed: 0, movedIds: [] };

      try {
        const ids = assets.map((asset) => asset.id);
        const copy = mode === 'copy';

        // Bulk-first path: best UX on Android (typically one confirmation for many items).
        try {
          const bulkOk = await MediaLibrary.addAssetsToAlbumAsync(ids, targetAlbumId, copy);
          if (bulkOk) {
            onProgress?.(ids.length, ids.length);
            return { moved: ids.length, failed: 0, movedIds: ids };
          }
        } catch {
          // Fall through to resilient per-item fallback.
        }

        // Batch fallback for move mode: copy all first, then perform a single delete batch.
        if (!copy) {
          try {
            const copiedAll = await MediaLibrary.addAssetsToAlbumAsync(ids, targetAlbumId, true);
            if (copiedAll) {
              const deletedAll = await deleteAssetsBatch(ids);
              const moved = deletedAll ? ids.length : 0;
              const failed = deletedAll ? 0 : ids.length;
              onProgress?.(ids.length, ids.length);
              return { moved, failed, movedIds: deletedAll ? ids : [] };
            }
          } catch {
            // Fall through to per-item fallback.
          }
        }

        let moved = 0;
        let failed = 0;
        const movedIds: string[] = [];

        for (const asset of assets) {
          const ok = await moveAssetToAlbumSafe(asset, targetAlbumId, copy);
          if (ok) {
            moved += 1;
            movedIds.push(asset.id);
          } else {
            failed += 1;
          }
          onProgress?.(moved + failed, assets.length);
          if ((moved + failed) % 6 === 0) {
            await yieldToUI();
          }
        }

        return { moved, failed, movedIds };
      } catch (error) {
        console.error('Error moving assets to album:', error);
        return { moved: 0, failed: assets.length, movedIds: [] };
      }
    },
    [moveAssetToAlbumSafe]
  );

  const createAlbumFromAssets = useCallback(
    async (
      name: string,
      assets: MediaLibrary.Asset[],
      mode: 'move' | 'copy' = 'move',
      onProgress?: ProgressCallback
    ) => {
      const cleanName = name.trim();
      if (!cleanName || assets.length === 0) {
        return { ok: false, reason: 'invalid-input' as const, albumId: '' };
      }

      try {
        const existing = await MediaLibrary.getAlbumAsync(cleanName);
        if (existing) {
          const result = await moveAssetsToAlbum(assets, existing.id, mode, onProgress);
          await refreshAlbums();
          return {
            ok: result.failed === 0,
            reason: result.failed === 0 ? ('ok' as const) : ('partial' as const),
            albumId: existing.id,
          };
        }

        const first = assets[0];
        const copy = mode === 'copy';
        const created = await MediaLibrary.createAlbumAsync(cleanName, first, copy);

        if (assets.length > 1) {
          if (onProgress) {
            onProgress(1, assets.length);
          }

          const restResult = await moveAssetsToAlbum(
            assets.slice(1),
            created.id,
            mode,
            (processed, total) => onProgress?.(processed + 1, total + 1)
          );
          if (restResult.failed > 0) {
            await refreshAlbums();
            return { ok: false, reason: 'partial' as const, albumId: created.id };
          }
        } else {
          onProgress?.(1, 1);
        }

        await refreshAlbums();
        return { ok: true, reason: 'ok' as const, albumId: created.id };
      } catch (error) {
        console.error('Error creating album from assets:', error);
        return { ok: false, reason: 'error' as const, albumId: '' };
      }
    },
    [moveAssetsToAlbum, refreshAlbums]
  );

  return {
    albums,
    loading,
    refreshAlbums,
    moveAssetsToAlbum,
    createAlbumFromAssets,
  };
}
