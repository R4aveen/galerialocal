import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';

export type ThemeMode = 'dark' | 'light';

export interface ThemeColors {
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  text: string;
  textMuted: string;
  error: string;
  border: string;
}

const DARK_COLORS: ThemeColors = {
  background: '#000000',
  surface: '#121212',
  primary: '#BB86FC',
  secondary: '#03DAC6',
  text: '#FFFFFF',
  textMuted: '#9E9E9E',
  error: '#CF6679',
  border: '#2C2C2C',
};

const LIGHT_COLORS: ThemeColors = {
  background: '#FFF9EF',
  surface: '#FFF4E3',
  primary: '#7A4B2A',
  secondary: '#C88A5A',
  text: '#3A2A1E',
  textMuted: '#8F7A66',
  error: '#B94A48',
  border: '#EAD9C4',
};

const THEME_FILE = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}theme-preference.json`;

interface AppThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    void (async () => {
      try {
        const info = await FileSystem.getInfoAsync(THEME_FILE);
        if (!info.exists) return;
        const raw = await FileSystem.readAsStringAsync(THEME_FILE);
        const parsed = JSON.parse(raw) as { mode?: ThemeMode };
        if (parsed.mode === 'light' || parsed.mode === 'dark') {
          setModeState(parsed.mode);
        }
      } catch {
        // Ignore theme load failures.
      }
    })();
  }, []);

  const persistMode = useCallback(async (next: ThemeMode) => {
    try {
      await FileSystem.writeAsStringAsync(THEME_FILE, JSON.stringify({ mode: next }));
    } catch {
      // Ignore theme save failures.
    }
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void persistMode(next);
  }, [persistMode]);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      void persistMode(next);
      return next;
    });
  }, [persistMode]);

  const colors = mode === 'dark' ? DARK_COLORS : LIGHT_COLORS;

  const value = useMemo<AppThemeContextValue>(() => ({
    mode,
    colors,
    setMode,
    toggleMode,
  }), [mode, colors, setMode, toggleMode]);

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(AppThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return ctx;
}
