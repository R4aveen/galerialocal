import { useState, useEffect, useCallback } from 'react';
import * as SQLite from 'expo-sqlite';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';

export interface TrashItem {
  id: string;
  filename: string;
  uri: string;
  original_path: string;
  deleted_at: number;
}

export function useTrash() {
  const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(false);

  const getDb = async () => await SQLite.openDatabaseAsync('galeria.db');

  const loadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDb();
      const allRows = await db.getAllAsync<TrashItem>(
        'SELECT * FROM trash ORDER BY deleted_at DESC'
      );
      setTrashItems(allRows);
    } catch (error) {
      console.error('Error loading trash:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  const moveToTrash = async (asset: MediaLibrary.Asset) => {
    try {
      const db = await getDb();
      const trashDir = `${(FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory}.trash/`;
      
      // Asegurar que el directorio de papelera existe
      const dirInfo = await FileSystem.getInfoAsync(trashDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(trashDir, { intermediates: true });
      }

      const newUri = `${trashDir}${asset.filename}`;
      
      // 1. Mover el archivo físicamente a la carpeta oculta de la app
      await FileSystem.copyAsync({ from: asset.uri, to: newUri });
      
      // 2. Registrar en SQLite
      await db.runAsync(
        'INSERT OR REPLACE INTO trash (id, filename, uri, original_path, deleted_at) VALUES (?, ?, ?, ?, ?)',
        [asset.id, asset.filename, newUri, asset.uri, Date.now()]
      );

      // 3. Eliminar de la galería pública (pide permiso al usuario)
      await MediaLibrary.deleteAssetsAsync([asset]);
      
      await loadTrash();
      return true;
    } catch (error) {
      console.error('Error moving to trash:', error);
      return false;
    }
  };

  const restoreFromTrash = async (item: TrashItem) => {
    try {
      const db = await getDb();
      
      // Nota: En Android 14+, restaurar a la ubicación original requiere 
      // crear un nuevo asset ya que el original fue borrado.
      await MediaLibrary.createAssetAsync(item.uri);
      
      // Eliminar de SQLite y del almacenamiento temporal
      await db.runAsync('DELETE FROM trash WHERE id = ?', [item.id]);
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
      const db = await getDb();
      await db.runAsync('DELETE FROM trash WHERE id = ?', [item.id]);
      await FileSystem.deleteAsync(item.uri, { idempotent: true });
      await loadTrash();
    } catch (error) {
      console.error('Error deleting permanently:', error);
    }
  };

  return { trashItems, loading, moveToTrash, restoreFromTrash, deletePermanently, refreshTrash: loadTrash };
}
