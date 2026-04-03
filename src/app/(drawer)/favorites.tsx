import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { COLORS, SPACING } from '../../constants/theme';
import { Star } from 'lucide-react-native';

export default function FavoritesScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <Star size={48} color={COLORS.textMuted} />
        <Text style={styles.text}>Tus fotos favoritas aparecerán aquí</Text>
      </View>
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
  },
  text: {
    color: COLORS.textMuted,
    marginTop: SPACING.md,
    fontSize: 16,
  },
});
