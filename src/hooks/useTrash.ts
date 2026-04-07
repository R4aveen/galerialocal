import { useState, useEffect, useCallback } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import {
  copyFileNative,
  copyFilesAndDeleteNative,
  deleteAssetsBatch,
  moveAssetsToTrashNative,
  restoreFilesNative,
  type NativeCopyAndDeleteRequest,
  type NativeCopyAndDeleteResult,
  type NativeMoveToTrashRequest,
  type NativeMoveToTrashResult,
  type NativeRestoreRequest,
  type NativeRestoreResult,
} from '../utils/nativeMediaOps';

export interface TrashItem {
  id: string;
  filename: string;
  uri: string;
  original_path: string;
  deleted_at: number;
  recoverable?: boolean;
}

interface MoveManyResult {
  moved: number;
  failed: number;
  movedIds: string[];
}

type ProgressCallback = (processed: number, total: number) => void;

interface RestoreManyResult {
  restored: number;
  failed: number;
  restoredIds: string[];
}

type TrashListener = (items: TrashItem[], loading: boolean) => void;

const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

let sharedTrashItems: TrashItem[] = [];
let sharedTrashLoading = false;
const trashListeners = new Set<TrashListener>();

const notifyTrashListeners = () => {
  trashListeners.forEach((listener) => {
    try {
      listener(sharedTrashItems, sharedTrashLoading);
    } catch {
      // ignore
    }
  });
};

