import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { COLORS } from '../../constants/theme';
import { YearAnchor } from './GridBuilder';

interface TimelineRailProps {
  yearAnchors: YearAnchor[];
  activeMonthIndex: number;
  railVisible: boolean;
  setRailHeight: (height: number) => void;
  beginInteraction: (scrubbing: boolean) => void;
  scrubYearByLocation: (y: number) => void;
  releaseActivePoint: (y: number) => void;
  activeYear: string;
}

export function TimelineRail({
  yearAnchors,
  activeMonthIndex,
  railVisible,
  setRailHeight,
  beginInteraction,
  scrubYearByLocation,
  releaseActivePoint,
  activeYear,
}: TimelineRailProps) {
  if (yearAnchors.length <= 1) return null;

  // el timeline rail es un commponente "flotante" que se suoerpone al grid por lo que no forma parte del layout nornal
  return (
    <View
      style={styles.edgeGrabZone}
      onLayout={(event) => setRailHeight(event.nativeEvent.layout.height)}
      onStartShouldSetResponder={() => false}
      onMoveShouldSetResponder={(event) => event.nativeEvent.locationX > 16}
      onResponderGrant={() => beginInteraction(true)}
      onResponderMove={(event) => scrubYearByLocation(event.nativeEvent.locationY)}
      onResponderRelease={(event) => releaseActivePoint(event.nativeEvent.locationY)}
    >
      {railVisible ? (
        <View style={styles.timelineRail}>
          <View style={styles.timelineTrack}>
            {yearAnchors.map((yearAnchor, idx) => {
              const topPercent = (idx / (yearAnchors.length - 1)) * 100;
              return <View key={`dot-${yearAnchor.year}-${idx}`} style={[styles.timelineDot, { top: `${topPercent}%` }]} />;
            })}
            {activeMonthIndex >= 0 ? (
              <View
                style={[
                  styles.timelineHandle,
                  {
                    top: `${
                      (yearAnchors.findIndex((a) => a.year === activeYear) / Math.max(1, yearAnchors.length - 1)) * 100
                    }%`,
                  },
                ]}
              />
            ) : null}
          </View>
          <View style={styles.activeYearBadge}>
            <Text style={styles.activeYearText}>{activeYear}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  edgeGrabZone: {
    position: 'absolute',
    right: 0,
    top: 20,
    bottom: 20,
    width: 24,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  timelineRail: {
    position: 'absolute',
    right: 2,
    top: 0,
    bottom: 0,
    paddingVertical: 8,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.34)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineTrack: {
    width: 8,
    flex: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
    overflow: 'visible',
    marginBottom: 6,
  },
  timelineDot: {
    position: 'absolute',
    left: -2,
    width: 12,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  timelineHandle: {
    position: 'absolute',
    left: -5,
    width: 18,
    height: 6,
    marginTop: -3,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  activeYearBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  activeYearText: {
    color: COLORS.text,
    fontSize: 10,
    fontWeight: '700',
  },
});
