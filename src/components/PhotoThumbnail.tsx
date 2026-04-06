import React, { memo } from 'react';
import { StyleSheet, Pressable, View, Text } from 'react-native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { useSelectionStore } from '../store/useSelectionStore';
import { getAssetIdentityKey } from '../utils/mediaAssets';

interface Props {
  asset: MediaLibrary.Asset;
  size: number;
  onPress: (asset: MediaLibrary.Asset) => void;
  onLongPress?: (asset: MediaLibrary.Asset) => void;
}

function PhotoThumbnail({ asset, size, onPress, onLongPress }: Props) {
  const selectionKey = getAssetIdentityKey(asset);
  // Suscripción atómica: El componente SOLO se volverá a renderizar si 
  // su propio estado de selección cambia o si el modo selección se apaga/enciende globalmente.
  const isSelected = useSelectionStore(state => state.selectedIds.has(selectionKey));
  const selectionMode = useSelectionStore(state => state.selectionMode);
  const dragSelecting = useSelectionStore(state => state.dragSelecting);

  return (
    <Pressable 
      onPress={dragSelecting ? undefined : () => onPress(asset)}
      onLongPress={dragSelecting || !onLongPress ? undefined : () => onLongPress(asset)}
      style={({ pressed }) => [
        styles.container, 
        { width: size, height: size },
        isSelected && styles.selected,
        pressed && styles.pressed
      ]}
    >
      <Image
        source={{ uri: asset.uri }}
        style={styles.image}
        contentFit="cover"
        transition={100}
        cachePolicy="disk"
      />
      {asset.mediaType === 'video' ? (
        <View style={styles.videoBadge}>
          <Text style={styles.videoBadgeText}>VIDEO</Text>
        </View>
      ) : null}

      {selectionMode ? (
        <View style={[styles.selectionBadge, isSelected ? styles.selectionBadgeActive : null]}>
          <Text style={styles.selectionBadgeText}>{isSelected ? '✓' : ''}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// React.memo evitará que este componente se re-renderice si el Asset o las callbacks onPress no cambian,
// ignorando los cambios globales de otras fotos.
export default memo(PhotoThumbnail, (prev, next) => {
  return prev.asset.id === next.asset.id && prev.asset.uri === next.asset.uri && prev.size === next.size;
});

const styles = StyleSheet.create({
  container: {
    padding: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    overflow: 'hidden',
  },
  image: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  selected: {
    borderWidth: 2,
    borderColor: '#BB86FC',
    shadowOpacity: 0.45,
    shadowRadius: 6,
    elevation: 4,
  },
  videoBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  videoBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  selectionBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionBadgeActive: {
    backgroundColor: '#BB86FC',
    borderColor: '#BB86FC',
  },
  selectionBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
});
