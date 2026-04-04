import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Alert, AppState, Share, StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, ScrollView, InteractionManager } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { usePermissions } from '../../hooks/usePermissions';
import { DateFilter, MediaFilter, SortOrder, useMediaLibrary } from '../../hooks/useMediaLibrary';
import { useTrash } from '../../hooks/useTrash';
import { usePrivateVault } from '../../hooks/usePrivateVault';
import { useAlbumManager } from '../../hooks/useAlbumManager';
import PhotoGrid from '../../components/PhotoGrid';
import AlbumManagerModal from '../../components/AlbumManagerModal';
import { COLORS, SPACING } from '../../constants/theme';
import { CameraOff, FolderInput, Lock, Share2, Trash2, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { setGallerySession } from '../../store/gallerySession';

export default function AllPhotosScreen() {
  const { isGranted, requestPermission, isUnsupportedExpoGo } = usePermissions();
  const { getTrashIds, refreshTrash, moveManyToTrash } = useTrash();
  const { getPrivateIds, refreshPrivate, hideManyInPrivate } = usePrivateVault();
  const { albums, loading: loadingAlbums, refreshAlbums, moveAssetsToAlbum, createAlbumFromAssets } = useAlbumManager(Boolean(isGranted));
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [processingCurrent, setProcessingCurrent] = useState(0);
  const [processingTotal, setProcessingTotal] = useState(0);
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [optimisticExcludedIds, setOptimisticExcludedIds] = useState<string[]>([]);
  const [galleryResetToken, setGalleryResetToken] = useState(0);
  const appStateRef = useRef(AppState.currentState);
  const initialResetDoneRef = useRef(false);
  const excludedIds = useMemo(
    () => [...getTrashIds(), ...getPrivateIds(), ...optimisticExcludedIds],
    [getTrashIds, getPrivateIds, optimisticExcludedIds]
  );
  const { assets, loading, loadMore } = useMediaLibrary(isGranted, {
    mediaFilter,
    dateFilter,
    sortOrder,
    excludeIds: excludedIds,
  });
  const router = useRouter();
  const hasActiveFilters = mediaFilter !== 'all' || dateFilter !== 'all' || sortOrder !== 'newest';

  useEffect(() => {
    if (!initialResetDoneRef.current) {
      initialResetDoneRef.current = true;
      setGalleryResetToken((prev) => prev + 1);
    }

    const subscription = AppState.addEventListener('change', (state) => {
      const wasBackground = appStateRef.current === 'background' || appStateRef.current === 'inactive';
      appStateRef.current = state;

      if (state === 'active' && wasBackground) {
        clearSelection();
        setOptimisticExcludedIds([]);
        setGalleryResetToken((prev) => prev + 1);
      }
    });

    return () => subscription.remove();
  }, []);

  useFocusEffect(
    useCallback(() => {
      clearSelection();
      setOptimisticExcludedIds([]);
      const task = InteractionManager.runAfterInteractions(() => {
        void refreshTrash();
        setTimeout(() => {
          void refreshPrivate();
        }, 120);
        setTimeout(() => {
          void refreshAlbums();
        }, 220);
      });

      return () => task.cancel();
    }, [refreshTrash, refreshPrivate, refreshAlbums])
  );

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedIds.includes(asset.id)),
    [assets, selectedIds]
  );

  const toggleSelection = (assetId: string) => {
    setSelectedIds((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]
    );
  };

  const clearSelection = () => {
    setSelectionMode(false);
    setSelectedIds([]);
    setProcessingCurrent(0);
    setProcessingTotal(0);
  };

  const changeMediaFilter = (value: MediaFilter) => {
    clearSelection();
    setMediaFilter(value);
  };

  const changeDateFilter = (value: DateFilter) => {
    clearSelection();
    setDateFilter(value);
  };

  const changeSortOrder = (value: SortOrder) => {
    clearSelection();
    setSortOrder(value);
  };

  const handlePhotoPress = (asset: (typeof assets)[number]) => {
    if (selectionMode) {
      toggleSelection(asset.id);
      return;
    }

    const assetIndex = assets.findIndex((item) => item.id === asset.id);
    setGallerySession(assets);
    router.push({
      pathname: `/photo/${asset.id}`,
      params: {
        uri: asset.uri,
        filename: asset.filename,
        index: String(assetIndex < 0 ? 0 : assetIndex),
      },
    });
  };

  const handlePhotoLongPress = (asset: (typeof assets)[number]) => {
    if (!selectionMode) {
      setSelectionMode(true);
      setSelectedIds([asset.id]);
      return;
    }
    toggleSelection(asset.id);
  };

  const handleShareSelected = async () => {
    if (selectedAssets.length === 0) return;
    try {
      if (selectedAssets.length > 1) {
        Alert.alert('Compartir', 'Por ahora se comparte un archivo a la vez. Se abrira el primero seleccionado.');
      }
      await Share.share({
        title: 'Compartir archivo',
        url: selectedAssets[0].uri,
      });
    } catch (error) {
      console.error('Error sharing selected assets:', error);
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
              setBulkProcessing(true);
              setProcessingTotal(selectedAssets.length);
              const { failed, movedIds } = await moveManyToTrash(selectedAssets, (processed, total) => {
                setProcessingCurrent(processed);
                setProcessingTotal(total);
              });

              if (movedIds.length > 0) {
                setOptimisticExcludedIds((prev) => Array.from(new Set([...prev, ...movedIds])));
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

  const handleMoveToAlbum = async (albumId: string) => {
    if (selectedAssets.length === 0 || bulkProcessing) return;

    try {
      setBulkProcessing(true);
      setProcessingTotal(selectedAssets.length);
      const { failed } = await moveAssetsToAlbum(
        selectedAssets,
        albumId,
        'move',
        (processed, total) => {
          setProcessingCurrent(processed);
          setProcessingTotal(total);
        }
      );
      if (failed > 0) {
        Alert.alert('Atencion', `${failed} elementos no se pudieron mover al album.`);
      }
      setShowAlbumModal(false);
      clearSelection();
      await refreshAlbums();
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleCreateAlbum = async (name: string) => {
    if (selectedAssets.length === 0 || bulkProcessing) return;

    try {
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
    } finally {
      setBulkProcessing(false);
    }
  };

  const handlePrivateSelected = async () => {
    if (selectedAssets.length === 0 || bulkProcessing) return;

    try {
      setBulkProcessing(true);
      setProcessingTotal(selectedAssets.length);
      const { hidden, failed, movedIds } = await hideManyInPrivate(selectedAssets, (processed, total) => {
        setProcessingCurrent(processed);
        setProcessingTotal(total);
      });
      if (movedIds.length > 0) {
        setOptimisticExcludedIds((prev) => Array.from(new Set([...prev, ...movedIds])));
      }
      await refreshPrivate();
      clearSelection();

      if (failed > 0) {
        Alert.alert('Resultado parcial', `${hidden} movidos a privados, ${failed} fallaron.`);
      } else {
        Alert.alert('Listo', `${hidden} elementos movidos a privados.`);
      }
    } finally {
      setBulkProcessing(false);
    }
  };

  if (isUnsupportedExpoGo) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <CameraOff size={64} color={COLORS.textMuted} />
          <Text style={styles.title}>Limitacion de Expo Go</Text>
          <Text style={styles.subtitle}>
            En Android, Expo Go ya no da acceso completo a la galeria. Usa un Development Build para probar esta funcion.
          </Text>
        </View>
      </View>
    );
  }

  if (!isGranted) {
    return (
      <View style={styles.container}>
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          <FilterChip label="Todo" active={mediaFilter === 'all'} onPress={() => changeMediaFilter('all')} />
          <FilterChip label="Fotos" active={mediaFilter === 'photo'} onPress={() => changeMediaFilter('photo')} />
          <FilterChip label="Videos" active={mediaFilter === 'video'} onPress={() => changeMediaFilter('video')} />
          <FilterChip label="Capturas" active={mediaFilter === 'screenshot'} onPress={() => changeMediaFilter('screenshot')} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          <FilterChip label="Todo el tiempo" active={dateFilter === 'all'} onPress={() => changeDateFilter('all')} />
          <FilterChip label="Ultimo mes" active={dateFilter === 'month'} onPress={() => changeDateFilter('month')} />
          <FilterChip label="Ultimo año" active={dateFilter === 'year'} onPress={() => changeDateFilter('year')} />
          <FilterChip label="Recientes" active={sortOrder === 'newest'} onPress={() => changeSortOrder('newest')} />
          <FilterChip label="Antiguas" active={sortOrder === 'oldest'} onPress={() => changeSortOrder('oldest')} />
        </ScrollView>
        <View style={styles.filtersInfoRow}>
          <Text style={styles.filtersInfoText}>
            {loading ? 'Actualizando...' : `${assets.length} elementos`} {hasActiveFilters ? 'filtrados' : 'totales'}
          </Text>
          {hasActiveFilters ? (
            <TouchableOpacity
              onPress={() => {
                changeMediaFilter('all');
                changeDateFilter('all');
                changeSortOrder('newest');
              }}
              style={styles.resetFiltersButton}
            >
              <Text style={styles.resetFiltersButtonText}>Limpiar filtros</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {selectionMode ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>{selectedIds.length} seleccionadas</Text>
          {bulkProcessing ? (
            <Text style={styles.processingText}>Procesando {processingCurrent}/{processingTotal}</Text>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectionActions}>
            <TouchableOpacity
              style={styles.selectionButton}
              onPress={() => setShowAlbumModal(true)}
              disabled={bulkProcessing}
            >
              <FolderInput size={18} color={COLORS.text} />
              <Text style={styles.selectionButtonText}>Album</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.selectionButton}
              onPress={handlePrivateSelected}
              disabled={bulkProcessing}
            >
              <Lock size={18} color={COLORS.text} />
              <Text style={styles.selectionButtonText}>{bulkProcessing ? 'Procesando...' : 'Privar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionButton} onPress={handleShareSelected}>
              <Share2 size={18} color={COLORS.text} />
              <Text style={styles.selectionButtonText}>Compartir</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.selectionButton, styles.selectionDelete, bulkProcessing && styles.selectionButtonDisabled]}
              onPress={handleDeleteSelected}
              disabled={bulkProcessing}
            >
              <Trash2 size={18} color={COLORS.text} />
              <Text style={styles.selectionButtonText}>{bulkProcessing ? 'Procesando...' : 'Borrar'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.selectionButton} onPress={clearSelection}>
              <X size={18} color={COLORS.text} />
              <Text style={styles.selectionButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      ) : null}

      {!loading && assets.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No hay resultados para este filtro</Text>
          <Text style={styles.emptySubtitle}>Prueba con otro tipo de medio o rango de fechas.</Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => {
              changeMediaFilter('all');
              changeDateFilter('all');
              changeSortOrder('newest');
            }}
          >
            <Text style={styles.emptyButtonText}>Restablecer filtros</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <PhotoGrid
            listKey={`${mediaFilter}-${dateFilter}-${sortOrder}-${galleryResetToken}`}
          resetScrollToken={galleryResetToken}
          photos={assets}
          onLoadMore={loadMore}
          loading={loading}
          onPhotoPress={handlePhotoPress}
          onPhotoLongPress={handlePhotoLongPress}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
        />
      )}

      <AlbumManagerModal
        visible={showAlbumModal}
        processing={bulkProcessing}
        albums={albums}
        loadingAlbums={loadingAlbums}
        onClose={() => setShowAlbumModal(false)}
        onMoveToAlbum={handleMoveToAlbum}
        onCreateAlbum={handleCreateAlbum}
      />
    </View>
  );
}

interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function FilterChip({ label, active, onPress }: FilterChipProps) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
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
  filtersContainer: {
    paddingTop: SPACING.sm,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filtersRow: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  filtersInfoRow: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filtersInfoText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  resetFiltersButton: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  resetFiltersButtonText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '700',
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#241934',
  },
  chipText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: COLORS.primary,
  },
  selectionBar: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  selectionCount: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  processingText: {
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.border,
  },
  selectionDelete: {
    backgroundColor: COLORS.error,
  },
  selectionButtonDisabled: {
    opacity: 0.65,
  },
  selectionButtonText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.sm,
  },
  emptyTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: 999,
  },
  emptyButtonText: {
    color: COLORS.background,
    fontWeight: '700',
  },
});
