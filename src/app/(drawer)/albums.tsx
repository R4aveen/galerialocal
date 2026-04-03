import React from 'react';
import { StyleSheet, View, Text, FlatList, ActivityIndicator } from 'react-native';
import { COLORS, SPACING } from '../../constants/theme';
import { useAlbums, AlbumWithCover } from '../../hooks/useAlbums';
import { usePermissions } from '../../hooks/usePermissions';
import AlbumCard from '../../components/AlbumCard';

export default function AlbumsScreen() {
  const { isGranted, isUnsupportedExpoGo } = usePermissions();
  const { albums, loading } = useAlbums(isGranted);

  if (isUnsupportedExpoGo) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Limitacion de Expo Go</Text>
        <Text style={styles.subtitle}>
          Expo Go no permite acceso completo a la galeria en Android. Para ver albumes, usa un Development Build.
        </Text>
      </View>
    );
  }

  if (!isGranted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Sin permisos de galeria</Text>
        <Text style={styles.subtitle}>Concede permisos desde la pantalla principal de fotos.</Text>
      </View>
    );
  }

  if (loading && albums.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={albums}
        numColumns={2}
        renderItem={({ item }) => (
          <AlbumCard 
            album={item} 
            onPress={(album) => console.log('Album pressed:', album.title)} 
          />
        )}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.columnWrapper}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: SPACING.md,
    color: COLORS.textMuted,
    textAlign: 'center',
    fontSize: 14,
  },
  list: {
    padding: SPACING.md,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
});
