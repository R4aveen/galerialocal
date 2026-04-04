import * as CryptoJS from 'crypto-js';
import { initDatabase } from './schema';

const LOCK_ID = 'vault_lock_001';

interface PrivateLockRecord {
  id: string;
  pin_hash: string;
  pin_salt: string;
  created_at: number;
  updated_at: number;
}

/**
 * Generate random salt for PIN hashing
 */
function generateSalt(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let salt = '';
  for (let i = 0; i < 32; i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return salt;
}

/**
 * Hash PIN with salt using SHA-256
 */
function hashPin(pin: string, salt: string): string {
  const combined = pin + salt;
  return CryptoJS.SHA256(combined).toString();
}

/**
 * Set new PIN (creates or updates)
 */
export async function setPrivatePin(newPin: string): Promise<boolean> {
  if (!/^\d{4,8}$/.test(newPin)) {
    console.warn('PIN must be 4-8 digits');
    return false;
  }

  try {
    const db = await initDatabase();
    
    // Ensure table exists (defensive)
    await db.runAsync(
      `CREATE TABLE IF NOT EXISTS private_lock (
        id TEXT PRIMARY KEY,
        pin_hash TEXT NOT NULL,
        pin_salt TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    );

    const salt = generateSalt();
    const pinHash = hashPin(newPin, salt);
    const now = Date.now();

    // Try to update existing, or insert if doesn't exist
    const existing = await db.getFirstAsync<PrivateLockRecord>(
      'SELECT * FROM private_lock WHERE id = ?',
      [LOCK_ID]
    );

    if (existing) {
      await db.runAsync(
        `UPDATE private_lock 
         SET pin_hash = ?, pin_salt = ?, updated_at = ? 
         WHERE id = ?`,
        [pinHash, salt, now, LOCK_ID]
      );
    } else {
      await db.runAsync(
        `INSERT INTO private_lock(id, pin_hash, pin_salt, created_at, updated_at) 
         VALUES (?, ?, ?, ?, ?)`,
        [LOCK_ID, pinHash, salt, now, now]
      );
    }

    console.log('✓ Private vault PIN set successfully');
    return true;
  } catch (error) {
    console.error('Error setting private PIN:', error);
    return false;
  }
}

/**
 * Verify PIN against stored hash
 */
export async function verifyPrivatePin(pin: string): Promise<boolean> {
  if (!/^\d{4,8}$/.test(pin)) {
    return false;
  }

  try {
    const db = await initDatabase();
    
    // Ensure table exists (defensive)
    await db.runAsync(
      `CREATE TABLE IF NOT EXISTS private_lock (
        id TEXT PRIMARY KEY,
        pin_hash TEXT NOT NULL,
        pin_salt TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    );

    const record = await db.getFirstAsync<PrivateLockRecord>(
      'SELECT * FROM private_lock WHERE id = ?',
      [LOCK_ID]
    );

    if (!record) {
      console.warn('No PIN set for private vault');
      return false;
    }

    const computedHash = hashPin(pin, record.pin_salt);
    const isValid = computedHash === record.pin_hash;

    if (!isValid) {
      console.warn('Invalid PIN');
    }

    return isValid;
  } catch (error) {
    console.error('Error verifying private PIN:', error);
    return false;
  }
}

/**
 * Check if PIN is already set
 */
export async function hasPrivatePin(): Promise<boolean> {
  try {
    const db = await initDatabase();
    
    // Ensure table exists (defensive)
    await db.runAsync(
      `CREATE TABLE IF NOT EXISTS private_lock (
        id TEXT PRIMARY KEY,
        pin_hash TEXT NOT NULL,
        pin_salt TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    );

    const record = await db.getFirstAsync<PrivateLockRecord>(
      'SELECT id FROM private_lock WHERE id = ?',
      [LOCK_ID]
    );

    return !!record;
  } catch (error) {
    console.error('Error checking private PIN:', error);
    return false;
  }
}

/**
 * Clear PIN (remove lock)
 */
export async function clearPrivatePin(): Promise<boolean> {
  try {
    const db = await initDatabase();
    
    // Ensure table exists (defensive)
    await db.runAsync(
      `CREATE TABLE IF NOT EXISTS private_lock (
        id TEXT PRIMARY KEY,
        pin_hash TEXT NOT NULL,
        pin_salt TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    );

    await db.runAsync('DELETE FROM private_lock WHERE id = ?', [LOCK_ID]);

    console.log('✓ Private vault PIN cleared');
    return true;
  } catch (error) {
    console.error('Error clearing private PIN:', error);
    return false;
  }
}

/**
 * Change PIN (verify old, then set new)
 */
export async function changePrivatePin(oldPin: string, newPin: string): Promise<boolean> {
  // Verify old PIN first
  const isValid = await verifyPrivatePin(oldPin);
  if (!isValid) {
    console.warn('Current PIN is incorrect');
    return false;
  }

  // Set new PIN
  return setPrivatePin(newPin);
}
