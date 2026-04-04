import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { COLORS, SPACING } from '../constants/theme';

interface Props {
  visible: boolean;
  processing: boolean;
  albums: MediaLibrary.Album[];
  loadingAlbums: boolean;
  onClose: () => void;
  onMoveToAlbum: (albumId: string) => Promise<void>;
  onCreateAlbum: (albumName: string) => Promise<void>;
}

export default function AlbumManagerModal({
  visible,
  processing,
  albums,
  loadingAlbums,
  onClose,
  onMoveToAlbum,
  onCreateAlbum,
}: Props) {
  const [name, setName] = useState('');

  const handleCreate = async () => {
    const clean = name.trim();
    if (!clean) return;
    await onCreateAlbum(clean);
    setName('');
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.panel} onPress={(event) => event.stopPropagation()}>
          <Text style={styles.title}>Mover a album</Text>

          <View style={styles.createRow}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Nuevo album"
              placeholderTextColor={COLORS.textMuted}
              editable={!processing}
            />
            <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={processing}>
              <Text style={styles.createBtnText}>Crear</Text>
            </TouchableOpacity>
          </View>

          {loadingAlbums ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : (
            <FlatList
              data={albums}
              keyExtractor={(item) => item.id}
              style={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.albumItem}
                  disabled={processing}
                  onPress={() => onMoveToAlbum(item.id)}
                >
                  <Text numberOfLines={1} style={styles.albumTitle}>{item.title}</Text>
                  <Text style={styles.albumMeta}>{item.assetCount || 0}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.empty}>No hay albumes disponibles</Text>}
            />
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Cerrar</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  panel: {
    width: '100%',
    maxHeight: '75%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  title: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  createRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    color: COLORS.text,
    height: 42,
  },
  createBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    height: 42,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: {
    color: COLORS.background,
    fontWeight: '700',
  },
  list: {
    maxHeight: 320,
  },
  albumItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  albumTitle: {
    color: COLORS.text,
    fontSize: 14,
    flex: 1,
    marginRight: 10,
  },
  albumMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  loadingWrap: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  empty: {
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
  closeBtn: {
    marginTop: SPACING.md,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeText: {
    color: COLORS.textMuted,
    fontWeight: '600',
  },
});
