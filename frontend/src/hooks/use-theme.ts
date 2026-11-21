'use client';

import { useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';

const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme; else root.dataset.theme = theme;
};

const read = (): Theme => {
  try {
    const value = localStorage.getItem('nuvex-theme');
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
};

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system');

  useEffect(() => {
    const initial = read();
    setThemeState(initial);
    applyTheme(initial);
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try { localStorage.setItem('nuvex-theme', next); } catch { /* almacenamiento no disponible */ }
  };

  return [theme, setTheme] as const;
}
