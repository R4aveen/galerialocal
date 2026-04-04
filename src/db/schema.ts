import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
const DB_VERSION = 3;

export async function getDatabase() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('galeria.db');
  }
  return dbPromise;
}

async function configureDatabase(db: SQLite.SQLiteDatabase) {
  // WAL improves concurrent read/write behavior for local caching workloads.
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA synchronous = NORMAL;');
  await db.execAsync('PRAGMA temp_store = MEMORY;');
}

async function runMigrationV1(db: SQLite.SQLiteDatabase) {
  await db.runAsync(
    'CREATE TABLE IF NOT EXISTS favorites (id TEXT PRIMARY KEY, added_at INTEGER NOT NULL)'
  );
  await db.runAsync(
    'CREATE TABLE IF NOT EXISTS trash (id TEXT PRIMARY KEY, filename TEXT, uri TEXT, original_path TEXT, deleted_at INTEGER NOT NULL)'
  );
  await db.runAsync(
    'CREATE TABLE IF NOT EXISTS media_timestamp_cache (asset_id TEXT PRIMARY KEY, ts INTEGER NOT NULL, updated_at INTEGER NOT NULL)'
  );
}

async function runMigrationV2(db: SQLite.SQLiteDatabase) {
  // Indexes tuned for "latest first" and stale-cache cleanup queries.
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_favorites_added_at ON favorites(added_at DESC)');
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_trash_deleted_at ON trash(deleted_at DESC)');
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_media_ts_updated_at ON media_timestamp_cache(updated_at)');
  await db.runAsync('CREATE INDEX IF NOT EXISTS idx_media_ts_ts ON media_timestamp_cache(ts)');

  // Keep a small metadata key/value table for future local DB settings/migrations.
  await db.runAsync(
    'CREATE TABLE IF NOT EXISTS app_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL)'
  );
}

async function runMigrationV3(db: SQLite.SQLiteDatabase) {
  // Encrypted password storage for private vault access
  // We'll store hashed PIN + salt for verification
  await db.runAsync(
    `CREATE TABLE IF NOT EXISTS private_lock (
      id TEXT PRIMARY KEY,
      pin_hash TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`
  );
  
  // Allow only one lock record per app instance
  await db.runAsync(
    'CREATE INDEX IF NOT EXISTS idx_private_lock_id ON private_lock(id)'
  );
}

export async function ensureDatabaseSchema(db: SQLite.SQLiteDatabase) {
  await configureDatabase(db);

  try {
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
    const currentVersion = row?.user_version ?? 0;
    
    console.log(`[DB Migration] Current version: ${currentVersion}, Target: ${DB_VERSION}`);

    if (currentVersion < 1) {
      console.log('[DB Migration] Running v1 migration...');
      await runMigrationV1(db);
    }

    if (currentVersion < 2) {
      console.log('[DB Migration] Running v2 migration...');
      await runMigrationV2(db);
    }

    if (currentVersion < 3) {
      console.log('[DB Migration] Running v3 migration...');
      await runMigrationV3(db);
    }

    if (currentVersion !== DB_VERSION) {
      console.log(`[DB Migration] Updating version from ${currentVersion} to ${DB_VERSION}`);
      await db.runAsync(`PRAGMA user_version = ${DB_VERSION};`);
    }
    
    console.log('[DB Migration] All migrations completed successfully');
  } catch (error) {
    console.error('[DB Migration] Error during migration:', error);
    throw error;
  }
}

export async function initDatabase() {
  const db = await getDatabase();
  await ensureDatabaseSchema(db);

  return db;
}
