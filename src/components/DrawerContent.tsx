import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { COLORS, SPACING } from '../constants/theme';
import { useTrash } from '../hooks/useTrash';

export default function CustomDrawerContent(props: any) {
  const { trashItems } = useTrash();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.surface }}>
      <View style={styles.header}>
        <Text style={styles.appName}>GaleriaLocal</Text>
        <Text style={styles.version}>v1.0.0 MVP</Text>
      </View>
      
      <DrawerContentScrollView {...props}>
        <DrawerItemList {...props} />
      </DrawerContentScrollView>

      <View style={styles.footer}>
        <View style={styles.trashBadge}>
          <Text style={styles.trashText}>
            {trashItems.length} ítems en papelera
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: SPACING.xl,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  appName: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: 'bold',
  },
  version: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  trashBadge: {
    backgroundColor: COLORS.border,
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  trashText: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
});
