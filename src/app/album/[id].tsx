import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View, Linking } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, CameraOff, FolderInput, Lock, Share2, Trash2, X } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import PhotoGrid from '../../components/PhotoGrid';
import AlbumManagerModal from '../../components/AlbumManagerModal';
import { SPACING } from '../../constants/theme';
import { usePermissions } from '../../hooks/usePermissions';
import { useTrash } from '../../hooks/useTrash';
import { usePrivateVault } from '../../hooks/usePrivateVault';
import { useAlbumManager } from '../../hooks/useAlbumManager';
import { setGallerySession } from '../../store/gallerySession';
import { useSelectionStore } from '../../store/useSelectionStore';
import { usePhotoSelectionHandlers } from '../../hooks/usePhotoSelectionHandlers';
import { dedupeAssetsById, getAssetIdentityKey } from '../../utils/mediaAssets';
import { prepareShareUris, sharePreparedUris } from '../../utils/shareMedia';
import { ThemeColors, useAppTheme } from '../../theme/AppThemeContext';

const PAGE_SIZE = 50;

export default function AlbumDetailScreen() {
  const params = useLocalSearchParams<{ id: string; title?: string }>();
  const albumId = params.id;
  const albumTitle = params.title || 'Album';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  const { isGranted, isLimited, requestPermission, isUnsupportedExpoGo, checkPermissions, requestFullAccessAgain } = usePermissions();
  const { getTrashIds, refreshTrash, moveManyToTrash } = useTrash();
  const { getPrivateIds, refreshPrivate, hideManyInPrivate } = usePrivateVault();
  const { albums, loading: loadingAlbums, refreshAlbums, moveAssetsToAlbum, createAlbumFromAssets } = useAlbumManager(Boolean(isGranted));

  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
  const selectionMode = useSelectionStore(state => state.selectionMode);
  const selectedIdsSet = useSelectionStore(state => state.selectedIds);
  const selectedIds = Array.from(selectedIdsSet);
  const clearSelectionStore = useSelectionStore(state => state.clearSelection);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [processingCurrent, setProcessingCurrent] = useState(0);
  const [processingTotal, setProcessingTotal] = useState(0);
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [optimisticHiddenIds, setOptimisticHiddenIds] = useState<string[]>([]);

  useFocusEffect(
    React.useCallback(() => {
      refreshTrash();
      refreshPrivate();
      refreshAlbums();
    }, [refreshTrash, refreshPrivate, refreshAlbums])
  );

  if (isUnsupportedExpoGo) {
    return (
      <View style={styles.center}>
        <CameraOff size={64} color={colors.textMuted} />
        <Text style={styles.title}>Limitacion de Expo Go</Text>
        <Text style={styles.subtitle}>
          En Android, Expo Go ya no da acceso completo a la galeria. Usa un Development Build para probar esta funcion.
        </Text>
      </View>
    );
  }

  if (isLimited) {
    return (
      <View style={styles.center}>
        <CameraOff size={64} color={colors.textMuted} />
        <Text style={styles.title}>Acceso limitado a fotos</Text>
        <Text style={styles.subtitle}>
          Android te dio acceso solo a fotos seleccionadas. Para ver TODO el contenido del dispositivo (incluyendo WhatsApp),
          habilita "Permitir todas las fotos" en Ajustes.
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={async () => {
            await requestFullAccessAgain();
            await checkPermissions();
          }}
        >
          <Text style={styles.buttonText}>Permitir todas las fotos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={async () => {
            await Linking.openSettings();
            await checkPermissions();
          }}
        >
          <Text style={styles.buttonText}>Abrir Ajustes</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const loadAssets = useCallback(
    async (after?: string) => {
      if (!albumId || !isGranted || loading) return;

      setLoading(true);
      try {
        const result = await MediaLibrary.getAssetsAsync({
          album: albumId,
          first: PAGE_SIZE,
          after,
          mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
          sortBy: [[MediaLibrary.SortBy.creationTime, false]],
        });

        setAssets((prev) => {
          const merged = after ? [...prev, ...result.assets] : result.assets;
          return dedupeAssetsById(merged);
        });
        setHasNextPage(result.hasNextPage);
        setEndCursor(result.endCursor);
      } catch (error) {
        console.error('Error loading album assets:', error);
      } finally {
        setLoading(false);
      }
    },
    [albumId, isGranted, loading]
  );

  useEffect(() => {
    if (!isGranted || !albumId) return;
    setAssets([]);
    setHasNextPage(false);
    setEndCursor(undefined);
    loadAssets(undefined);
  }, [albumId, isGranted]);

  const handleLoadMore = () => {
    if (hasNextPage && endCursor) {
      loadAssets(endCursor);
    }
  };

  const filteredAssets = useMemo(() => {
    const excluded = new Set([...getTrashIds(), ...getPrivateIds(), ...optimisticHiddenIds]);
    return assets.filter((asset) => !excluded.has(getAssetIdentityKey(asset)));
  }, [assets, getTrashIds, getPrivateIds, optimisticHiddenIds]);

  const selectedAssets = useMemo(
    () => filteredAssets.filter((asset) => selectedIds.includes(asset.id)),
    [filteredAssets, selectedIds]
  );

  const clearSelection = () => {
    clearSelectionStore();
    setProcessingCurrent(0);
    setProcessingTotal(0);
  };

  const { onPhotoPress: handlePhotoPress, onPhotoLongPress: handlePhotoLongPress } = usePhotoSelectionHandlers({
    assets: filteredAssets,
    onOpenAsset: (asset, allAssets) => {
      const sameTypeAssets = allAssets.filter((item) => item.mediaType === asset.mediaType);
      const assetIndex = sameTypeAssets.findIndex((item) => item.id === asset.id);
      setGallerySession(sameTypeAssets);
      router.push({
        pathname: `/photo/${asset.id}`,
        params: {
          uri: (asset as any).uri,
          filename: (asset as any).filename,
          index: String(assetIndex < 0 ? 0 : assetIndex),
        },
      });
    },
  });

  const handleShareSelected = async () => {
    if (selectedAssets.length === 0) return;
    try {
      clearSelection();
      const prepared = await prepareShareUris(
        selectedAssets.map((item) => ({
          assetId: item.id,
          fallbackUri: item.uri,
          filename: item.filename,
        }))
      );
      await sharePreparedUris(prepared, selectedAssets.length > 1 ? 'Compartir archivos' : 'Compartir archivo');
    } catch (error) {
      console.error('Error sharing selected album assets:', error);
      Alert.alert('Error al compartir', 'No se pudo compartir el archivo seleccionado.');
    }
  };

  const handleDeleteSelected = () => {
    if (selectedAssets.length === 0 || bulkProcessing) return;

    Alert.alert(
      'Mover a papelera',
      `Se moveran ${selectedAssets.length} elementos a la papelera.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Mover',
          style: 'destructive',
          onPress: async () => {
            try {
              clearSelection();
              setBulkProcessing(true);
              setProcessingTotal(selectedAssets.length);
              const { failed, movedIds } = await moveManyToTrash(selectedAssets, (processed, total) => {
                setProcessingCurrent(processed);
                setProcessingTotal(total);
              });
              if (movedIds.length > 0) {
                const movedKeys = selectedAssets.map((asset) => getAssetIdentityKey(asset));
                setOptimisticHiddenIds((prev) => Array.from(new Set([...prev, ...movedKeys])));
              }
              await refreshTrash();
              clearSelection();
              if (failed > 0) {
                Alert.alert('Atencion', `${failed} elementos no se pudieron mover a la papelera.`);
              }
            } finally {
              setBulkProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleMoveToAlbum = async (targetAlbumId: string) => {
    if (selectedAssets.length === 0 || bulkProcessing) return;

    try {
      clearSelection();
      setBulkProcessing(true);
      setProcessingTotal(selectedAssets.length);
      const { failed, movedIds } = await moveAssetsToAlbum(
        selectedAssets,
        targetAlbumId,
        'move',
        (processed, total) => {
          setProcessingCurrent(processed);
          setProcessingTotal(total);
        }
      );
      if (movedIds.length > 0) {
        setOptimisticHiddenIds((prev) => Array.from(new Set([...prev, ...movedIds])));
      }
      setShowAlbumModal(false);
      clearSelection();
      await refreshAlbums();
      await loadAssets(undefined);

      if (failed > 0) {
        Alert.alert('Atencion', `${failed} elementos no se pudieron mover al album.`);
      }
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleCreateAlbum = async (name: string) => {
    if (selectedAssets.length === 0 || bulkProcessing) return;

    try {
      clearSelection();
      setBulkProcessing(true);
      setProcessingTotal(selectedAssets.length);
      const result = await createAlbumFromAssets(name, selectedAssets, 'move', (processed, total) => {
        setProcessingCurrent(processed);
        setProcessingTotal(total);
      });

      if (!result.ok) {
        Alert.alert('Error', 'No se pudo crear el album o mover los elementos.');
        return;
      }

      setShowAlbumModal(false);
      clearSelection();
      await refreshAlbums();
      await loadAssets(undefined);
    } finally {
      setBulkProcessing(false);
    }
  };

  const handlePrivateSelected = async () => {
    if (selectedAssets.length === 0 || bulkProcessing) return;

    const assetsToMove = [...selectedAssets];
    const idsToMove = assetsToMove.map((asset) => getAssetIdentityKey(asset));
    if (idsToMove.length === 0) return;

    // UX: hide instantly and continue in background.
    setOptimisticHiddenIds((prev) => Array.from(new Set([...prev, ...idsToMove])));
    clearSelection();

    setTimeout(() => {
      void (async () => {
        try {
          setBulkProcessing(true);
          setProcessingCurrent(0);
          setProcessingTotal(assetsToMove.length);
          const { hidden, failed } = await hideManyInPrivate(assetsToMove, (processed, total) => {
            setProcessingCurrent(processed);
            setProcessingTotal(total);
          });

          await refreshPrivate();
          await loadAssets(undefined);

          if (failed > 0) {
            Alert.alert('Resultado parcial', `${hidden} movidos a privados, ${failed} fallaron.`);
          }
        } finally {
          setBulkProcessing(false);
        }
      })();
    }, 0);
  };

  if (isUnsupportedExpoGo) {
    return (
      <View style={styles.center}>
        <CameraOff size={64} color={colors.textMuted} />
        <Text style={styles.title}>Limitacion de Expo Go</Text>
        <Text style={styles.subtitle}>
          Para ver albumes en Android usa un Development Build.
        </Text>
      </View>
    );
  }

  if (!isGranted) {
    return (
      <View style={styles.center}>
        <CameraOff size={64} color={colors.textMuted} />
        <Text style={styles.title}>Sin acceso a fotos</Text>
        <Text style={styles.subtitle}>Necesitamos permisos para leer este album.</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Conceder permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading && filteredAssets.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.subtitle}>Cargando {albumTitle}...</Text>
      </View>
    );
  }

  if (filteredAssets.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>{albumTitle}</Text>
        <Text style={styles.subtitle}>Este album no tiene elementos.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={[styles.header, { paddingTop: insets.top, height: 56 + insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft color={colors.text} size={20} />
        </TouchableOpacity>
        <Text numberOfLines={1} style={styles.headerTitle}>{albumTitle}</Text>
        <View style={styles.backButton} />
      </View>

      {selectionMode ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>{selectedIds.length} seleccionadas</Text>
          {bulkProcessing ? (
            <Text style={styles.processingText}>Procesando {processingCurrent}/{processingTotal}</Text>
          ) : null}
          <View style={styles.selectionActions}>
            <TouchableOpacity style={styles.selectionButton} onPress={() => setShowAlbumModal(true)}>
              <FolderInput size={18} color={colors.text} />
              <Text style={styles.selectionButtonText}>Album</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionButton} onPress={handlePrivateSelected} disabled={bulkProcessing}>
              <Lock size={18} color={colors.text} />
              <Text style={styles.selectionButtonText}>{bulkProcessing ? 'Procesando...' : 'Privar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionButton} onPress={handleShareSelected}>
              <Share2 size={18} color={colors.text} />
              <Text style={styles.selectionButtonText}>Compartir</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectionButton, styles.selectionDelete, bulkProcessing && styles.selectionButtonDisabled]}
              onPress={handleDeleteSelected}
              disabled={bulkProcessing}
            >
              <Trash2 size={18} color={colors.text} />
              <Text style={styles.selectionButtonText}>{bulkProcessing ? 'Procesando...' : 'Borrar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionButton} onPress={clearSelection}>
              <X size={18} color={colors.text} />
              <Text style={styles.selectionButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <PhotoGrid
        listKey={`album-${String(albumId || 'unknown')}`}
        photos={filteredAssets}
        loading={loading}
        onLoadMore={handleLoadMore}
        onPhotoPress={handlePhotoPress}
        onPhotoLongPress={handlePhotoLongPress}
      />

      <AlbumManagerModal
        visible={showAlbumModal}
        processing={bulkProcessing}
        albums={albums}
        loadingAlbums={loadingAlbums}
        onClose={() => setShowAlbumModal(false)}
        onMoveToAlbum={handleMoveToAlbum}
        onCreateAlbum={handleCreateAlbum}
      />
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, mode: 'dark' | 'light') => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: SPACING.md,
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: 14,
  },
  button: {
    marginTop: SPACING.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 8,
  },
  buttonText: {
    color: colors.background,
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryButton: {
    marginTop: SPACING.sm,
    backgroundColor: colors.border,
  },
  selectionBar: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: colors.surface,
  },
  selectionCount: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  processingText: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 8,
  },
  selectionActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  selectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.border,
  },
  selectionDelete: {
    backgroundColor: colors.error,
  },
  selectionButtonDisabled: {
    opacity: 0.65,
  },
  selectionButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
