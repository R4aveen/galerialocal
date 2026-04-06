import React, { memo, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../../theme/AppThemeContext';

interface MonthHeaderProps {
  label: string;
}

function MonthHeader({ label }: MonthHeaderProps) {
  const { colors, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  return <Text style={styles.sectionHeader}>{label}</Text>;
}

export default memo(MonthHeader);

const createStyles = (
  colors: { primary: string; surface: string; text: string; border: string },
  mode: 'dark' | 'light'
) => StyleSheet.create({
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    backgroundColor: mode === 'light' ? colors.surface : 'rgba(18,18,18,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: mode === 'light' ? colors.border : 'rgba(255,255,255,0.06)',
  },
});
