import { useState, useEffect, useCallback } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

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

export function useTrash() {
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    try {
      const items = await readTrashItems();
      items.sort((a, b) => b.deleted_at - a.deleted_at);
      setTrashItems(items);
    } catch (error) {
      console.error('Error loading trash:', error);
      setTrashItems([]);
    } finally {
      setLoading(false);
    }
  }, [readTrashItems]);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  const buildTrashItem = useCallback(
    async (asset: MediaLibrary.Asset): Promise<TrashItem> => {
      const safeFilename = (asset.filename || `${asset.id}.bin`).replace(/[\\/:*?"<>|]/g, '_');
      const newUri = `${trashDir}${asset.id}-${safeFilename}`;

      let copied = false;
      let localUri: string | undefined;

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
          await FileSystem.copyAsync({ from: candidate, to: newUri });
          copied = true;
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

        for (const asset of assets) {
          try {
            const trashItem = await buildTrashItem(asset);
            builtItems.push(trashItem);
          } catch (error) {
            console.error('Error preparing asset for trash:', asset.id, error);
            failed += 1;
          }
          onProgress?.(builtItems.length + failed, assets.length);
        }

        for (const item of builtItems) {
          itemsById.set(item.id, item);
        }

        const nextItems = Array.from(itemsById.values()).sort((a, b) => b.deleted_at - a.deleted_at);
        await writeTrashItems(nextItems);

        const builtIds = builtItems.map((item) => item.id);
        let bulkDeleted = false;

        if (builtIds.length > 0) {
          try {
            const ok = await MediaLibrary.deleteAssetsAsync(builtIds);
            bulkDeleted = ok;
          } catch {
            bulkDeleted = false;
          }
        }

        if (!bulkDeleted) {
          for (const item of builtItems) {
            try {
              await MediaLibrary.deleteAssetsAsync([item.id]);
            } catch (deleteError) {
              console.warn('Could not delete asset from media library, but moved to trash:', item.id, deleteError);
            }
          }
        }

        onProgress?.(assets.length, assets.length);

        await loadTrash();
        return { moved: builtItems.length, failed, movedIds: builtItems.map((item) => item.id) };
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
    return trashItems.map((item) => item.id);
  }, [trashItems]);

  const restoreFromTrash = async (item: TrashItem) => {
    try {
      if (!item.recoverable || !item.uri) {
        console.warn('Item is not recoverable because original file was not copied to app storage');
        return false;
      }

      // En Android recientes se restaura creando un nuevo asset en la librería.
      await MediaLibrary.createAssetAsync(item.uri);

      const items = await readTrashItems();
      await writeTrashItems(items.filter((trashItem) => trashItem.id !== item.id));
      await FileSystem.deleteAsync(item.uri, { idempotent: true });

      await loadTrash();
      return true;
    } catch (error) {
      console.error('Error restoring:', error);
      return false;
    }
  };

  const deletePermanently = async (item: TrashItem) => {
    try {
      // Try to remove from the system gallery first.
      // If this step fails, we keep the item in trash so the user can retry.
      await MediaLibrary.deleteAssetsAsync([item.id]);

      const items = await readTrashItems();
      await writeTrashItems(items.filter((trashItem) => trashItem.id !== item.id));

      if (item.uri) {
        await FileSystem.deleteAsync(item.uri, { idempotent: true });
      }

      await loadTrash();
      return true;
    } catch (error) {
      console.error('Error deleting permanently:', error);
      return false;
    }
  };

  return {
    trashItems,
    loading,
    moveToTrash,
    moveManyToTrash,
    restoreFromTrash,
    deletePermanently,
    refreshTrash: loadTrash,
    getTrashIds,
  };
}
