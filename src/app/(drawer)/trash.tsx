import React from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { COLORS, SPACING } from '../../constants/theme';
import { Trash2, RotateCcw, Trash } from 'lucide-react-native';
import { useTrash, TrashItem } from '../../hooks/useTrash';
import { Image } from 'expo-image';

export default function TrashScreen() {
  const { trashItems, loading, restoreFromTrash, deletePermanently } = useTrash();

  const renderItem = ({ item }: { item: TrashItem }) => (
    <View style={styles.itemCard}>
      {item.uri ? (
        <Image source={{ uri: item.uri }} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailPlaceholder]} />
      )}
      <View style={styles.itemInfo}>
        <Text style={styles.filename} numberOfLines={1}>{item.filename}</Text>
        <Text style={styles.date}>Eliminado hace {Math.round((Date.now() - item.deleted_at) / (1000 * 60 * 60 * 24))} días</Text>
        {!item.recoverable ? (
          <Text style={styles.warningText}>No recuperable (archivo origen sin permisos de lectura)</Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          onPress={() => {
            if (!item.recoverable) {
              Alert.alert('No se puede restaurar', 'Este archivo no se pudo copiar a la papelera privada por permisos del sistema.');
              return;
            }
            restoreFromTrash(item);
          }}
          style={styles.actionButton}
        >
          <RotateCcw size={20} color={COLORS.primary} />
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => {
            Alert.alert('Borrar permanentemente', 'Esta acción no se puede deshacer.', [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Borrar',
                style: 'destructive',
                onPress: async () => {
                  const success = await deletePermanently(item);
                  if (!success) {
                    Alert.alert(
                      'No se pudo borrar del sistema',
                      'Android no permitió eliminar el archivo de la galería. Intenta de nuevo y confirma el diálogo del sistema si aparece.'
                    );
                  }
                },
              }
            ]);
          }} 
          style={styles.actionButton}
        >
          <Trash size={20} color={COLORS.error} />
        </TouchableOpacity>
      </View>
    </View>
  );

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
      <FlatList
        data={trashItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
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
  list: {
    padding: SPACING.md,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  thumbnailPlaceholder: {
    backgroundColor: COLORS.border,
  },
  itemInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  filename: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500',
  },
  date: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  warningText: {
    color: COLORS.error,
    fontSize: 11,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
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
});
