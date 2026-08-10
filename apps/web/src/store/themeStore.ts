import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, type Palette, type ThemeMode, type UserSettings } from '../api/client';

export type Theme = ThemeMode;
export type { Palette, ThemeMode };

interface ThemeState {
  theme: ThemeMode;
  palette: Palette;
  setTheme: (theme: ThemeMode, syncToDb?: boolean) => void;
  setPalette: (palette: Palette, syncToDb?: boolean) => void;
  setThemeAndPalette: (theme: ThemeMode, palette: Palette, syncToDb?: boolean) => void;
  toggleTheme: () => void;
  syncFromUserSettings: (settings?: UserSettings) => void;
}

export function applyThemeToDOM(theme: ThemeMode, palette: Palette) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-palette', palette);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      palette: 'default',
      setTheme: (theme, syncToDb = true) => {
        const { palette } = get();
        applyThemeToDOM(theme, palette);
        set({ theme });
        if (syncToDb) {
          api.auth.updateSettings({ theme, palette }).catch(() => {});
        }
      },
      setPalette: (palette, syncToDb = true) => {
        const { theme } = get();
        applyThemeToDOM(theme, palette);
        set({ palette });
        if (syncToDb) {
          api.auth.updateSettings({ theme, palette }).catch(() => {});
        }
      },
      setThemeAndPalette: (theme, palette, syncToDb = true) => {
        applyThemeToDOM(theme, palette);
        set({ theme, palette });
        if (syncToDb) {
          api.auth.updateSettings({ theme, palette }).catch(() => {});
        }
      },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        const { palette } = get();
        applyThemeToDOM(next, palette);
        set({ theme: next });
        api.auth.updateSettings({ theme: next, palette }).catch(() => {});
      },
      syncFromUserSettings: (settings) => {
        if (!settings) return;
        const theme = settings.theme || get().theme || 'dark';
        const palette = settings.palette || get().palette || 'default';
        applyThemeToDOM(theme, palette);
        set({ theme, palette });
      },
    }),
    {
      name: 'clever-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyThemeToDOM(state.theme || 'dark', state.palette || 'default');
        }
      },
    },
  ),
);

// Helper for initial load before React hydration
export function applyThemeOnBoot() {
  const saved = localStorage.getItem('clever-theme');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const theme = parsed.state?.theme || 'dark';
      const palette = parsed.state?.palette || 'default';
      applyThemeToDOM(theme, palette);
    } catch {
      applyThemeToDOM('dark', 'default');
    }
  } else {
    applyThemeToDOM('dark', 'default');
  }
}
