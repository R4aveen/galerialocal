import React from 'react';
import { StyleSheet, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';

interface Props {
  asset: MediaLibrary.Asset;
  size: number;
  onPress: (asset: MediaLibrary.Asset) => void;
}

export default function PhotoThumbnail({ asset, size, onPress }: Props) {
  return (
    <Pressable 
      onPress={() => onPress(asset)}
      style={({ pressed }) => [
        styles.container, 
        { width: size, height: size },
        pressed && styles.pressed
      ]}
    >
      <Image
        source={{ uri: asset.uri }}
        style={styles.image}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
      />
    </Pressable>
  );
}

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
});
