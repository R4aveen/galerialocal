import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { SPACING } from '../../constants/theme';
import { Star } from 'lucide-react-native';
import { ThemeColors, useAppTheme } from '../../theme/AppThemeContext';

export default function FavoritesScreen() {
  const { colors, mode } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors, mode), [colors, mode]);

  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <Star size={48} color={colors.textMuted} />
        <Text style={styles.text}>Tus fotos favoritas aparecerán aquí</Text>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors, mode: 'dark' | 'light') => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: colors.textMuted,
    marginTop: SPACING.md,
    fontSize: 16,
  },
});
