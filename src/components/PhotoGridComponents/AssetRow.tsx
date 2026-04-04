import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import PhotoThumbnail from '../PhotoThumbnail';

interface AssetRowProps {
  itemKey: string;
  assets: MediaLibrary.Asset[];
  columns: number;
  itemSize: number;
  onPhotoPress: (asset: MediaLibrary.Asset) => void;
  onPhotoLongPress?: (asset: MediaLibrary.Asset) => void;
}

function AssetRow({ itemKey, assets, columns, itemSize, onPhotoPress, onPhotoLongPress }: AssetRowProps) {
  return (
    <View style={styles.row}>
      {assets.map((asset, assetIdx) => (
        <View key={`${asset.id}-${itemKey}-${assetIdx}`} style={{ width: itemSize }}>
          <PhotoThumbnail
            asset={asset}
            size={itemSize}
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
  return prev.itemKey === next.itemKey && prev.assets === next.assets;
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  cell: {
    // width: itemSize is handled inline or passed down. To make it dynamic without breaking pureness, we won't fix width here.
  },
});
