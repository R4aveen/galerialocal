import React from 'react';
import { StyleSheet, Pressable, View, Text } from 'react-native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';

interface Props {
  asset: MediaLibrary.Asset;
  size: number;
  onPress: (asset: MediaLibrary.Asset) => void;
  onLongPress?: (asset: MediaLibrary.Asset) => void;
  selected?: boolean;
  selectionMode?: boolean;
}

function PhotoThumbnail({ asset, size, onPress, onLongPress, selected = false, selectionMode = false }: Props) {
  return (
    <Pressable 
      onPress={() => onPress(asset)}
      onLongPress={onLongPress ? () => onLongPress(asset) : undefined}
      style={({ pressed }) => [
        styles.container, 
        { width: size, height: size },
        selected && styles.selected,
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
        <View style={[styles.selectionBadge, selected ? styles.selectionBadgeActive : null]}>
          <Text style={styles.selectionBadgeText}>{selected ? '✓' : ''}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default React.memo(PhotoThumbnail);

const styles = StyleSheet.create({
  container: {
    padding: 1,
  },
  image: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  pressed: {
    opacity: 0.7,
  },
  selected: {
    borderWidth: 2,
    borderColor: '#BB86FC',
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
