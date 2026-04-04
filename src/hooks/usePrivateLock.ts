import { useCallback, useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

interface LockData {
  pin: string;
}

export function usePrivateLock() {
  const [hasPin, setHasPin] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(false);

  const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  const lockDir = `${baseDir}.private/`;
  const lockFile = `${lockDir}lock.json`;

  const ensureStorage = useCallback(async () => {
    if (!baseDir) {
      throw new Error('No hay directorio de almacenamiento disponible');
    }

    const dirInfo = await FileSystem.getInfoAsync(lockDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(lockDir, { intermediates: true });
    }
  }, [baseDir, lockDir]);

  const readLock = useCallback(async (): Promise<LockData | null> => {
    await ensureStorage();

    try {
      const fileInfo = await FileSystem.getInfoAsync(lockFile);
      if (!fileInfo.exists) return null;
      const raw = await FileSystem.readAsStringAsync(lockFile);
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.pin !== 'string') return null;
      return parsed as LockData;
    } catch {
      return null;
    }
  }, [ensureStorage, lockFile]);

  const refreshLockState = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readLock();
      setHasPin(Boolean(data?.pin));
    } finally {
      setLoading(false);
    }
  }, [readLock]);

  useEffect(() => {
    refreshLockState();
  }, [refreshLockState]);

  const setPin = useCallback(
    async (pin: string) => {
      if (!/^\d{4,8}$/.test(pin)) {
        return false;
      }

      try {
        await ensureStorage();
        await FileSystem.writeAsStringAsync(lockFile, JSON.stringify({ pin }));
        setHasPin(true);
        setUnlocked(true);
        return true;
      } catch (error) {
        console.error('Error setting private lock pin:', error);
        return false;
      }
    },
    [ensureStorage, lockFile]
  );

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const data = await readLock();
      if (!data) return false;
      const ok = data.pin === pin;
      setUnlocked(ok);
      return ok;
    },
    [readLock]
  );

  const lock = useCallback(() => {
    setUnlocked(false);
  }, []);

  return {
    hasPin,
    unlocked,
    loading,
    setPin,
    unlockWithPin,
    lock,
    refreshLockState,
  };
}
