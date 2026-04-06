import { useCallback, useEffect, useState } from 'react';
import {
  setPrivatePin,
  verifyPrivatePin,
  hasPrivatePin,
  clearPrivatePin,
  changePrivatePin,
} from '../db/privateLockManager';

let sharedUnlocked = false;

export function usePrivateLockV2() {
  const [hasPin, setHasPin] = useState(false);
  const [unlocked, setUnlocked] = useState(sharedUnlocked);
  const [loading, setLoading] = useState(false);

  // Check if PIN is set on mount
  useEffect(() => {
    const checkPin = async () => {
      setLoading(true);
      try {
        const exists = await hasPrivatePin();
        setHasPin(exists);
        setUnlocked(exists ? sharedUnlocked : false);
      } catch (error) {
        console.error('Error checking PIN:', error);
      } finally {
        setLoading(false);
      }
    };

    void checkPin();
  }, []);

  const setPin = useCallback(async (pin: string): Promise<boolean> => {
    try {
      setLoading(true);
      const success = await setPrivatePin(pin);
      if (success) {
        setHasPin(true);
        sharedUnlocked = true;
        setUnlocked(true);
      }
      return success;
    } finally {
      setLoading(false);
    }
  }, []);

  const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
    try {
      setLoading(true);
      const isValid = await verifyPrivatePin(pin);
      if (isValid) {
        sharedUnlocked = true;
        setUnlocked(true);
      }
      return isValid;
    } finally {
      setLoading(false);
    }
  }, []);

  const changePin = useCallback(async (oldPin: string, newPin: string): Promise<boolean> => {
    try {
      setLoading(true);
      const success = await changePrivatePin(oldPin, newPin);
      return success;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearPin = useCallback(async (): Promise<boolean> => {
    try {
      setLoading(true);
      const success = await clearPrivatePin();
      if (success) {
        sharedUnlocked = false;
        setHasPin(false);
        setUnlocked(false);
      }
      return success;
    } finally {
      setLoading(false);
    }
  }, []);

  const lock = useCallback((): void => {
    sharedUnlocked = false;
    setUnlocked(false);
  }, []);

  return {
    hasPin,
    unlocked,
    loading,
    setPin,
    unlockWithPin,
    changePin,
    clearPin,
    lock,
  };
}
