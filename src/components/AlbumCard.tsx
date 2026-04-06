import React from 'react';
import { StyleSheet, View, Text, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { SPACING } from '../constants/theme';
import { AlbumWithCover } from '../hooks/useAlbums';
import { useAppTheme } from '../theme/AppThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = (SCREEN_WIDTH - SPACING.md * 3) / 2;

interface Props {
  album: AlbumWithCover;
  onPress: (album: AlbumWithCover) => void;
}

export default function AlbumCard({ album, onPress }: Props) {
  const { colors, mode } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors, mode), [colors, mode]);

  return (
    <Pressable 
      onPress={() => onPress(album)}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <View style={styles.imageContainer}>
        {album.coverUri ? (
          <Image source={{ uri: album.coverUri }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.placeholder]} />
        )}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{album.assetCount}</Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={1}>{album.title}</Text>
    </Pressable>
  );
}

const createStyles = (colors: { surface: string; border: string; text: string }, mode: 'dark' | 'light') => StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    marginBottom: SPACING.lg,
  },
  imageContainer: {
    width: CARD_WIDTH,
    height: CARD_WIDTH,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  image: {
    flex: 1,
  },
  placeholder: {
    backgroundColor: colors.border,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginTop: SPACING.sm,
  },
  badge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});
