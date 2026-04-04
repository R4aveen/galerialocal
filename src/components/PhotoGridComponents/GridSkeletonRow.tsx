import React from 'react';
import { View, StyleSheet } from 'react-native';

interface GridSkeletonProps {
  columns: number;
  itemSize: number;
  itemKey: string;
}

export default function GridSkeletonRow({ columns, itemSize, itemKey }: GridSkeletonProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: columns }).map((_, idx) => (
        <View 
          key={`skeleton-cell-${itemKey}-${idx}`} 
          style={[{ width: itemSize }, styles.skeletonCell]} 
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  skeletonCell: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.04)',
  },
});
