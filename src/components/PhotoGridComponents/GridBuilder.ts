import * as MediaLibrary from 'expo-media-library';
import { getSafeAssetTimestamp } from '../../utils/mediaDate';

export const HEADER_HEIGHT = 32;

export type GridHeaderRow = {
  key: string;
  type: 'header';
  monthKey: string;
  label: string;
};

export type GridAssetRow = {
  key: string;
  type: 'row';
  monthKey: string;
  assets: any[]; // Usando any momentáneamente para la compatibilidad rápida o MediaLibrary.Asset
};

export type GridSkeletonRow = {
  key: string;
  type: 'skeleton';
};

export type GridRow = GridHeaderRow | GridAssetRow | GridSkeletonRow;

export type MonthAnchor = {
  monthKey: string;
  label: string;
  year: string;
  index: number;
};

export type YearAnchor = {
  year: string;
  monthKey: string;
  label: string;
  index: number;
  offset: number;
};

interface GridModelOutput {
  rows: GridRow[];
  labelByIndex: string[];
  monthKeyByIndex: string[];
  monthAnchors: MonthAnchor[];
  monthAnchorIndexByKey: Map<string, number>;
  yearAnchors: YearAnchor[];
  offsetByIndex: Map<number, number>;
}

/**
 * Función PURA que agrupa los assets por mes/año y distribuye las filas de thumbnails.
 * Al estar extraída, limpia el PhotoGrid y sienta la base para usar Workers o Worklets más adelante.
 */
export function buildGridModel(photos: any[], columns: number, rowHeight: number): GridModelOutput {
  const rows: GridRow[] = [];
  const labelByIndex: string[] = [];
  const monthKeyByIndex: string[] = [];
  const monthAnchors: MonthAnchor[] = [];
  const offsetByIndex = new Map<number, number>();
  let runningOffset = 0;

  const monthLabel = (timestampMs: number) => {
    const date = new Date(timestampMs);
    const label = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return { label, year, monthKey: `${year}-${month}` };
  };

  let currentMonthKey: string | null = null;
  let currentLabel = '';
  let currentChunk: any[] = [];

  const flushChunk = () => {
    if (!currentMonthKey || currentChunk.length === 0) return;
    const rowIndex = rows.length;
    offsetByIndex.set(rowIndex, runningOffset);
    rows.push({
      key: `${currentMonthKey}-row-${rowIndex}`,
      type: 'row',
      monthKey: currentMonthKey,
      assets: currentChunk,
    });
    runningOffset += rowHeight;
    labelByIndex[rowIndex] = currentLabel;
    monthKeyByIndex[rowIndex] = currentMonthKey;
    currentChunk = [];
  };

  photos.forEach((asset, idx) => {
    const info = monthLabel(getSafeAssetTimestamp(asset));
    const monthChanged = info.monthKey !== currentMonthKey;

    if (monthChanged) {
      flushChunk();

      const headerIndex = rows.length;
      offsetByIndex.set(headerIndex, runningOffset);
      rows.push({
        key: `${info.monthKey}-header-${idx}`,
        type: 'header',
        monthKey: info.monthKey,
        label: info.label,
      });
      runningOffset += HEADER_HEIGHT;

      labelByIndex[headerIndex] = info.label;
      monthKeyByIndex[headerIndex] = info.monthKey;
      monthAnchors.push({ monthKey: info.monthKey, label: info.label, year: info.year, index: headerIndex });

      currentMonthKey = info.monthKey;
      currentLabel = info.label;
    }

    currentChunk.push(asset);
    if (currentChunk.length === columns) {
      flushChunk();
    }
  });

  flushChunk();

  const uniqueMonthAnchors: MonthAnchor[] = [];
  const seenMonths = new Set<string>();
  monthAnchors.forEach((anchor) => {
    if (seenMonths.has(anchor.monthKey)) return;
    seenMonths.add(anchor.monthKey);
    uniqueMonthAnchors.push(anchor);
  });

  const monthAnchorIndexByKey = new Map<string, number>();
  uniqueMonthAnchors.forEach((anchor) => {
    monthAnchorIndexByKey.set(anchor.monthKey, anchor.index);
  });

  const yearAnchors: YearAnchor[] = [];
  const seenYears = new Set<string>();
  uniqueMonthAnchors.forEach((anchor) => {
    if (seenYears.has(anchor.year)) return;
    seenYears.add(anchor.year);
    yearAnchors.push({
      year: anchor.year,
      monthKey: anchor.monthKey,
      label: anchor.label,
      index: anchor.index,
      offset: offsetByIndex.get(anchor.index) || 0,
    });
  });

  return {
    rows,
    labelByIndex,
    monthKeyByIndex,
    monthAnchors: uniqueMonthAnchors,
    monthAnchorIndexByKey,
    yearAnchors,
    offsetByIndex,
  };
}