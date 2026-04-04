import { initDatabase } from './schema';

const QUERY_CHUNK_SIZE = 500;
const UPSERT_CHUNK_SIZE = 250;
const CLEANUP_EVERY_N_UPSERTS = 12;
const STALE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 45;
let upsertCalls = 0;

type PersistedEntry = {
  id: string;
  timestamp: number;
};

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export async function getPersistedTimestamps(ids: string[]) {
  const result = new Map<string, number>();
  if (ids.length === 0) return result;

  const db = await initDatabase();
  const chunks = chunkArray(ids, QUERY_CHUNK_SIZE);

  for (const chunk of chunks) {
    const placeholders = chunk.map(() => '?').join(', ');
    const sql = `SELECT asset_id, ts FROM media_timestamp_cache WHERE asset_id IN (${placeholders})`;
    const rows = await db.getAllAsync<{ asset_id: string; ts: number }>(sql, chunk);
    rows.forEach((row) => {
      result.set(row.asset_id, row.ts);
    });
  }

  return result;
}

export async function upsertPersistedTimestamps(entries: PersistedEntry[]) {
  if (entries.length === 0) return;
  const db = await initDatabase();
  const now = Date.now();
  const chunks = chunkArray(entries, UPSERT_CHUNK_SIZE);

  for (const chunk of chunks) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const entry of chunk) {
        await tx.runAsync(
          `INSERT INTO media_timestamp_cache(asset_id, ts, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(asset_id) DO UPDATE SET
             ts = excluded.ts,
             updated_at = excluded.updated_at`,
          [entry.id, entry.timestamp, now]
        );
      }
    });
  }

  upsertCalls += 1;
  if (upsertCalls % CLEANUP_EVERY_N_UPSERTS === 0) {
    await cleanupOldPersistedTimestamps(now - STALE_MAX_AGE_MS);
  }
}

export async function cleanupOldPersistedTimestamps(cutoffTimestamp: number) {
  const db = await initDatabase();
  await db.runAsync('DELETE FROM media_timestamp_cache WHERE updated_at < ?', [cutoffTimestamp]);
}
