import * as MediaLibrary from 'expo-media-library';
import { getPersistedTimestamps, upsertPersistedTimestamps } from '../db/mediaTimestampCache';
import { getAssetIdentityKey } from './mediaAssets';
import {
  getFromJsonCache,
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

const getTimestampCacheKey = (asset: MediaLibrary.Asset) => getAssetIdentityKey(asset);

const normalizeTimestamp = (value?: number | null) => {
  'worklet';
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
  'worklet';
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
  'worklet';
  const creation = normalizeTimestamp(asset.creationTime);
  if (creation != null) return creation;

  const modification = normalizeTimestamp((asset as any).modificationTime);
  if (modification != null) return modification;

  const fromFilename = timestampFromFilename(asset.filename);
  if (fromFilename != null) return fromFilename;

  // Fallback to MIN_REASONABLE_TS if totally unparseable
  return MIN_REASONABLE_TS;
};

const getNormalizedCachedTimestamp = (value?: number | null) => {
  const normalized = normalizeTimestamp(value);
  return normalized ?? null;
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
      const normalized = getNormalizedCachedTimestamp(ts);
      if (normalized != null && !timestampCache.has(id)) {
        timestampCache.set(id, normalized);
      }
    });
  }

  const missing = assets.filter((asset) => {
    const cacheKey = getTimestampCacheKey(asset);
    const legacyKey = asset.id;

    if (timestampCache.has(cacheKey)) return false;
    const fromJson = getNormalizedCachedTimestamp(getFromJsonCache(cacheKey));
    if (fromJson != null) {
      timestampCache.set(cacheKey, fromJson);
      return false;
    }

    const fromLegacyJson = getNormalizedCachedTimestamp(getFromJsonCache(legacyKey));
    if (fromLegacyJson != null) {
      timestampCache.set(cacheKey, fromLegacyJson);
      setInJsonCacheSingle(cacheKey, fromLegacyJson);
      queuePersistTimestamp(cacheKey, fromLegacyJson);
      return false;
    }

    return true;
  });

  if (missing.length === 0) return;

  try {
    // Try identity-key first and legacy id as compatibility fallback.
    const identityKeys = missing.map((asset) => getTimestampCacheKey(asset));
    const legacyKeys = missing.map((asset) => asset.id);
    const persisted = await getPersistedTimestamps(Array.from(new Set([...identityKeys, ...legacyKeys])));

    missing.forEach((asset) => {
      const cacheKey = getTimestampCacheKey(asset);
      const legacyKey = asset.id;

      const fromIdentityDb = getNormalizedCachedTimestamp(persisted.get(cacheKey));
      if (fromIdentityDb != null) {
        timestampCache.set(cacheKey, fromIdentityDb);
        setInJsonCacheSingle(cacheKey, fromIdentityDb);
        return;
      }

      const fromLegacyDb = getNormalizedCachedTimestamp(persisted.get(legacyKey));
      if (fromLegacyDb != null) {
        timestampCache.set(cacheKey, fromLegacyDb);
        setInJsonCacheSingle(cacheKey, fromLegacyDb);
        queuePersistTimestamp(cacheKey, fromLegacyDb);
        return;
      }

      const computed = computeTimestamp(asset);
      timestampCache.set(cacheKey, computed);
      setInJsonCacheSingle(cacheKey, computed);
      queuePersistTimestamp(cacheKey, computed);
    });
  } catch (error) {
    // If SQLite read fails, fall back to pure in-memory behavior
    missing.forEach((asset) => {
      const cacheKey = getTimestampCacheKey(asset);
      const computed = computeTimestamp(asset);
      timestampCache.set(cacheKey, computed);
      setInJsonCacheSingle(cacheKey, computed);
    });
  }
};

export const getSafeAssetTimestamp = (asset: MediaLibrary.Asset) => {
  'worklet';
  const cacheKey = getTimestampCacheKey(asset);
  const legacyKey = asset.id;

  // Level 1: Check JSON Cache (instant, no async)
  const fromJson = getNormalizedCachedTimestamp(getFromJsonCache(cacheKey));
  if (fromJson != null) {
    if (!timestampCache.has(cacheKey)) {
      timestampCache.set(cacheKey, fromJson);
    }
    return fromJson;
  }

  const fromLegacyJson = getNormalizedCachedTimestamp(getFromJsonCache(legacyKey));
  if (fromLegacyJson != null) {
    if (!timestampCache.has(cacheKey)) {
      timestampCache.set(cacheKey, fromLegacyJson);
    }
    setInJsonCacheSingle(cacheKey, fromLegacyJson);
    queuePersistTimestamp(cacheKey, fromLegacyJson);
    return fromLegacyJson;
  }

  // Level 2: Check in-memory cache
  const cached = timestampCache.get(cacheKey);
  if (cached != null) return cached;

  // Level 3: Compute and queue for persistence
  const computed = computeTimestamp(asset);
  timestampCache.set(cacheKey, computed);
  setInJsonCacheSingle(cacheKey, computed);
  queuePersistTimestamp(cacheKey, computed);
  return computed;
};

export const sortAssetsByTimestamp = (assets: MediaLibrary.Asset[], sortOrder: 'newest' | 'oldest') => {
  'worklet';
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
