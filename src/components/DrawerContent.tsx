import React from 'react';
import { Alert, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { SPACING } from '../constants/theme';
import { useTrash } from '../hooks/useTrash';
import { useAppTheme } from '../theme/AppThemeContext';
import storageStatsModule from '../hooks/useStorageStats';

const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};

export default function CustomDrawerContent(props: any) {
  const { trashItems } = useTrash();
  const safeUseStorageStats: typeof storageStatsModule = typeof storageStatsModule === 'function'
    ? storageStatsModule
    : (() => ({
      loading: false,
      totalBytes: 0,
      freeBytes: 0,
      mediaBytes: 0,
      appBytes: 0,
      cacheBytes: 0,
      trimCache: async () => 0,
      clearCache: async () => 0,
    }));
  const { loading, totalBytes, freeBytes, mediaBytes, appBytes, cacheBytes, trimCache } = safeUseStorageStats();
  const { colors, mode, toggleMode } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={styles.header}>
        <Text style={styles.appName}>galetiki</Text>
        <Text style={styles.version}>v1.5.1</Text>
      </View>
      
      <DrawerContentScrollView {...props}>
        <DrawerItemList {...props} />
      </DrawerContentScrollView>

      <View style={styles.footer}>
        <View style={styles.storageCard}>
          <Text style={styles.storageTitle}>Almacenamiento</Text>
          {loading ? (
            <Text style={styles.storageHint}>Calculando uso del dispositivo...</Text>
          ) : (
            <>
              <Text style={styles.storageLine}>Total equipo: {formatBytes(totalBytes)}</Text>
              <Text style={styles.storageLine}>Imagenes y videos: {formatBytes(mediaBytes)}</Text>
              <Text style={styles.storageLine}>Datos de la app: {formatBytes(appBytes)}</Text>
              <Text style={styles.storageLine}>Cache nativa: {formatBytes(cacheBytes || 0)}</Text>
              <Text style={styles.storageLine}>Libre: {formatBytes(freeBytes)}</Text>
            </>
          )}
        </View>
        <TouchableOpacity
          style={styles.themeButton}
          onPress={async () => {
            try {
              const freed = await trimCache(220 * 1024 * 1024, 72 * 60 * 60 * 1000);
              Alert.alert('Cache optimizada', `Se liberaron ${formatBytes(freed)}.`);
            } catch {
              Alert.alert('Error', 'No se pudo optimizar la cache.');
            }
          }}
        >
          <Text style={styles.themeButtonText}>Optimizar cache</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.themeButton} onPress={toggleMode}>
          <Text style={styles.themeButtonText}>
            {mode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          </Text>
        </TouchableOpacity>
        <View style={styles.trashBadge}>
          <Text style={styles.trashText}>
            {trashItems.length} ítems en papelera
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: {
  border: string;
  primary: string;
  textMuted: string;
  text: string;
}) => StyleSheet.create({
  header: {
    padding: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  appName: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: 'bold',
  },
  version: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: SPACING.sm,
  },
  storageCard: {
    backgroundColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 3,
  },
  storageTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  storageHint: {
    color: colors.textMuted,
    fontSize: 11,
  },
  storageLine: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  themeButton: {
    backgroundColor: colors.border,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  themeButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  trashBadge: {
    backgroundColor: colors.border,
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  trashText: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
