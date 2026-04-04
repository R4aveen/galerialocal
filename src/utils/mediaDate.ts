import * as MediaLibrary from 'expo-media-library';
import { getPersistedTimestamps, upsertPersistedTimestamps } from '../db/mediaTimestampCache';
import {
  getFromJsonCache,
  setInJsonCache,
  setInJsonCacheSingle,
  getAllFromJsonCache,
  initializeJsonCache,
} from './jsonTimestampCache';

const MIN_REASONABLE_TS = new Date('1990-01-01T00:00:00.000Z').getTime();
const MAX_REASONABLE_TS = new Date('2100-01-01T00:00:00.000Z').getTime();
const timestampCache = new Map<string, number>();
const pendingPersist = new Map<string, number>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistRunning = false;
let jsonCacheInitialized = false;

const normalizeTimestamp = (value?: number | null) => {
  if (!value || !Number.isFinite(value) || value <= 0) return null;

  const candidates = [value, value * 1000, Math.floor(value / 1000), Math.floor(value / 1_000_000)];
  for (const candidate of candidates) {
    if (candidate >= MIN_REASONABLE_TS && candidate <= MAX_REASONABLE_TS) {
      return candidate;
    }
  }

  return null;
};

// Keep filename parsing conservative to avoid false positives from random names.
const timestampFromFilename = (name?: string) => {
  if (!name) return null;
  const safe = name.trim();

  const strictPatterns = [
    /(IMG|VID|PXL|MVIMG|Screenshot|Captura)[^\d]*(19\d{2}|20\d{2})([01]\d)([0-3]\d)/i,
    /(IMG|VID|PXL|MVIMG|Screenshot|Captura)[^\d]*(19\d{2}|20\d{2})[^\d]?([01]\d)[^\d]?([0-3]\d)/i,
  ];

  for (const pattern of strictPatterns) {
    const match = safe.match(pattern);
    if (!match) continue;
    const year = Number(match[2]);
    const month = Number(match[3]);
    const day = Number(match[4]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return Date.UTC(year, month - 1, day);
    }
  }

  return null;
};

const queuePersistTimestamp = (id: string, timestamp: number) => {
  pendingPersist.set(id, timestamp);
  if (persistTimer) return;

  persistTimer = setTimeout(() => {
    persistTimer = null;
    void flushPersistQueue();
  }, 240);
};

const flushPersistQueue = async () => {
  if (persistRunning || pendingPersist.size === 0) return;
  persistRunning = true;

  const batch = Array.from(pendingPersist.entries()).map(([id, timestamp]) => ({ id, timestamp }));
  pendingPersist.clear();

  try {
    await upsertPersistedTimestamps(batch);
  } catch (error) {
    console.error('Error persisting media timestamp cache:', error);
  } finally {
    persistRunning = false;
    if (pendingPersist.size > 0) {
      void flushPersistQueue();
    }
  }
};

const computeTimestamp = (asset: MediaLibrary.Asset) => {
  const creation = normalizeTimestamp(asset.creationTime);
  if (creation != null) return creation;

  const modification = normalizeTimestamp((asset as any).modificationTime);
  if (modification != null) return modification;

  // Filename parsing is deferred to background hydration; use MIN_REASONABLE_TS immediately:
  return MIN_REASONABLE_TS;
};

export const hydrateTimestampCache = async (assets: MediaLibrary.Asset[]) => {
  if (assets.length === 0) return;

  // First, try to initialize JSON cache on first call
  if (!jsonCacheInitialized) {
    await initializeJsonCache();
    jsonCacheInitialized = true;

    // Populate in-memory cache from JSON
    const fromJson = getAllFromJsonCache();
    fromJson.forEach((ts, id) => {
      if (!timestampCache.has(id)) {
        timestampCache.set(id, ts);
      }
    });
  }

  const missing = assets.filter((asset) => {
    if (timestampCache.has(asset.id)) return false;
    const fromJson = getFromJsonCache(asset.id);
    if (fromJson != null) {
      timestampCache.set(asset.id, fromJson);
      return false;
    }
    return true;
  });

  if (missing.length === 0) return;

  try {
    // Try to load from SQLite
    const persisted = await getPersistedTimestamps(missing.map((asset) => asset.id));
    missing.forEach((asset) => {
      const fromDb = persisted.get(asset.id);
      if (fromDb != null) {
        timestampCache.set(asset.id, fromDb);
        setInJsonCacheSingle(asset.id, fromDb);
        return;
      }

      const computed = computeTimestamp(asset);
      timestampCache.set(asset.id, computed);
      setInJsonCacheSingle(asset.id, computed);
      queuePersistTimestamp(asset.id, computed);
    });
  } catch (error) {
    // If SQLite read fails, fall back to pure in-memory behavior
    missing.forEach((asset) => {
      const computed = computeTimestamp(asset);
      timestampCache.set(asset.id, computed);
      setInJsonCacheSingle(asset.id, computed);
    });
  }
};

export const getSafeAssetTimestamp = (asset: MediaLibrary.Asset) => {
  // Level 1: Check JSON Cache (instant, no async)
  const fromJson = getFromJsonCache(asset.id);
  if (fromJson != null) {
    if (!timestampCache.has(asset.id)) {
      timestampCache.set(asset.id, fromJson);
    }
    return fromJson;
  }

  // Level 2: Check in-memory cache
  const cached = timestampCache.get(asset.id);
  if (cached != null) return cached;

  // Level 3: Compute and queue for persistence
  const computed = computeTimestamp(asset);
  timestampCache.set(asset.id, computed);
  setInJsonCacheSingle(asset.id, computed);
  queuePersistTimestamp(asset.id, computed);
  return computed;
};

export const sortAssetsByTimestamp = (assets: MediaLibrary.Asset[], sortOrder: 'newest' | 'oldest') => {
  const direction = sortOrder === 'oldest' ? 1 : -1;
  return [...assets].sort((a, b) => {
    const diff = getSafeAssetTimestamp(a) - getSafeAssetTimestamp(b);
    if (diff !== 0) return diff * direction;
    return a.id.localeCompare(b.id) * direction;
  });
};

/**
 * Initialization: Call once at app startup to load JSON cache.
 */
export async function initTimestampCaching() {
  if (!jsonCacheInitialized) {
    await initializeJsonCache();
    jsonCacheInitialized = true;
  }
}
