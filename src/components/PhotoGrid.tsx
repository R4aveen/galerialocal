import { GridRow, GridSkeletonRow, buildGridModel, HEADER_HEIGHT } from "./PhotoGridComponents/GridBuilder";
import MonthHeader from './PhotoGridComponents/MonthHeader';
import AssetRow from './PhotoGridComponents/AssetRow';
import { TimelineRail } from './PhotoGridComponents/TimelineRail';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as MediaLibrary from 'expo-media-library';
import PhotoThumbnail from './PhotoThumbnail';
import { COLORS } from '../constants/theme';
import { getSafeAssetTimestamp } from '../utils/mediaDate';

const COLUMNS = 3;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_SIZE = SCREEN_WIDTH / COLUMNS;
const ROW_HEIGHT = ITEM_SIZE;
const SCRUB_THROTTLE_MS = 85;

interface Props {
  listKey?: string;
  resetScrollToken?: number;
  photos: MediaLibrary.Asset[];
  onLoadMore: () => void;
  onPhotoPress: (asset: MediaLibrary.Asset) => void;
  onPhotoLongPress?: (asset: MediaLibrary.Asset) => void;
  loading: boolean;
}

function PhotoGrid({
  listKey,
  resetScrollToken,
  photos,
  onLoadMore,
  onPhotoPress,
  onPhotoLongPress,
  loading,
}: Props) {
  const listRef = useRef<FlashListRef<GridRow> | null>(null);
  const hideOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeMonthRef = useRef<string | null>(null);
  const scrubStartYRef = useRef(0);
  const scrubActiveRef = useRef(false);
  const lastScrubJumpAtRef = useRef(0);
  const lastScrubMonthKeyRef = useRef<string | null>(null);
  const appliedResetTokenRef = useRef<number | null>(null);
  const initialTopAlignedRef = useRef(false);

  const [showDateOverlay, setShowDateOverlay] = useState(false);
  const [overlayLabel, setOverlayLabel] = useState('');
  const [railHeight, setRailHeight] = useState(0);
  const [railVisible, setRailVisible] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [activeMonthKey, setActiveMonthKey] = useState<string | null>(null);
  const [activeYear, setActiveYear] = useState('');

  const skeletonRows = useMemo<GridSkeletonRow[]>(() => {
    if (!loading) return [];
    return Array.from({ length: 6 }).map((_, idx) => ({ key: `skeleton-${idx}`, type: 'skeleton' as const }));
  }, [loading]);

    const gridModel = useMemo(() => buildGridModel(photos, COLUMNS, ROW_HEIGHT), [photos]);

  const scheduleOverlayHide = useCallback(() => {
    if (hideOverlayTimerRef.current) {
      clearTimeout(hideOverlayTimerRef.current);
    }
    hideOverlayTimerRef.current = setTimeout(() => {
      if (isScrubbing) return;
      setShowDateOverlay(false);
      setRailVisible(false);
    }, 460);
  }, [isScrubbing]);

  useEffect(() => {
    return () => {
      if (hideOverlayTimerRef.current) {
        clearTimeout(hideOverlayTimerRef.current);
      }
    };
  }, []);

  const alignToTopNow = useCallback(() => {
    listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
  }, []);

  useEffect(() => {
    initialTopAlignedRef.current = false;
  }, [listKey]);

  useEffect(() => {
    if (resetScrollToken == null) return;
    if (!loading && photos.length === 0) return;
    if (appliedResetTokenRef.current === resetScrollToken) return;

    appliedResetTokenRef.current = resetScrollToken;
    activeMonthRef.current = null;
    lastScrubMonthKeyRef.current = null;
    setActiveMonthKey(null);
    setActiveYear('');
    setOverlayLabel('');
    setShowDateOverlay(false);
    setRailVisible(false);
    setIsScrubbing(false);

    requestAnimationFrame(() => {
      alignToTopNow();
      requestAnimationFrame(() => {
        alignToTopNow();
      });
    });
  }, [alignToTopNow, loading, photos.length, resetScrollToken]);

  useEffect(() => {
    if (loading) return;
    if (photos.length === 0) return;
    if (initialTopAlignedRef.current) return;

    initialTopAlignedRef.current = true;
    requestAnimationFrame(() => {
      alignToTopNow();
      requestAnimationFrame(() => {
        alignToTopNow();
      });
    });
  }, [alignToTopNow, loading, photos.length]);

  const beginTimelineInteraction = useCallback((scrubbing: boolean) => {
    if (hideOverlayTimerRef.current) {
      clearTimeout(hideOverlayTimerRef.current);
    }
    setRailVisible(true);
    setShowDateOverlay(true);
    if (scrubbing) {
      setIsScrubbing(true);
    }
  }, []);

  const jumpToMonth = useCallback((monthKey: string, animated = false) => {
    const anchorIndex = gridModel.monthAnchorIndexByKey.get(monthKey);
    const anchor = gridModel.monthAnchors.find((item) => item.monthKey === monthKey);
    if (anchorIndex == null || !anchor) return;
    if (activeMonthRef.current === monthKey) return;

    activeMonthRef.current = monthKey;
    setActiveMonthKey(monthKey);
    setActiveYear(anchor.year);
    setOverlayLabel(anchor.label);
    setShowDateOverlay(true);
    try {
      listRef.current?.scrollToIndex({ index: anchorIndex, animated, viewPosition: 0 });
    } catch {
      const offset = gridModel.offsetByIndex.get(anchorIndex) || 0;
      listRef.current?.scrollToOffset?.({ offset, animated });
    }
  }, [gridModel.monthAnchorIndexByKey, gridModel.monthAnchors]);

  const yearAnchorFromLocation = useCallback((locationY: number) => {
    if (gridModel.yearAnchors.length <= 1 || railHeight <= 0) return null;
    const slot = railHeight / gridModel.yearAnchors.length;
    const nextIndex = Math.max(0, Math.min(gridModel.yearAnchors.length - 1, Math.floor(locationY / slot)));
    return gridModel.yearAnchors[nextIndex] || null;
  }, [gridModel.yearAnchors, railHeight]);

  const scrubYearByLocation = useCallback((locationY: number) => {
    const nextAnchor = yearAnchorFromLocation(locationY);
    if (!nextAnchor) return;

    setActiveYear(nextAnchor.year);
    setOverlayLabel(nextAnchor.label);

    const now = Date.now();
    if (lastScrubMonthKeyRef.current === nextAnchor.monthKey && now - lastScrubJumpAtRef.current < SCRUB_THROTTLE_MS) {
      return;
    }

    if (now - lastScrubJumpAtRef.current < SCRUB_THROTTLE_MS) {
      return;
    }

    lastScrubJumpAtRef.current = now;
    lastScrubMonthKeyRef.current = nextAnchor.monthKey;
    if (nextAnchor.monthKey !== activeMonthRef.current) {
      jumpToMonth(nextAnchor.monthKey, false);
    }
  }, [jumpToMonth, yearAnchorFromLocation]);

  const activeMonthIndex = useMemo(() => {
    if (!activeMonthKey) return -1;
    return gridModel.monthAnchors.findIndex((item) => item.monthKey === activeMonthKey);
  }, [activeMonthKey, gridModel.monthAnchors]);

  const listRows = useMemo<GridRow[]>(() => {
    return skeletonRows.length > 0 ? [...gridModel.rows, ...skeletonRows] : gridModel.rows;
  }, [gridModel.rows, skeletonRows]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
    let minVisibleIndex: number | null = null;
    viewableItems.forEach((item) => {
      if (typeof item.index !== 'number' || item.index < 0) return;
      if (minVisibleIndex == null || item.index < minVisibleIndex) {
        minVisibleIndex = item.index;
      }
    });
    if (minVisibleIndex == null) return;

    const nextLabel = gridModel.labelByIndex[minVisibleIndex] || '';
    const nextMonthKey = gridModel.monthKeyByIndex[minVisibleIndex] || null;
    if (nextLabel) {
      setOverlayLabel(nextLabel);
    }
    if (nextMonthKey) {
      activeMonthRef.current = nextMonthKey;
      setActiveMonthKey(nextMonthKey);
      setActiveYear(nextMonthKey.split('-')[0] || '');
    }
  }, [gridModel.labelByIndex, gridModel.monthKeyByIndex]);

  return (
    <View style={styles.container}>
      <FlashList<GridRow>
        ref={listRef}
        // Mantener una key estable evita desmontar/remontar toda la lista
        // cada vez que cambia la cantidad de fotos cargadas.
        key={listKey || 'default'}
        // initialScrollIndex={0} // Removido para evitar que el FlashList fuerce el índice 0 durante la paginación
        data={listRows}
        estimatedItemSize={ROW_HEIGHT}
        estimatedListSize={{ width: SCREEN_WIDTH, height: Dimensions.get('window').height }}
        overrideItemLayout={(layout, item) => {
          const nextLayout = layout as any;
          if (item.type === 'header') {
            nextLayout.size = HEADER_HEIGHT;
            return;
          }
          if (item.type === 'skeleton') {
            nextLayout.size = ROW_HEIGHT;
            return;
          }
          nextLayout.size = ROW_HEIGHT;
        }}
        getItemType={(item) => item.type}
        drawDistance={SCREEN_WIDTH * 2}
        initialNumToRender={36}
        maxToRenderPerBatch={24}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return <MonthHeader label={item.label} />;
          }

          if (item.type === 'skeleton') {
            return (
              <View style={[styles.row, { height: ITEM_SIZE }]}>
                {Array.from({ length: COLUMNS }).map((_, idx) => (
                  <View key={`skeleton-cell-${item.key}-${idx}`} style={[styles.cell, styles.skeletonCell]} />
                ))}
              </View>
            );
          }

          return (
            <AssetRow
              itemKey={item.key}
              assets={item.assets}
              columns={COLUMNS}
              itemSize={ITEM_SIZE}
              onPhotoPress={onPhotoPress}
              onPhotoLongPress={onPhotoLongPress}
            />
          );
        }}
        keyExtractor={(item) => item.key}
        onEndReached={onLoadMore}
        onEndReachedThreshold={4}
        removeClippedSubviews={false}
        scrollEventThrottle={16}
        updateCellsBatchingPeriod={30}
        onViewableItemsChanged={onViewableItemsChanged}
        onScrollBeginDrag={() => beginTimelineInteraction(false)}
        onMomentumScrollBegin={() => beginTimelineInteraction(false)}
        onScrollEndDrag={() => {
          setIsScrubbing(false);
          scheduleOverlayHide();
        }}
        onMomentumScrollEnd={() => {
          setIsScrubbing(false);
          scheduleOverlayHide();
        }}
        ListFooterComponent={() => (
          loading ? (
            <View style={styles.footer}>
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : null
        )}
        {...({} as any)}
      />

      {showDateOverlay && overlayLabel ? (
        <View style={styles.dateOverlay} pointerEvents="none">
          <Text style={styles.dateOverlayText}>{overlayLabel}</Text>
        </View>
      ) : null}

      {gridModel.yearAnchors.length > 1 ? (
        <View
          style={styles.edgeGrabZone}
          onLayout={(event) => setRailHeight(event.nativeEvent.layout.height)}
          onStartShouldSetResponder={() => false}
          onMoveShouldSetResponder={(event) => event.nativeEvent.locationX > 16}
          onResponderGrant={(event) => {
            scrubStartYRef.current = event.nativeEvent.locationY;
            scrubActiveRef.current = false;
            beginTimelineInteraction(true);
          }}
          onResponderMove={(event) => {
            const deltaY = Math.abs(event.nativeEvent.locationY - scrubStartYRef.current);
            if (!scrubActiveRef.current) {
              if (deltaY < 8) return;
              scrubActiveRef.current = true;
            }
            scrubYearByLocation(event.nativeEvent.locationY);
          }}
          onResponderRelease={(event) => {
            const wasScrubbing = scrubActiveRef.current;
            scrubActiveRef.current = false;
            setIsScrubbing(false);
            if (wasScrubbing) {
              const finalAnchor = yearAnchorFromLocation(event.nativeEvent.locationY);
              if (finalAnchor && finalAnchor.monthKey !== activeMonthRef.current) {
                jumpToMonth(finalAnchor.monthKey, false);
              }
            }
            scheduleOverlayHide();
          }}
        >
          {railVisible ? (
            <View style={styles.timelineRail}>
              <View style={styles.timelineTrack}>
                {gridModel.yearAnchors.map((yearAnchor, idx) => {
                  const topPercent = gridModel.yearAnchors.length > 1
                    ? (idx / (gridModel.yearAnchors.length - 1)) * 100
                    : 0;
                  return <View key={`dot-${yearAnchor.year}-${idx}`} style={[styles.timelineDot, { top: `${topPercent}%` }]} />;
                })}
                {activeMonthIndex >= 0 ? (
                  <View
                    style={[
                      styles.timelineHandle,
                      {
                        top: `${gridModel.monthAnchors.length > 1
                          ? (activeMonthIndex / (gridModel.monthAnchors.length - 1)) * 100
                          : 0}%`,
                      },
                    ]}
                  />
                ) : null}
              </View>
              {activeYear ? (
                <View style={styles.activeYearBadge}>
                  <Text style={styles.activeYearText}>{activeYear}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default React.memo(PhotoGrid);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  sectionHeader: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize',
    letterSpacing: 0.3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    width: ITEM_SIZE,
  },
  skeletonCell: {
    height: ITEM_SIZE,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.04)',
  },
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
  dateOverlay: {
    position: 'absolute',
    alignSelf: 'center',
    top: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  dateOverlayText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
});
