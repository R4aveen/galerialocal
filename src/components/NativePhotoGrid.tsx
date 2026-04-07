import React, { useMemo } from 'react';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { requireNativeViewManager } from 'expo-modules-core';
import { getAssetIdentityKey } from '../utils/mediaAssets';

type NativeEvent<T> = { nativeEvent: T };

interface NativePhotoGridAsset {
  key: string;
  id: string;
  uri: string;
  mediaType?: string;
  filename?: string;
}

interface NativePhotoGridViewProps {
  style?: StyleProp<ViewStyle>;
  assets: NativePhotoGridAsset[];
  numColumns: number;
  selectionMode: boolean;
  selectedIds: string[];
  onPhotoPress?: (event: NativeEvent<{ id: string }>) => void;
  onPhotoLongPress?: (event: NativeEvent<{ id: string }>) => void;
  onEndReached?: () => void;
}

interface NativePhotoGridProps {
  style?: StyleProp<ViewStyle>;
  assets: MediaLibrary.Asset[];
  numColumns?: number;
  selectionMode: boolean;
  selectedIds: string[];
  onPhotoPress: (asset: MediaLibrary.Asset) => void;
  onPhotoLongPress?: (asset: MediaLibrary.Asset) => void;
  onEndReached?: () => void;
}

const NativePhotoGridView = requireNativeViewManager<NativePhotoGridViewProps>('GaleriaMedia');

export default function NativePhotoGrid({
  style,
  assets,
  numColumns = 4,
  selectionMode,
  selectedIds,
  onPhotoPress,
  onPhotoLongPress,
  onEndReached,
}: NativePhotoGridProps) {
  const byId = useMemo(() => {
    const map = new Map<string, MediaLibrary.Asset>();
    assets.forEach((asset) => {
      map.set(getAssetIdentityKey(asset), asset);
    });
    return map;
  }, [assets]);

  const nativeAssets = useMemo<NativePhotoGridAsset[]>(
    () => assets.map((asset) => ({
      key: getAssetIdentityKey(asset),
      id: asset.id,
      uri: asset.uri,
      mediaType: asset.mediaType,
      filename: asset.filename,
    })),
    [assets]
  );

  if (Platform.OS !== 'android') {
    return <View style={style} />;
  }

  return (
    <NativePhotoGridView
      style={style}
      assets={nativeAssets}
      numColumns={numColumns}
      selectionMode={selectionMode}
      selectedIds={selectedIds}
      onPhotoPress={(event) => {
        const key = (event?.nativeEvent as any)?.key || event?.nativeEvent?.id;
        if (!key) return;
        const asset = byId.get(key);
        if (asset) {
          onPhotoPress(asset);
        }
      }}
      onPhotoLongPress={(event) => {
        const key = (event?.nativeEvent as any)?.key || event?.nativeEvent?.id;
        if (!key) return;
        const asset = byId.get(key);
        if (asset && onPhotoLongPress) {
          onPhotoLongPress(asset);
        }
      }}
      onEndReached={onEndReached}
    />
  );
}
