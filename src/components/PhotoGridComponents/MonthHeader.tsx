import React, { memo } from 'react';
import { StyleSheet, Text } from 'react-native';

interface MonthHeaderProps {
  label: string;
}

function MonthHeader({ label }: MonthHeaderProps) {
  return <Text style={styles.sectionHeader}>{label}</Text>;
}

export default memo(MonthHeader);

const styles = StyleSheet.create({
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    fontSize: 14,
    fontWeight: '600',
    color: '#BB86FC',
    backgroundColor: '#121212',
  },
});
