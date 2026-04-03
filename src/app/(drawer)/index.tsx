import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePermissions } from '../../hooks/usePermissions';
import { useMediaLibrary } from '../../hooks/useMediaLibrary';
import PhotoGrid from '../../components/PhotoGrid';
import { COLORS, SPACING } from '../../constants/theme';
import { CameraOff } from 'lucide-react-native';
import { useRouter } from 'expo-router';

export default function AllPhotosScreen() {
  const { isGranted, requestPermission, isUnsupportedExpoGo } = usePermissions();
  const { photos, loading, loadMore } = useMediaLibrary(isGranted);
  const router = useRouter();

  if (isUnsupportedExpoGo) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <CameraOff size={64} color={COLORS.textMuted} />
          <Text style={styles.title}>Limitacion de Expo Go</Text>
          <Text style={styles.subtitle}>
            En Android, Expo Go ya no da acceso completo a la galeria. Usa un Development Build para probar esta funcion.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isGranted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <CameraOff size={64} color={COLORS.textMuted} />
          <Text style={styles.title}>Sin acceso a fotos</Text>
          <Text style={styles.subtitle}>
            Necesitamos permiso para mostrar tus recuerdos locales.
          </Text>
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Conceder Permiso</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading && photos.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Cargando tus recuerdos...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PhotoGrid 
        photos={photos} 
        onLoadMore={loadMore} 
        loading={loading}
        onPhotoPress={(asset) => {
          router.push({
            pathname: `/photo/${asset.id}`,
            params: { 
              uri: asset.uri,
              filename: asset.filename 
            }
          });
        }}
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
    padding: SPACING.xl,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
  },
  loadingText: {
    fontSize: 16,
    color: COLORS.textMuted,
    marginTop: SPACING.lg,
    fontWeight: '500',
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 8,
  },
  buttonText: {
    color: COLORS.background,
    fontSize: 16,
    fontWeight: '600',
  },
});
