import * as FileSystem from 'expo-file-system/legacy';

// Dynamic path since legacy API has documentDirectory or cacheDirectory
let CACHE_FILE: string = '';

async function getCacheFilePath(): Promise<string> {
  if (!CACHE_FILE) {
    const docDir = FileSystem.documentDirectory;
    if (!docDir) throw new Error('No documentDirectory available');
    CACHE_FILE = docDir + 'galerialocal_timestamps.json';
  }
  return CACHE_FILE;
}

const SAVE_DEBOUNCE_MS = 30_000; // Save to disk every 30 seconds

interface TimestampCacheStore {
  version: number;
  timestamps: Record<string, number>;
  updatedAt: number;
}

let inMemoryCache: Record<string, number> = {};
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let isSaving = false;

/**
 * Load timestamp cache from JSON file into memory.
 * Called once at app startup for instant cache availability.
 */
export async function initializeJsonCache(): Promise<void> {
  try {
    const filePath = await getCacheFilePath();
    const content = await FileSystem.readAsStringAsync(filePath);
    const parsed = JSON.parse(content) as TimestampCacheStore;

    if (parsed.version === 1 && parsed.timestamps) {
      inMemoryCache = parsed.timestamps;
      console.log(`✓ JSON timestamp cache loaded: ${Object.keys(inMemoryCache).length} entries`);
    }
  } catch (error) {
    // File doesn't exist yet, that's fine
    inMemoryCache = {};
    if (error instanceof Error && 'message' in error && error.message.includes('not exist')) {
      return;
    }
    console.warn('Failed to load JSON timestamp cache:', error);
  }
}

/**
 * Get a timestamp from the JSON cache (instant, no async).
 */
export function getFromJsonCache(assetId: string): number | undefined {
  return inMemoryCache[assetId];
}

/**
 * Set multiple timestamps in the JSON cache.
 * Automatically triggers debounced save to disk.
 */
export function setInJsonCache(entries: Record<string, number>): void {
  Object.assign(inMemoryCache, entries);
  scheduleSaveToDisk();
}

/**
 * Set a single timestamp in the JSON cache.
 */
export function setInJsonCacheSingle(assetId: string, timestamp: number): void {
  inMemoryCache[assetId] = timestamp;
  scheduleSaveToDisk();
}

/**
 * Get all timestamps as a Map (for hydration).
 */
export function getAllFromJsonCache(): Map<string, number> {
  return new Map(Object.entries(inMemoryCache));
}

/**
 * Clear all timestamps (e.g., if user clears app data).
 */
export async function clearJsonCache(): Promise<void> {
  inMemoryCache = {};
  try {
    const filePath = await getCacheFilePath();
    await FileSystem.deleteAsync(filePath, { idempotent: true });
    console.log('JSON timestamp cache cleared');
  } catch (error) {
    console.warn('Failed to delete JSON cache file:', error);
  }
}

/**
 * Force immediate save (useful on app pause/background).
 */
export async function flushJsonCacheToDisk(): Promise<void> {
  await saveCacheToDisk();
}

/**
 * Internal: Schedule a debounced save to disk.
 */
function scheduleSaveToDisk(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  saveTimer = setTimeout(() => {
    void saveCacheToDisk();
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Internal: Actually save to disk.
 */
async function saveCacheToDisk(): Promise<void> {
  if (isSaving) return;
  isSaving = true;

  try {
    const filePath = await getCacheFilePath();
    const store: TimestampCacheStore = {
      version: 1,
      timestamps: inMemoryCache,
      updatedAt: Date.now(),
    };

    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(store));
  } catch (error) {
    console.error('Failed to save JSON timestamp cache:', error);
  } finally {
    isSaving = false;
  }
}
