import * as SQLite from 'expo-sqlite';

export async function initDatabase() {
  const db = await SQLite.openDatabaseAsync('galeria.db');
  
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS favorites (
      id TEXT PRIMARY KEY,
      added_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS trash (
      id TEXT PRIMARY KEY,
      filename TEXT,
      uri TEXT,
      original_path TEXT,
      deleted_at INTEGER
    );
  `);

  return db;
}
