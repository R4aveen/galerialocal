import { GridRow, GridSkeletonRow, buildGridModel, HEADER_HEIGHT } from "./PhotoGridComponents/GridBuilder";
import MonthHeader from './PhotoGridComponents/MonthHeader';
import AssetRow from './PhotoGridComponents/AssetRow';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View, ActivityIndicator, Text, RefreshControl } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as MediaLibrary from 'expo-media-library';
import { useSelectionStore } from '../store/useSelectionStore';
import { useAppTheme } from '../theme/AppThemeContext';
import { getAssetIdentityKey } from '../utils/mediaAssets';

const COLUMNS = 4;
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
  refreshing?: boolean;
  onRefresh?: () => void;
}

function PhotoGrid({
  listKey,
  resetScrollToken,
  photos,
  onLoadMore,
  onPhotoPress,
  onPhotoLongPress,
  loading,
  refreshing,
  onRefresh,
}: Props) {
  const { colors, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, mode), [colors, mode]);
  const listRef = useRef<FlashListRef<GridRow> | null>(null);
  const containerRef = useRef<View | null>(null);
  const dragSelecting = useSelectionStore(state => state.dragSelecting);
  const selectionMode = useSelectionStore(state => state.selectionMode);
  const hideOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoScrollDirRef = useRef<-1 | 0 | 1>(0);
  const autoScrollTouchYRef = useRef<number | null>(null);
  const containerHeightRef = useRef(0);
  const containerOriginRef = useRef({ x: 0, y: 0 });
  const dragActivationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragTouchActivatedRef = useRef(false);
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

  const scrollOffsetRef = useRef(0);
  const overlayLabelRef = useRef('');
  const activeYearRef = useRef('');
  const lastDragSelectedIndexRef = useRef<number | null>(null);
  const pendingDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragRafRef = useRef<number | null>(null);

  const toContainerPoint = useCallback((touch: any) => {
    const pageX = Number(touch?.pageX ?? 0);
    const pageY = Number(touch?.pageY ?? 0);
    return {
      x: pageX - containerOriginRef.current.x,
      y: pageY - containerOriginRef.current.y,
    };
  }, []);

  const skeletonRows = useMemo<GridSkeletonRow[]>(() => {
    if (!loading) return [];
    return Array.from({ length: 8 }).map((_, idx) => ({ key: `skeleton-${idx}`, type: 'skeleton' as const }));
  }, [loading]);

  const gridModel = useMemo(() => buildGridModel(photos, COLUMNS, ROW_HEIGHT), [photos]);
  const orderedAssetIds = useMemo(() => photos.map((asset) => getAssetIdentityKey(asset as any)), [photos]);
  const orderedIndexById = useMemo(() => {
    const map = new Map<string, number>();
    orderedAssetIds.forEach((id, idx) => map.set(id, idx));
    return map;
  }, [orderedAssetIds]);

  const hitTestAssetId = useCallback(
    (locationX: number, locationY: number, listRows: GridRow[]) => {
      if (locationX < 0 || locationY < 0) return null;
      const contentY = scrollOffsetRef.current + locationY;
      const contentX = locationX;

      // Binary search row index by offset (offsetByIndex is monotonic).
      let lo = 0;
      let hi = listRows.length - 1;
      let idx = -1;

      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const offset = gridModel.offsetByIndex.get(mid) ?? 0;
        if (offset <= contentY) {
          idx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      if (idx < 0 || idx >= listRows.length) return null;
      const row = listRows[idx];
      if (row.type !== 'row') return null;

      const rowOffset = gridModel.offsetByIndex.get(idx) ?? 0;
      const withinRowY = contentY - rowOffset;
      if (withinRowY < 0 || withinRowY > ROW_HEIGHT) return null;

      const col = Math.max(0, Math.min(COLUMNS - 1, Math.floor(contentX / ITEM_SIZE)));
      const asset = (row as any).assets?.[col] as MediaLibrary.Asset | undefined;
      return asset ? getAssetIdentityKey(asset as any) : null;
    },
    [gridModel.offsetByIndex]
  );

  const endDragSelectDelayed = useCallback(() => {
    // Delay to avoid triggering underlying Pressable onPress when the finger is released.
    setTimeout(() => {
      useSelectionStore.getState().endDragSelect();
      lastDragSelectedIndexRef.current = null;
      dragTouchActivatedRef.current = false;
    }, 0);
  }, []);

  const clearDragActivationTimer = useCallback(() => {
    if (dragActivationTimerRef.current) {
      clearTimeout(dragActivationTimerRef.current);
      dragActivationTimerRef.current = null;
    }
  }, []);

  const stopAutoScroll = useCallback(() => {
    autoScrollDirRef.current = 0;
    autoScrollTouchYRef.current = null;
    if (autoScrollTimerRef.current) {
      clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }
  }, []);

  const startAutoScroll = useCallback((dir: -1 | 1) => {
    if (autoScrollDirRef.current === dir && autoScrollTimerRef.current) return;
    autoScrollDirRef.current = dir;
    if (autoScrollTimerRef.current) {
      clearInterval(autoScrollTimerRef.current);
      autoScrollTimerRef.current = null;
    }

    autoScrollTimerRef.current = setInterval(() => {
      const current = scrollOffsetRef.current;
      const viewportHeight = containerHeightRef.current || Dimensions.get('window').height;
      const edge = Math.min(96, Math.max(56, viewportHeight * 0.14));
      const y = autoScrollTouchYRef.current;
      const intensity = y == null
        ? 0.65
        : dir === 1
          ? Math.max(0, Math.min(1, (y - (viewportHeight - edge)) / edge))
          : Math.max(0, Math.min(1, ((edge - y) / edge)));
      const speed = 6 + intensity * 26;
      const next = Math.max(0, current + dir * speed);
      scrollOffsetRef.current = next;
      listRef.current?.scrollToOffset?.({ offset: next, animated: false });
    }, 16);
  }, []);

  const updateAutoScrollAt = useCallback(
    (y: number) => {
      const state = useSelectionStore.getState();
      if (!state.dragSelecting) {
        stopAutoScroll();
        return;
      }

      const viewportHeight = containerHeightRef.current || Dimensions.get('window').height;
      const edge = Math.min(96, Math.max(56, viewportHeight * 0.14));
      if (y < edge) {
        autoScrollTouchYRef.current = y;
        startAutoScroll(-1);
        return;
      }
      if (y > viewportHeight - edge) {
        autoScrollTouchYRef.current = y;
        startAutoScroll(1);
        return;
      }
      autoScrollTouchYRef.current = y;
      stopAutoScroll();
    },
    [startAutoScroll, stopAutoScroll]
  );

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

  const setOverlayLabelIfChanged = useCallback((nextLabel: string) => {
    if (!nextLabel || overlayLabelRef.current === nextLabel) return;
    overlayLabelRef.current = nextLabel;
    setOverlayLabel(nextLabel);
  }, []);

  const setOverlayLabelRefOnly = useCallback((nextLabel: string) => {
    if (!nextLabel || overlayLabelRef.current === nextLabel) return;
    overlayLabelRef.current = nextLabel;
  }, []);

  const setActiveYearIfChanged = useCallback((nextYear: string) => {
    if (!nextYear || activeYearRef.current === nextYear) return;
    activeYearRef.current = nextYear;
    setActiveYear(nextYear);
  }, []);

  const setActiveYearRefOnly = useCallback((nextYear: string) => {
    if (!nextYear || activeYearRef.current === nextYear) return;
    activeYearRef.current = nextYear;
  }, []);

  const setActiveMonthKeyIfChanged = useCallback((nextMonthKey: string | null) => {
    if (!nextMonthKey || activeMonthRef.current === nextMonthKey) return;
    activeMonthRef.current = nextMonthKey;
    setActiveMonthKey(nextMonthKey);
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
    overlayLabelRef.current = '';
    activeYearRef.current = '';
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
    // Sync visual state from refs only when timeline/overlay is actually shown.
    if (overlayLabelRef.current) {
      setOverlayLabel((prev) => (prev === overlayLabelRef.current ? prev : overlayLabelRef.current));
    }
    if (activeYearRef.current) {
      setActiveYear((prev) => (prev === activeYearRef.current ? prev : activeYearRef.current));
    }
    if (activeMonthRef.current) {
      setActiveMonthKey((prev) => (prev === activeMonthRef.current ? prev : activeMonthRef.current));
    }
    setRailVisible((prev) => (prev ? prev : true));
    setShowDateOverlay((prev) => (prev ? prev : true));
    if (scrubbing) {
      setIsScrubbing((prev) => (prev ? prev : true));
    }
  }, []);

  const jumpToMonth = useCallback((monthKey: string, animated = false) => {
    const anchorIndex = gridModel.monthAnchorIndexByKey.get(monthKey);
    const anchor = gridModel.monthAnchors.find((item) => item.monthKey === monthKey);
    if (anchorIndex == null || !anchor) return;
    if (activeMonthRef.current === monthKey) return;

    setActiveMonthKeyIfChanged(monthKey);
    setActiveYearIfChanged(anchor.year);
    setOverlayLabelIfChanged(anchor.label);
    setShowDateOverlay((prev) => (prev ? prev : true));
    try {
      listRef.current?.scrollToIndex({ index: anchorIndex, animated, viewPosition: 0 });
    } catch {
      const offset = gridModel.offsetByIndex.get(anchorIndex) || 0;
      listRef.current?.scrollToOffset?.({ offset, animated });
    }
  }, [gridModel.monthAnchorIndexByKey, gridModel.monthAnchors, gridModel.offsetByIndex, setActiveMonthKeyIfChanged, setActiveYearIfChanged, setOverlayLabelIfChanged]);

  const yearAnchorFromLocation = useCallback((locationY: number) => {
    if (gridModel.yearAnchors.length <= 1 || railHeight <= 0) return null;
    const slot = railHeight / gridModel.yearAnchors.length;
    const nextIndex = Math.max(0, Math.min(gridModel.yearAnchors.length - 1, Math.floor(locationY / slot)));
    return gridModel.yearAnchors[nextIndex] || null;
  }, [gridModel.yearAnchors, railHeight]);

  const scrubYearByLocation = useCallback((locationY: number) => {
    const nextAnchor = yearAnchorFromLocation(locationY);
    if (!nextAnchor) return;

    setActiveYearIfChanged(nextAnchor.year);
    setOverlayLabelIfChanged(nextAnchor.label);

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
  }, [jumpToMonth, setActiveYearIfChanged, setOverlayLabelIfChanged, yearAnchorFromLocation]);

  const activeMonthIndex = useMemo(() => {
    if (!activeMonthKey) return -1;
    return gridModel.monthAnchors.findIndex((item) => item.monthKey === activeMonthKey);
  }, [activeMonthKey, gridModel.monthAnchors]);

  const listRows = useMemo<GridRow[]>(() => {
    return skeletonRows.length > 0 ? [...gridModel.rows, ...skeletonRows] : gridModel.rows;
  }, [gridModel.rows, skeletonRows]);

  const listRowsRef = useRef<GridRow[]>(listRows);
  useEffect(() => {
    listRowsRef.current = listRows;
  }, [listRows]);

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
    const shouldUpdateVisualState = showDateOverlay || railVisible || isScrubbing;

    if (shouldUpdateVisualState) {
      setOverlayLabelIfChanged(nextLabel);
    } else {
      setOverlayLabelRefOnly(nextLabel);
    }

    if (nextMonthKey) {
      if (shouldUpdateVisualState) {
        setActiveMonthKeyIfChanged(nextMonthKey);
        setActiveYearIfChanged(nextMonthKey.split('-')[0] || '');
      } else {
        activeMonthRef.current = nextMonthKey;
        setActiveYearRefOnly(nextMonthKey.split('-')[0] || '');
      }
    }
  }, [
    gridModel.labelByIndex,
    gridModel.monthKeyByIndex,
    isScrubbing,
    railVisible,
    setActiveMonthKeyIfChanged,
    setActiveYearIfChanged,
    setActiveYearRefOnly,
    setOverlayLabelIfChanged,
    setOverlayLabelRefOnly,
    showDateOverlay,
  ]);

  const beginDragSelectingAt = useCallback(
    (x: number, y: number) => {
      const rows = listRowsRef.current;
      const id = hitTestAssetId(x, y, rows);
      if (!id) return;
      const startIndex = orderedIndexById.get(id);
      if (startIndex == null) return;

      const state = useSelectionStore.getState();
      if (!state.selectionMode) {
        state.setSelectionMode(true);
      }
      state.beginDragSelect(id, startIndex, orderedAssetIds);
      lastDragSelectedIndexRef.current = startIndex;
    },
    [hitTestAssetId, orderedAssetIds, orderedIndexById]
  );

  const updateDragSelectingAt = useCallback(
    (x: number, y: number) => {
      const state = useSelectionStore.getState();
      if (!state.dragSelecting) return;

      updateAutoScrollAt(y);

      const rows = listRowsRef.current;

      const id = hitTestAssetId(x, y, rows);
      if (!id) return;
      const currentIndex = orderedIndexById.get(id);
      if (currentIndex == null) return;
      if (lastDragSelectedIndexRef.current === currentIndex) return;
      lastDragSelectedIndexRef.current = currentIndex;
      state.applyDragSelect(currentIndex);
    },
    [hitTestAssetId, orderedIndexById, updateAutoScrollAt]
  );

  const flushDragMove = useCallback(() => {
    dragRafRef.current = null;
    const point = pendingDragPointRef.current;
    if (!point) return;
    pendingDragPointRef.current = null;
    updateDragSelectingAt(point.x, point.y);
  }, [updateDragSelectingAt]);

  useEffect(() => {
    return () => {
      if (dragRafRef.current != null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      pendingDragPointRef.current = null;
    };
  }, []);

  const handleTouchStart = useCallback((event: any) => {
    const touch = event?.nativeEvent?.touches?.[0];
    if (!touch) return;
    const state = useSelectionStore.getState();
    const point = toContainerPoint(touch);

    dragTouchStartRef.current = { x: point.x, y: point.y };
    dragTouchActivatedRef.current = false;
    clearDragActivationTimer();

    dragActivationTimerRef.current = setTimeout(() => {
      const point = dragTouchStartRef.current;
      if (!point) return;
      dragTouchActivatedRef.current = true;
      beginDragSelectingAt(point.x, point.y);
    }, state.selectionMode ? 90 : 220);
  }, [beginDragSelectingAt, clearDragActivationTimer, toContainerPoint]);

  const handleTouchMove = useCallback((event: any) => {
    const touch = event?.nativeEvent?.touches?.[0];
    if (!touch) return;

    const point = toContainerPoint(touch);
    const x = point.x;
    const y = point.y;
    const start = dragTouchStartRef.current;

    if (!dragTouchActivatedRef.current) {
      if (!start) return;
      const dx = x - start.x;
      const dy = y - start.y;
      if (Math.abs(dx) > 42 || Math.abs(dy) > 42) {
        clearDragActivationTimer();
        dragTouchStartRef.current = null;
      }
      return;
    }

    pendingDragPointRef.current = { x, y };
    if (dragRafRef.current == null) {
      dragRafRef.current = requestAnimationFrame(flushDragMove);
    }
  }, [clearDragActivationTimer, flushDragMove, toContainerPoint]);

  const finishTouchDrag = useCallback(() => {
    clearDragActivationTimer();
    dragTouchStartRef.current = null;
    if (!dragTouchActivatedRef.current) return;

    if (dragRafRef.current != null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    const point = pendingDragPointRef.current;
    if (point) {
      pendingDragPointRef.current = null;
      updateDragSelectingAt(point.x, point.y);
    }

    stopAutoScroll();
    endDragSelectDelayed();
  }, [clearDragActivationTimer, endDragSelectDelayed, stopAutoScroll, updateDragSelectingAt]);

  const keyExtractor = useCallback((item: GridRow) => item.key, []);

  const handleListScroll = useCallback((event: any) => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const footerComponent = useMemo(
    () => (
      loading ? (
        <View style={styles.footer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null
    ),
    [colors.primary, loading, styles.footer]
  );

  const renderGridItem = useCallback(({ item }: { item: GridRow }) => {
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
        selectionMode={selectionMode}
        dragSelecting={dragSelecting}
        onPhotoPress={onPhotoPress}
        onPhotoLongPress={onPhotoLongPress}
      />
    );
  }, [dragSelecting, onPhotoLongPress, onPhotoPress, selectionMode, styles.cell, styles.row, styles.skeletonCell]);

  return (
      <View
        ref={containerRef}
        style={styles.container}
        onLayout={(e) => {
          containerHeightRef.current = e.nativeEvent.layout.height;
          requestAnimationFrame(() => {
            containerRef.current?.measureInWindow((x, y) => {
              containerOriginRef.current = { x, y };
            });
          });
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={finishTouchDrag}
        onTouchCancel={finishTouchDrag}
        onMoveShouldSetResponderCapture={() => dragTouchActivatedRef.current}
        onResponderRelease={finishTouchDrag}
        onResponderTerminate={finishTouchDrag}
      >
        <FlashList<GridRow>
          ref={listRef}
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing || false} onRefresh={onRefresh} /> : undefined}
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
          drawDistance={SCREEN_WIDTH * 1.2}
          initialNumToRender={20}
          maxToRenderPerBatch={12}
          renderItem={renderGridItem}
          keyExtractor={keyExtractor}
          onEndReached={onLoadMore}
          onEndReachedThreshold={4}
          removeClippedSubviews
          scrollEnabled={!dragSelecting}
          scrollEventThrottle={16}
          onScroll={handleListScroll}
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
          ListFooterComponent={footerComponent}
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

const createStyles = (colors: { background: string; primary: string; text: string; border: string }, mode: 'dark' | 'light') => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    width: ITEM_SIZE,
  },
  skeletonCell: {
    height: ITEM_SIZE,
    backgroundColor: mode === 'light' ? 'rgba(122,75,42,0.08)' : 'rgba(255,255,255,0.08)',
    borderWidth: 0.5,
    borderColor: mode === 'light' ? 'rgba(122,75,42,0.12)' : 'rgba(255,255,255,0.04)',
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
    backgroundColor: colors.primary,
  },
  activeYearBadge: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  activeYearText: {
    color: colors.text,
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
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
});
