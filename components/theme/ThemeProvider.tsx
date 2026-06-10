'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

type ThemeValue = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: ThemeValue;
  setTheme: (theme: ThemeValue) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
});

function resolveTheme(theme: ThemeValue): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeValue>('dark');

  // Apply the resolved theme to the document root
  const applyTheme = useCallback((t: ThemeValue) => {
    const resolved = resolveTheme(t);
    document.documentElement.setAttribute('data-theme', resolved);
  }, []);

  // On mount: read persisted preference from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('at-theme') as ThemeValue | null;
      const initial: ThemeValue = stored === 'light' || stored === 'dark' || stored === 'system'
        ? stored
        : 'dark';
      setThemeState(initial);
      applyTheme(initial);
    } catch {
      // localStorage unavailable (e.g. SSR guard)
    }
  }, [applyTheme]);

  // Listen for system preference changes when theme is 'system'
  useEffect(() => {
    if (theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme, applyTheme]);

  const setTheme = useCallback((t: ThemeValue) => {
    setThemeState(t);
    try {
      localStorage.setItem('at-theme', t);
    } catch {
      // ignore
    }
    applyTheme(t);
  }, [applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}

export default ThemeProvider;
