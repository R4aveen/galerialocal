import { useCallback, useEffect, useRef, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import {
  copyFileNative,
  copyFilesAndDeleteNative,
  copyFilesNative,
  deleteAssetsBatch,
  restoreFilesNative,
  type NativeCopyAndDeleteRequest,
  type NativeCopyAndDeleteResult,
  type NativeCopyRequest,
  type NativeCopyResult,
  type NativeRestoreRequest,
  type NativeRestoreResult,
} from '../utils/nativeMediaOps';
import { dedupeAssetsById } from '../utils/mediaAssets';
import { bumpMediaRefresh } from '../store/useMediaRefreshStore';

export type PrivateItemStatus = 'active' | 'archived' | 'trash';

export interface PrivateItem {
  id: string;
  filename: string;
  uri: string;
  originalPath: string;
  hiddenAt: number;
  status?: PrivateItemStatus;
  archivedAt?: number | null;
  trashedAt?: number | null;
}

interface HideManyResult {
  hidden: number;
  failed: number;
  movedIds: string[];
}

interface PrivateBatchResult {
  processed: number;
  failed: number;
}

type ProgressCallback = (processed: number, total: number) => void;

const PRIVATE_ALBUM_NAME = 'GaleriaLocal Privadas';
const VAULT_BASE = FileSystem.documentDirectory || FileSystem.cacheDirectory;
const VAULT_DIR = `${VAULT_BASE}.secure_private/`;
const VAULT_INDEX = `${VAULT_DIR}index.json`;
const NO_MEDIA = `${VAULT_DIR}.nomedia`;

const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const toMs = (unixTimestamp: number) =>
  unixTimestamp > 1_000_000_000_000 ? unixTimestamp : unixTimestamp * 1000;

const normalizePrivateItem = (item: PrivateItem): PrivateItem => ({
  ...item,
  status: item.status ?? 'active',
  archivedAt: item.archivedAt ?? null,
  trashedAt: item.trashedAt ?? null,
});

const sortPrivateItems = (entries: PrivateItem[]) =>
  [...entries].sort((a, b) => {
    const scoreA = a.status === 'trash' ? (a.trashedAt ?? a.hiddenAt) : a.status === 'archived' ? (a.archivedAt ?? a.hiddenAt) : a.hiddenAt;
    const scoreB = b.status === 'trash' ? (b.trashedAt ?? b.hiddenAt) : b.status === 'archived' ? (b.archivedAt ?? b.hiddenAt) : b.hiddenAt;
    return scoreB - scoreA;
  });

const safeParseArray = (value: string): PrivateItem[] => {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as PrivateItem[]).map(normalizePrivateItem) : [];
  } catch {
    return [];
  }
};

