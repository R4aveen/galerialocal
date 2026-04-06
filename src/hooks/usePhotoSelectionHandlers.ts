import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as MediaLibrary from 'expo-media-library';
import { useSelectionStore } from '../store/useSelectionStore';

interface UsePhotoSelectionHandlersParams<TAsset extends { id: string } = MediaLibrary.Asset> {
  assets: TAsset[];
  onOpenAsset: (asset: TAsset, assets: TAsset[]) => void;
}

export function usePhotoSelectionHandlers<TAsset extends { id: string } = MediaLibrary.Asset>({
  assets,
  onOpenAsset,
}: UsePhotoSelectionHandlersParams<TAsset>) {
  const assetsRef = useRef(assets);

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  const onPhotoPress = useCallback(
    (asset: TAsset) => {
      const { selectionMode, toggleSelection } = useSelectionStore.getState();
      if (selectionMode) {
        toggleSelection(asset.id);
        return;
      }

      const currentAssets = assetsRef.current;
      onOpenAsset(asset, currentAssets);
    },
    [onOpenAsset]
  );

  const onPhotoLongPress = useCallback((asset: TAsset) => {
    const { selectionMode, setSelectionMode, toggleSelection } = useSelectionStore.getState();
    if (!selectionMode) {
      setSelectionMode(true);
    }
    toggleSelection(asset.id);
  }, []);

  const clearSelection = useCallback(() => {
    useSelectionStore.getState().clearSelection();
  }, []);

  return useMemo(
    () => ({
      onPhotoPress,
      onPhotoLongPress,
      clearSelection,
    }),
    [clearSelection, onPhotoLongPress, onPhotoPress]
  );
}
