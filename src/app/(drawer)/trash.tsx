import React, { useState, useCallback } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, Alert, useWindowDimensions, Modal, SafeAreaView, ActivityIndicator } from 'react-native';
import { COLORS, SPACING } from '../../constants/theme';
import { Trash2, Trash, RotateCcw, X, CheckSquare, Square, Info } from 'lucide-react-native';
import { useTrash, TrashItem } from '../../hooks/useTrash';
import { Image } from 'expo-image';

export default function TrashScreen() {
  const { trashItems, emptyTrash, restoreFromTrash, deletePermanently } = useTrash();
  const { width } = useWindowDimensions();
  const NUM_COLUMNS = 4;
  const GAP = 2;
  const imageSize = (width - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<TrashItem | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const selectionMode = selectedIds.size > 0;

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleEmptyTrash = () => {
    Alert.alert(
      'Vaciar papelera',
      '¿Estás seguro de que deseas eliminar permanentemente todas las imágenes de la papelera? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Vaciar',
          style: 'destructive',
          onPress: async () => {
            const success = await emptyTrash();
            if (!success) {
              Alert.alert('Error', 'No se pudo vaciar completamente la papelera.');
            }
            setSelectedIds(new Set());
          },
        },
      ]
    );
  };

  const handleRestoreSelected = async () => {
    if (selectedIds.size === 0) return;
    setIsProcessing(true);
    const selectedItems = trashItems.filter(i => selectedIds.has(i.id));
    for (const item of selectedItems) {
      if (item.recoverable) {
        await restoreFromTrash(item);
      }
    }
    setSelectedIds(new Set());
    setIsProcessing(false);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      'Eliminar imágenes',
      `¿Deseas eliminar permanentemente estas ${selectedIds.size} imágenes?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            const selectedItems = trashItems.filter(i => selectedIds.has(i.id));
            for (const item of selectedItems) {
              await deletePermanently(item);
            }
            setSelectedIds(new Set());
            setIsProcessing(false);
          },
        },
      ]
    );
  };

  const handleItemPress = (item: TrashItem) => {
    if (selectionMode) {
      toggleSelection(item.id);
    } else {
      setPreviewItem(item);
    }
  };

  const handleItemLongPress = (item: TrashItem) => {
    if (!selectionMode) {
      toggleSelection(item.id);
    }
  };

  const renderItem = ({ item }: { item: TrashItem }) => {
    const isSelected = selectedIds.has(item.id);
    
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => handleItemPress(item)}
        onLongPress={() => handleItemLongPress(item)}
        style={{
          width: imageSize,
          height: imageSize,
          marginBottom: GAP,
          marginRight: GAP,
        }}
      >
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: item.uri }}
            style={[
              styles.thumbnail,
              isSelected && styles.thumbnailSelected
            ]}
            contentFit="cover"
            transition={200}
          />
          {isSelected && (
            <View style={styles.checkOverlay}>
              <CheckSquare size={20} color={COLORS.primary} fill="#fff" />
            </View>
          )}
          {selectionMode && !isSelected && (
            <View style={styles.checkOverlay}>
              <Square size={20} color="rgba(255,255,255,0.8)" />
            </View>
          )}
          {!item.recoverable && (
            <View style={styles.warningOverlay}>
              <Text style={styles.warningText}>!</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (trashItems.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Trash2 size={48} color={COLORS.textMuted} />
          <Text style={styles.text}>La papelera está vacía</Text>
          <Text style={styles.subtext}>Las fotos borradas se guardan por 30 días</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Bar adaptada al modo selección */}
      {selectionMode ? (
        <View style={styles.selectionTopBar}>
          <View style={styles.selectionCount}>
            <TouchableOpacity onPress={() => setSelectedIds(new Set())} style={styles.iconBtn}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.selectionText}>{selectedIds.size} seleccionados</Text>
          </View>
          <View style={styles.selectionActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={handleRestoreSelected}>
              <RotateCcw size={22} color={COLORS.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconBtn, { marginLeft: 16 }]} onPress={handleDeleteSelected}>
              <Trash size={22} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.topBar}>
          <Text style={styles.topBarText}>{trashItems.length} elementos</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={handleEmptyTrash}>
            <Trash size={18} color="#fff" />
            <Text style={styles.emptyButtonText}>Vaciar papelera</Text>
          </TouchableOpacity>
        </View>
      )}

      {isProcessing && (
        <View style={styles.overlayProcessing}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.processingText}>Procesando...</Text>
        </View>
      )}

      <FlatList
        data={trashItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLUMNS}
        contentContainerStyle={[styles.list, isProcessing && { opacity: 0.5 }]}
      />

      {/* Modal de Previsualización */}
      <Modal
        visible={previewItem !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewItem(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setPreviewItem(null)} style={styles.iconBtn}>
              <X size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Vista previa</Text>
            <View style={{ width: 28 }} />
          </View>
          
          {previewItem && (
            <View style={{ flex: 1 }}>
              <Image 
                source={{ uri: previewItem.uri }} 
                style={styles.fullImage} 
                contentFit="contain" 
              />
              <View style={styles.modalFooter}>
                <View style={styles.infoBox}>
                  <Info size={16} color="#aaa" />
                  <Text style={styles.infoText}>
                    Eliminado hace {Math.round((Date.now() - previewItem.deleted_at) / (1000 * 60 * 60 * 24))} días
                  </Text>
                </View>
                {!previewItem.recoverable && (
                  <Text style={styles.unrecoverableText}>No se puede restaurar por permisos</Text>
                )}
                <View style={styles.modalActions}>
                  <TouchableOpacity 
                    style={[styles.modalActionBtn, !previewItem.recoverable && { opacity: 0.5 }]} 
                    disabled={!previewItem.recoverable}
                    onPress={async () => {
                      if (previewItem.recoverable) {
                        setIsProcessing(true);
                        await restoreFromTrash(previewItem);
                        setIsProcessing(false);
                        setPreviewItem(null);
                      }
                    }}
                  >
                    <RotateCcw size={20} color="#fff" />
                    <Text style={styles.modalActionText}>Restaurar</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.modalActionBtn, { backgroundColor: COLORS.error }]} 
                    onPress={() => {
                      Alert.alert('Borrar permanentemente', 'Esta acción no se puede deshacer.', [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Borrar', style: 'destructive', onPress: async () => {
                            setIsProcessing(true);
                            await deletePermanently(previewItem);
                            setIsProcessing(false);
                            setPreviewItem(null);
                          } 
                        }
                      ]);
                    }}
                  >
                    <Trash size={20} color="#fff" />
                    <Text style={styles.modalActionText}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  selectionTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    elevation: 2,
  },
  selectionCount: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginLeft: SPACING.sm,
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: SPACING.sm,
  },
  iconBtn: {
    padding: SPACING.xs,
  },
  topBarText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500',
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.error,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: '#fff',
    marginLeft: 6,
    fontWeight: '600',
    fontSize: 14,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  list: {
    paddingBottom: SPACING.xl,
  },
  imageContainer: {
    flex: 1,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.border,
  },
  thumbnailSelected: {
    transform: [{ scale: 0.85 }],
    borderRadius: 8,
  },
  checkOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 2,
  },
  warningOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: COLORS.error,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  warningText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  text: {
    color: COLORS.text,
    marginTop: SPACING.md,
    fontSize: 18,
    fontWeight: '600',
  },
  subtext: {
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    fontSize: 14,
    textAlign: 'center',
  },
  overlayProcessing: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.md,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  fullImage: {
    flex: 1,
    width: '100%',
  },
  modalFooter: {
    padding: SPACING.lg,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  infoText: {
    color: '#aaa',
    marginLeft: 8,
    fontSize: 14,
  },
  unrecoverableText: {
    color: COLORS.error,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  modalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  modalActionText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: 'bold',
    fontSize: 16,
  },
});