const randomId = () => `pv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const fileExt = (name: string) => {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot) : '';
};

export function usePrivateVault() {
  const [items, setItems] = useState<PrivateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const migratedRef = useRef(false);
  const validatingRef = useRef(false);

  const ensureVault = useCallback(async () => {
    const dirInfo = await FileSystem.getInfoAsync(VAULT_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(VAULT_DIR, { intermediates: true });
    }

    const noMediaInfo = await FileSystem.getInfoAsync(NO_MEDIA);
    if (!noMediaInfo.exists) {
      await FileSystem.writeAsStringAsync(NO_MEDIA, '');
    }

    const indexInfo = await FileSystem.getInfoAsync(VAULT_INDEX);
    if (!indexInfo.exists) {
      await FileSystem.writeAsStringAsync(VAULT_INDEX, '[]');
    }
  }, []);

  const readIndex = useCallback(async (): Promise<PrivateItem[]> => {
    await ensureVault();
    const raw = await FileSystem.readAsStringAsync(VAULT_INDEX);
    return safeParseArray(raw);
  }, [ensureVault]);

  const writeIndex = useCallback(async (next: PrivateItem[]) => {
    await ensureVault();
    await FileSystem.writeAsStringAsync(VAULT_INDEX, JSON.stringify(next));
  }, [ensureVault]);

  const getPrivateAlbum = useCallback(async () => MediaLibrary.getAlbumAsync(PRIVATE_ALBUM_NAME), []);

  const getAlbumAssets = useCallback(async (album: MediaLibrary.Album): Promise<MediaLibrary.Asset[]> => {
    const allAssets: MediaLibrary.Asset[] = [];
    let after: string | undefined;
    let hasNextPage = true;

    while (hasNextPage) {
      const page = await MediaLibrary.getAssetsAsync({
        album: album.id,
        mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
        first: 200,
        after,
      });
      allAssets.push(...page.assets);
      hasNextPage = page.hasNextPage;
      after = page.endCursor;
    }

    return dedupeAssetsById(allAssets);
  }, []);

  const migrateFromMediaAlbumIfNeeded = useCallback(async () => {
    const album = await getPrivateAlbum();
    if (!album) return;

    const albumAssets = await getAlbumAssets(album);
    if (albumAssets.length === 0) return;

    const existing = await readIndex();
    const next = [...existing];
    const prepared: Array<{ asset: MediaLibrary.Asset; source: string; dest: string; entry: PrivateItem }> = [];

    for (const asset of albumAssets) {
      try {
        let source = asset.uri;
        if (!source) {
          try {
            const info = await MediaLibrary.getAssetInfoAsync(asset.id);
            source = info.localUri || info.uri || '';
          } catch {
            source = '';
          }
        }
        if (!source) continue;

        const name = asset.filename || `${asset.id}${fileExt(source) || '.bin'}`;
        const localId = randomId();
        const dest = `${VAULT_DIR}${localId}${fileExt(name) || '.bin'}`;

        prepared.push({
          asset,
          source,
          dest,
          entry: {
            id: localId,
            filename: name,
            uri: dest,
            originalPath: source,
            hiddenAt: toMs(asset.creationTime || Date.now()),
            status: 'active',
            archivedAt: null,
            trashedAt: null,
          },
        });
      } catch (error) {
        console.error('Error migrating album private asset:', error);
      }
    }

    const nativeResults = await copyFilesNative(
      prepared.map((item) => ({ sourceUri: item.source, destinationPath: item.dest }))
    );
    const nativeCopiedDestinations = new Set(
      nativeResults.filter((result) => result.copied).map((result) => result.destinationPath)
    );

    const migratedAssetIds: string[] = [];

    for (const item of prepared) {
      try {
        if (!nativeCopiedDestinations.has(item.dest)) {
          const copiedNatively = await copyFileNative(item.source, item.dest);
          if (!copiedNatively) {
            throw new Error('Native copy failed during migration from legacy private album.');
          }
        }

        next.push(item.entry);
        migratedAssetIds.push(item.asset.id);
      } catch (error) {
        console.error('Error migrating album private asset:', item.asset.id, error);
      }
    }

    if (migratedAssetIds.length > 0) {
      try {
        await deleteAssetsBatch(migratedAssetIds);
      } catch {
        // Ignore delete failure in migration.
      }
    }

    await writeIndex(sortPrivateItems(next));
  }, [getAlbumAssets, getPrivateAlbum, readIndex, writeIndex]);

  const refreshPrivate = useCallback(async () => {
    setLoading(true);
    try {
      await ensureVault();
      if (!migratedRef.current) {
        await migrateFromMediaAlbumIfNeeded();
        migratedRef.current = true;
      }

      const indexed = await readIndex();
      setItems(sortPrivateItems(indexed));

      // Validate missing files in background so first render is not blocked.
      if (!validatingRef.current) {
        validatingRef.current = true;
        void (async () => {
          try {
            const valid: PrivateItem[] = [];
            for (const item of indexed) {
              const info = await FileSystem.getInfoAsync(item.uri);
              if (info.exists) {
                valid.push(item);
              }
            }

            if (valid.length !== indexed.length) {
              const sortedValid = sortPrivateItems(valid);
              await writeIndex(sortedValid);
              setItems(sortedValid);
            }
          } catch {
            // Ignore background validation errors.
          } finally {
            validatingRef.current = false;
          }
        })();
      }
    } catch (error) {
      console.error('Error loading private vault:', error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [ensureVault, migrateFromMediaAlbumIfNeeded, readIndex, writeIndex]);

  useEffect(() => {
    refreshPrivate();
  }, [refreshPrivate]);

  const hideManyInPrivate = useCallback(
    async (assets: MediaLibrary.Asset[], onProgress?: ProgressCallback): Promise<HideManyResult> => {
      if (assets.length === 0) return { hidden: 0, failed: 0, movedIds: [] };

      await ensureVault();
      const index = await readIndex();

      let failed = 0;
      const copied: Array<{ assetId: string; dest: string; entry: PrivateItem }> = [];
      const prepared: Array<{ asset: MediaLibrary.Asset; source: string; dest: string; entry: PrivateItem }> = [];

      for (const asset of assets) {
        try {
          let source = asset.uri;
          if (!source) {
            try {
              const info = await MediaLibrary.getAssetInfoAsync(asset.id);
              source = info?.localUri || info?.uri || '';
            } catch {
              source = '';
            }
          }
          if (!source) {
            failed += 1;
            onProgress?.(copied.length + failed, assets.length);
            continue;
          }

          const localId = randomId();
          const name = asset.filename || `${asset.id}${fileExt(source) || '.bin'}`;
          const dest = `${VAULT_DIR}${localId}${fileExt(name) || '.bin'}`;

          prepared.push({
            asset,
            source,
            dest,
            entry: {
              id: localId,
              filename: name,
              uri: dest,
              originalPath: source,
              hiddenAt: toMs(asset.creationTime || Date.now()),
              status: 'active',
              archivedAt: null,
              trashedAt: null,
            },
          });
        } catch (error) {
          console.error('Error copying asset into secure vault:', asset.id, error);
          failed += 1;
          onProgress?.(copied.length + failed, assets.length);
          if ((copied.length + failed) % 6 === 0) {
            await yieldToUI();
          }
        }
      }

      const nativeCompositeResults = await copyFilesAndDeleteNative(
        prepared.map((item) => ({
          assetId: item.asset.id,
          sourceUri: item.source,
          destinationPath: item.dest,
        }))
      );
      const nativeByAssetId = new Map(
        nativeCompositeResults.map((result) => [result.assetId, result])
      );
      const pendingDelete: Array<{ assetId: string; dest: string; entry: PrivateItem }> = [];

      for (const item of prepared) {
        try {
          const nativeResult = nativeByAssetId.get(item.asset.id);
          let copiedFile = nativeResult?.copied === true;

          if (!copiedFile) {
            const copiedNatively = await copyFileNative(item.source, item.dest);
            if (copiedNatively) {
              copiedFile = true;
            }
          }

          if (!copiedFile) {
            failed += 1;
            onProgress?.(copied.length + failed, assets.length);
            continue;
          }

          if (nativeResult?.deleted === true) {
            copied.push({
              assetId: item.asset.id,
              dest: item.dest,
              entry: item.entry,
            });
          } else {
            pendingDelete.push({
              assetId: item.asset.id,
              dest: item.dest,
              entry: item.entry,
            });
          }
        } catch (error) {
          console.error('Error copying asset into secure vault:', item.asset.id, error);
          failed += 1;
        }

        onProgress?.(copied.length + failed, assets.length);
        if ((copied.length + failed) % 6 === 0) {
          await yieldToUI();
        }
      }

      if (pendingDelete.length > 0) {
        const pendingIds = pendingDelete.map((item) => item.assetId);
        let bulkDeleted = false;

        try {
          bulkDeleted = await deleteAssetsBatch(pendingIds);
        } catch {
          bulkDeleted = false;
        }

        if (bulkDeleted) {
          for (const item of pendingDelete) {
            copied.push({
              assetId: item.assetId,
              dest: item.dest,
              entry: item.entry,
            });

            onProgress?.(copied.length + failed, assets.length);
            if ((copied.length + failed) % 6 === 0) {
              await yieldToUI();
            }
          }
        } else {
          // If batch delete fails, rollback copied files for these pending items.
          for (const item of pendingDelete) {
            failed += 1;
            try {
              await FileSystem.deleteAsync(item.dest, { idempotent: true });
            } catch {
              // Ignore rollback cleanup failure.
            }

            onProgress?.(copied.length + failed, assets.length);
            if ((copied.length + failed) % 6 === 0) {
              await yieldToUI();
            }
          }
        }
      }

      for (const item of copied) {
        index.push(item.entry);
      }

      await writeIndex(sortPrivateItems(index));
      await refreshPrivate();
      bumpMediaRefresh();
      return { hidden: copied.length, failed, movedIds: copied.map((item) => item.assetId) };
    },
    [ensureVault, readIndex, refreshPrivate, writeIndex]
  );

  const hideInPrivate = useCallback(
    async (asset: MediaLibrary.Asset) => {
      const result = await hideManyInPrivate([asset]);
      return result.hidden === 1;
    },
    [hideManyInPrivate]
  );

  const restoreManyFromPrivate = useCallback(
    async (
      privateItems: PrivateItem[],
      albumId?: string,
      onProgress?: ProgressCallback
    ): Promise<PrivateBatchResult> => {
      if (privateItems.length === 0) return { processed: 0, failed: 0 };

      const current = await readIndex();
      const byId = new Map(current.map((item) => [item.id, item]));

      let processed = 0;
      let failed = 0;
      const targetAlbumId = albumId;
      const restoredAssetIds: string[] = [];

      const eligibleForNative = privateItems
        .map((item) => byId.get(item.id))
        .filter((item): item is PrivateItem => Boolean(item && item.status !== 'trash' && item.uri));

      const nativeResults = await restoreFilesNative(
        eligibleForNative.map((item) => ({
          itemId: item.id,
          sourcePath: item.uri,
          filename: item.filename,
        }))
      );
      const nativeById = new Map(nativeResults.map((result) => [result.itemId, result]));

      for (const item of privateItems) {
        const existing = byId.get(item.id);
        if (!existing || existing.status === 'trash') {
          failed += 1;
          onProgress?.(processed + failed, privateItems.length);
          continue;
        }

        try {
          const nativeResult = nativeById.get(existing.id);
          const nativeRestored = nativeResult?.restored === true;
          const restoredAssetId = nativeResult?.assetId || null;

          if (!nativeRestored || !restoredAssetId) {
            failed += 1;
            onProgress?.(processed + failed, privateItems.length);
            if ((processed + failed) % 6 === 0) {
              await yieldToUI();
            }
            continue;
          }

          restoredAssetIds.push(restoredAssetId);

          try {
            await FileSystem.deleteAsync(existing.uri, { idempotent: true });
          } catch {
            // Keep successful restore even if cleanup fails.
          }
          byId.delete(existing.id);
          processed += 1;
          onProgress?.(processed + failed, privateItems.length);
          if ((processed + failed) % 6 === 0) {
            await yieldToUI();
          }
        } catch (error) {
          console.error('Error restoring private item:', item.id, error);
          failed += 1;
          onProgress?.(processed + failed, privateItems.length);
          if ((processed + failed) % 6 === 0) {
            await yieldToUI();
          }
        }
      }

      // Batch add to target album in one call to avoid per-item permission prompts/jank.
      if (targetAlbumId && restoredAssetIds.length > 0) {
        try {
          await MediaLibrary.addAssetsToAlbumAsync(restoredAssetIds as any, targetAlbumId, false);
        } catch {
          // Restored files are already in MediaStore; album grouping failure is non-fatal.
        }
      }

      await writeIndex(sortPrivateItems(Array.from(byId.values())));
      await refreshPrivate();
      if (processed > 0) {
        bumpMediaRefresh();
      }
      return { processed, failed };
    },
    [readIndex, refreshPrivate, writeIndex]
  );

  const restoreFromPrivate = useCallback(
    async (item: PrivateItem, albumId?: string) => {
      const result = await restoreManyFromPrivate([item], albumId);
      return result.processed === 1;
    },
    [restoreManyFromPrivate]
  );

  const deleteManyPrivate = useCallback(
    async (privateItems: PrivateItem[], onProgress?: ProgressCallback): Promise<PrivateBatchResult> => {
      if (privateItems.length === 0) return { processed: 0, failed: 0 };

      const current = await readIndex();
      const byId = new Map(current.map((item) => [item.id, item]));

      let processed = 0;
      let failed = 0;

      for (const item of privateItems) {
        const existing = byId.get(item.id);
        if (!existing) {
          failed += 1;
          onProgress?.(processed + failed, privateItems.length);
          continue;
        }

        try {
          await FileSystem.deleteAsync(existing.uri, { idempotent: true });
          byId.delete(existing.id);
          processed += 1;
        } catch (error) {
          console.error('Error deleting private item file:', item.id, error);
          failed += 1;
        }
        onProgress?.(processed + failed, privateItems.length);
      }

      await writeIndex(sortPrivateItems(Array.from(byId.values())));
      await refreshPrivate();
      if (processed > 0) {
        bumpMediaRefresh();
      }
      return { processed, failed };
    },
    [readIndex, refreshPrivate, writeIndex]
  );

  const updateStatusMany = useCallback(
    async (
      privateItems: PrivateItem[],
      status: PrivateItemStatus,
      onProgress?: ProgressCallback
    ): Promise<PrivateBatchResult> => {
      if (privateItems.length === 0) return { processed: 0, failed: 0 };

      const current = await readIndex();
      const byId = new Map(current.map((item) => [item.id, item]));
      let processed = 0;
      let failed = 0;
      const now = Date.now();

      for (const item of privateItems) {
        const existing = byId.get(item.id);
        if (!existing) {
          failed += 1;
          onProgress?.(processed + failed, privateItems.length);
          continue;
        }

        byId.set(item.id, {
          ...existing,
          status,
          archivedAt: status === 'archived' ? now : status === 'trash' ? existing.archivedAt ?? null : null,
          trashedAt: status === 'trash' ? now : null,
        });
        processed += 1;
        onProgress?.(processed + failed, privateItems.length);
      }

      await writeIndex(sortPrivateItems(Array.from(byId.values())));
      await refreshPrivate();
      if (processed > 0) {
        bumpMediaRefresh();
      }
      return { processed, failed };
    },
    [readIndex, refreshPrivate, writeIndex]
  );

  const archiveManyPrivate = useCallback(
    async (privateItems: PrivateItem[], onProgress?: ProgressCallback) => updateStatusMany(privateItems, 'archived', onProgress),
    [updateStatusMany]
  );

  const restoreManyArchivedToPrivate = useCallback(
    async (privateItems: PrivateItem[], onProgress?: ProgressCallback) => updateStatusMany(privateItems, 'active', onProgress),
    [updateStatusMany]
  );

  const moveManyPrivateToTrash = useCallback(
    async (privateItems: PrivateItem[], onProgress?: ProgressCallback) => updateStatusMany(privateItems, 'trash', onProgress),
    [updateStatusMany]
  );

  const restoreManyPrivateFromTrash = useCallback(
    async (privateItems: PrivateItem[], onProgress?: ProgressCallback) => updateStatusMany(privateItems, 'active', onProgress),
    [updateStatusMany]
  );

  const deletePrivateById = useCallback(
    async (id: string, permanently = false) => {
      const item = items.find((entry) => entry.id === id);
      if (!item) return false;
      if (permanently || item.status === 'trash') {
        const result = await deleteManyPrivate([item]);
        return result.processed === 1;
      }
      const result = await moveManyPrivateToTrash([item]);
      return result.processed === 1;
    },
    [deleteManyPrivate, items, moveManyPrivateToTrash]
  );

  const deletePrivate = useCallback(
    async (item: PrivateItem, permanently = false) => {
      const result = permanently || item.status === 'trash'
        ? await deleteManyPrivate([item])
        : await moveManyPrivateToTrash([item]);
      return result.processed === 1;
    },
    [deleteManyPrivate, moveManyPrivateToTrash]
  );

  const activePrivateItems = items.filter((item) => item.status !== 'archived' && item.status !== 'trash');
  const archivedPrivateItems = items.filter((item) => item.status === 'archived');
  const trashedPrivateItems = items.filter((item) => item.status === 'trash');

  const getPrivateIds = useCallback(() => activePrivateItems.map((item) => item.id), [activePrivateItems]);

  return {
    privateItems: activePrivateItems,
    allPrivateItems: items,
    archivedPrivateItems,
    trashedPrivateItems,
    loading,
    hideInPrivate,
    hideManyInPrivate,
    restoreFromPrivate,
    restoreManyFromPrivate,
    archiveManyPrivate,
    restoreManyArchivedToPrivate,
    moveManyPrivateToTrash,
    restoreManyPrivateFromTrash,
    deletePrivate,
    deleteManyPrivate,
    deletePrivateById,
    refreshPrivate,
    getPrivateIds,
  };
}