export function useTrash() {
  const [trashItems, setTrashItems] = useState<TrashItem[]>(sharedTrashItems);
  const [loading, setLoading] = useState(sharedTrashLoading);

  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  const trashDir = `${baseDir}.trash/`;
  const trashMetaFile = `${trashDir}index.json`;

  const ensureTrashStorage = useCallback(async () => {
    if (!baseDir) {
      throw new Error('No hay directorio de almacenamiento disponible en el dispositivo');
    }

    const dirInfo = await FileSystem.getInfoAsync(trashDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(trashDir, { intermediates: true });
    }

    const fileInfo = await FileSystem.getInfoAsync(trashMetaFile);
    if (!fileInfo.exists) {
      await FileSystem.writeAsStringAsync(trashMetaFile, '[]');
    }
  }, [baseDir, trashDir, trashMetaFile]);

  const readTrashItems = useCallback(async (): Promise<TrashItem[]> => {
    await ensureTrashStorage();

    try {
      const raw = await FileSystem.readAsStringAsync(trashMetaFile);
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return (parsed as TrashItem[]).map((item) => ({
        ...item,
        recoverable: item.recoverable ?? Boolean(item.uri),
      }));
    } catch {
      return [];
    }
  }, [ensureTrashStorage, trashMetaFile]);

  const writeTrashItems = useCallback(
    async (items: TrashItem[]) => {
      await ensureTrashStorage();
      await FileSystem.writeAsStringAsync(trashMetaFile, JSON.stringify(items));
    },
    [ensureTrashStorage, trashMetaFile]
  );

  const loadTrash = useCallback(async () => {
    sharedTrashLoading = true;
    setLoading(true);
    notifyTrashListeners();
    try {
      const items = await readTrashItems();
      items.sort((a, b) => b.deleted_at - a.deleted_at);
      sharedTrashItems = items;
      setTrashItems(items);
    } catch (error) {
      console.error('Error loading trash:', error);
      sharedTrashItems = [];
      setTrashItems([]);
    } finally {
      sharedTrashLoading = false;
      setLoading(false);
      notifyTrashListeners();
    }
  }, [readTrashItems]);

  useEffect(() => {
    const listener: TrashListener = (items, isLoading) => {
      setTrashItems(items);
      setLoading(isLoading);
    };
    trashListeners.add(listener);

    loadTrash();
    return () => {
      trashListeners.delete(listener);
    };
  }, [loadTrash]);

  const buildTrashItem = useCallback(
    async (asset: MediaLibrary.Asset, sourceOverride?: string, alreadyCopied = false): Promise<TrashItem> => {
      const safeFilename = (asset.filename || `${asset.id}.bin`).replace(/[\/:*?"<>|]/g, '_');
      const newUri = `${trashDir}${asset.id}-${safeFilename}`;

      if (alreadyCopied) {
        return {
          id: asset.id,
          filename: safeFilename,
          uri: newUri,
          original_path: asset.uri,
          deleted_at: Date.now(),
          recoverable: true,
        };
      }

      let copied = alreadyCopied;
      let localUri: string | undefined;

      if (sourceOverride) {
        if (!alreadyCopied) {
          const copiedNatively = await copyFileNative(sourceOverride, newUri);
          if (copiedNatively) {
            copied = true;
          }
        }

        return {
          id: asset.id,
          filename: safeFilename,
          uri: copied ? newUri : '',
          original_path: asset.uri,
          deleted_at: Date.now(),
          recoverable: copied,
        };
      }

      try {
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
        localUri = assetInfo.localUri ?? undefined;
      } catch {
        localUri = undefined;
      }

      const copyCandidates = [localUri, asset.uri].filter(
        (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0
      );

      for (const candidate of copyCandidates) {
        try {
          copied = await copyFileNative(candidate, newUri);
          break;
        } catch {
          // Try next candidate.
        }
      }

      return {
        id: asset.id,
        filename: safeFilename,
        uri: copied ? newUri : '',
        original_path: asset.uri,
        deleted_at: Date.now(),
        recoverable: copied,
      };
    },
    [trashDir]
  );

  const moveManyToTrash = useCallback(
    async (assets: MediaLibrary.Asset[], onProgress?: ProgressCallback): Promise<MoveManyResult> => {
      if (assets.length === 0) return { moved: 0, failed: 0, movedIds: [] };

      try {
        await ensureTrashStorage();

        const previousItems = await readTrashItems();
        const itemsById = new Map(previousItems.map((item) => [item.id, item]));

        let failed = 0;
        const builtItems: TrashItem[] = [];
        const prepared: Array<{ asset: MediaLibrary.Asset; destinationPath: string }> = [];

        for (const asset of assets) {
          try {
            const safeFilename = (asset.filename || `${asset.id}.bin`).replace(/[\\/:*?"<>|]/g, '_');
            const destinationPath = `${trashDir}${asset.id}-${safeFilename}`;
            prepared.push({ asset, destinationPath });
          } catch (error) {
            console.error('Error preparing asset for trash:', asset.id, error);
            failed += 1;
          }
          onProgress?.(builtItems.length + failed, assets.length);
          if ((builtItems.length + failed) % 6 === 0) {
            await yieldToUI();
          }
        }

        const nativeMoveResults = await moveAssetsToTrashNative(
          prepared.map((item) => ({
            assetId: item.asset.id,
            destinationPath: item.destinationPath,
          }))
        );
        const nativeResultByAssetId = new Map(
          nativeMoveResults.map((result) => [result.assetId, result])
        );
        const nativeDeletedIds = new Set(
          nativeMoveResults.filter((result) => result.deleted).map((result) => result.assetId)
        );

        for (const item of prepared) {
          try {
            const nativeResult = nativeResultByAssetId.get(item.asset.id);
            const alreadyCopied = nativeResult?.copied === true;
            const sourceOverride = nativeResult?.sourceUri || undefined;
            const trashItem = await buildTrashItem(item.asset, sourceOverride, alreadyCopied);
            builtItems.push(trashItem);
          } catch (error) {
            console.error('Error preparing asset for trash:', item.asset.id, error);
            failed += 1;
          }
          onProgress?.(builtItems.length + failed, assets.length);
          if ((builtItems.length + failed) % 6 === 0) {
            await yieldToUI();
          }
        }

        const builtIds = builtItems.map((item) => item.id);
        let bulkDeleted = false;

        // Fallback for copy+delete in a single native call when moveAssetsToTrash could not finish.
        const missingMove = prepared.filter((item) => {
          const result = nativeResultByAssetId.get(item.asset.id);
          return !result || !(result.copied && result.deleted);
        });
        if (missingMove.length > 0) {
          const fallbackComposite = await copyFilesAndDeleteNative(
            missingMove.map((item) => ({
              assetId: item.asset.id,
              sourceUri: item.asset.uri,
              destinationPath: item.destinationPath,
            }))
          );
          fallbackComposite.forEach((result) => {
            if (result.deleted) {
              nativeDeletedIds.add(result.assetId);
            }
          });
        }

        const idsPendingDelete = builtIds.filter((id) => !nativeDeletedIds.has(id));
        if (idsPendingDelete.length > 0) {
          try {
            bulkDeleted = await deleteAssetsBatch(idsPendingDelete);
          } catch {
            bulkDeleted = false;
          }

          if (bulkDeleted) {
            idsPendingDelete.forEach((id) => nativeDeletedIds.add(id));
          }
        }

        if (!bulkDeleted && idsPendingDelete.length > 0) {
          console.warn('Bulk delete did not complete for all trash items; skipping per-item retries to avoid repeated system prompts.');
        }

        // Keep in trash index only assets that were actually deleted from MediaStore.
        const successfulTrashItems = builtItems.filter((item) => nativeDeletedIds.has(item.id));
        const failedTrashItems = builtItems.filter((item) => !nativeDeletedIds.has(item.id));

        // Roll back copied files for assets that were not deleted to avoid inconsistent state.
        for (const failedItem of failedTrashItems) {
          failed += 1;
          try {
            await FileSystem.deleteAsync(failedItem.uri, { idempotent: true });
          } catch {
            // Ignore rollback cleanup failures.
          }
        }

        for (const item of successfulTrashItems) {
          itemsById.set(item.id, item);
        }

        const nextItems = Array.from(itemsById.values()).sort((a, b) => b.deleted_at - a.deleted_at);
        await writeTrashItems(nextItems);

        // Optimistic: update shared state immediately so drawer/trash UI updates instantly.
        sharedTrashItems = nextItems;
        notifyTrashListeners();

        onProgress?.(assets.length, assets.length);

        await loadTrash();
        return { moved: successfulTrashItems.length, failed, movedIds: successfulTrashItems.map((item) => item.id) };
      } catch (error) {
        console.error('Error moving many assets to trash:', error);
        return { moved: 0, failed: assets.length, movedIds: [] };
      }
    },
    [ensureTrashStorage, readTrashItems, buildTrashItem, writeTrashItems, loadTrash]
  );

  const moveToTrash = async (asset: MediaLibrary.Asset) => {
    const result = await moveManyToTrash([asset]);
    return result.moved === 1;
  };

  const getTrashIds = useCallback(() => {
    return trashItems.map((item) => {
      if (item.original_path) {
        return `${item.id}::${item.original_path}`;
      }
      return item.id;
    });
  }, [trashItems]);

  const restoreManyFromTrash = async (
    itemsToRestore: TrashItem[],
    onProgress?: ProgressCallback
  ): Promise<RestoreManyResult> => {
    if (itemsToRestore.length === 0) {
      return { restored: 0, failed: 0, restoredIds: [] };
    }

    try {
      const items = await readTrashItems();
      const itemsById = new Map(items.map((entry) => [entry.id, entry]));
      const restorable = itemsToRestore.filter((item) => item.recoverable && item.uri);

      const nativeResults = await restoreFilesNative(
        restorable.map((item) => ({
          itemId: item.id,
          sourcePath: item.uri,
          filename: item.filename,
        }))
      );
      const nativeById = new Map(nativeResults.map((result) => [result.itemId, result]));

      let restored = 0;
      let failed = 0;
      const restoredIds: string[] = [];

      for (const item of itemsToRestore) {
        const existing = itemsById.get(item.id);
        if (!existing) {
          failed += 1;
          onProgress?.(restored + failed, itemsToRestore.length);
          continue;
        }

        if (!existing.recoverable || !existing.uri) {
          failed += 1;
          onProgress?.(restored + failed, itemsToRestore.length);
          continue;
        }

        const wasRestored = nativeById.get(existing.id)?.restored === true;

        if (!wasRestored) {
          failed += 1;
          onProgress?.(restored + failed, itemsToRestore.length);
          if ((restored + failed) % 6 === 0) {
            await yieldToUI();
          }
          continue;
        }

        itemsById.delete(existing.id);
        restored += 1;
        restoredIds.push(existing.id);

        try {
          await FileSystem.deleteAsync(existing.uri, { idempotent: true });
        } catch {
          // If temp file cleanup fails, keep restored result and continue.
        }

        onProgress?.(restored + failed, itemsToRestore.length);
        if ((restored + failed) % 6 === 0) {
          await yieldToUI();
        }
      }

      const nextItems = Array.from(itemsById.values()).sort((a, b) => b.deleted_at - a.deleted_at);
      await writeTrashItems(nextItems);
      sharedTrashItems = nextItems;
      notifyTrashListeners();
      await loadTrash();

      return { restored, failed, restoredIds };
    } catch (error) {
      console.error('Error restoring many from trash:', error);
      return { restored: 0, failed: itemsToRestore.length, restoredIds: [] };
    }
  };

  const restoreFromTrash = async (item: TrashItem) => {
    const result = await restoreManyFromTrash([item]);
    return result.restored === 1;
  };

  const deletePermanently = async (item: TrashItem) => {
    try {
      // Try to remove from the system gallery first.
      // If this step fails, we keep the item in trash so the user can retry.
      const deleted = await deleteAssetsBatch([item.id]);
      if (!deleted) {
        return false;
      }

      const items = await readTrashItems();
      const nextItems = items.filter((trashItem) => trashItem.id !== item.id);
      await writeTrashItems(nextItems);

      if (item.uri) {
        await FileSystem.deleteAsync(item.uri, { idempotent: true });
      }

      sharedTrashItems = nextItems;
      notifyTrashListeners();

      await loadTrash();
      return true;
    } catch (error) {
      console.error('Error deleting permanently:', error);
      return false;
    }
  };

  const emptyTrash = async () => {
    try {
      setLoading(true);
      const items = await readTrashItems();
      
      const ids = items.map(item => item.id);
      if (ids.length > 0) {
        try {
          await deleteAssetsBatch(ids);
        } catch (error) {
          console.warn('Could not cleanly delete all assets from media library during emptyTrash', error);
        }
      }

      for (const item of items) {
        if (item.uri) {
          try {
            await FileSystem.deleteAsync(item.uri, { idempotent: true });
          } catch (e) {}
        }
      }

      await writeTrashItems([]);

      sharedTrashItems = [];
      notifyTrashListeners();
      await loadTrash();
      return true;
    } catch (error) {
      console.error('Error emptying trash:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    trashItems,
    loading,
    moveToTrash,
    moveManyToTrash,
    restoreFromTrash,
    restoreManyFromTrash,
    deletePermanently,
    emptyTrash,
    refreshTrash: loadTrash,
    getTrashIds,
  };
}
