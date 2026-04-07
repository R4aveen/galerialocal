import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import PhotoThumbnail from '../PhotoThumbnail';

interface AssetRowProps {
  itemKey: string;
  assets: MediaLibrary.Asset[];
  columns: number;
  itemSize: number;
  selectionMode: boolean;
  dragSelecting: boolean;
  onPhotoPress: (asset: MediaLibrary.Asset) => void;
  onPhotoLongPress?: (asset: MediaLibrary.Asset) => void;
}

function AssetRow({
  itemKey,
  assets,
  columns,
  itemSize,
  selectionMode,
  dragSelecting,
  onPhotoPress,
  onPhotoLongPress,
}: AssetRowProps) {
  return (
    <View style={styles.row}>
      {assets.map((asset, assetIdx) => (
        <View key={`${asset.id}-${itemKey}-${assetIdx}`} style={{ width: itemSize }}>
          <PhotoThumbnail
            asset={asset}
            size={itemSize}
            selectionMode={selectionMode}
            dragSelecting={dragSelecting}
            onPress={onPhotoPress}
            onLongPress={onPhotoLongPress}
          />
        </View>
      ))}
      {assets.length < columns
        ? Array.from({ length: columns - assets.length }).map((_, idx) => (
            <View key={`spacer-${itemKey}-${idx}`} style={{ width: itemSize }} />
          ))
        : null}
    </View>
  );
}

// React.memo prevents re-rendering entire rows if their assets haven't changed.
export default memo(AssetRow, (prev, next) => {
  if (prev.itemKey !== next.itemKey) return false;
  if (prev.columns !== next.columns) return false;
  if (prev.itemSize !== next.itemSize) return false;
  if (prev.selectionMode !== next.selectionMode) return false;
  if (prev.dragSelecting !== next.dragSelecting) return false;
  if (prev.onPhotoPress !== next.onPhotoPress) return false;
  if (prev.onPhotoLongPress !== next.onPhotoLongPress) return false;
  if (prev.assets.length !== next.assets.length) return false;

  for (let i = 0; i < prev.assets.length; i += 1) {
    const prevAsset = prev.assets[i];
    const nextAsset = next.assets[i];
    if (!prevAsset || !nextAsset) return false;
    if (prevAsset.id !== nextAsset.id) return false;
    if (prevAsset.uri !== nextAsset.uri) return false;
    if (prevAsset.modificationTime !== nextAsset.modificationTime) return false;
    if (prevAsset.mediaType !== nextAsset.mediaType) return false;
  }

  return true;
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  cell: {
    // width: itemSize is handled inline or passed down. To make it dynamic without breaking pureness, we won't fix width here.
  },
});
