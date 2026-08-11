import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, type Palette, type ThemeMode, type ThemeStyle, type UserSettings } from '../api/client';

export type Theme = ThemeMode;
export type { Palette, ThemeMode, ThemeStyle };

interface ThemeState {
  theme: ThemeMode;
  palette: Palette;
  themeStyle: ThemeStyle;
  setTheme: (theme: ThemeMode, syncToDb?: boolean) => void;
  setPalette: (palette: Palette, syncToDb?: boolean) => void;
  setThemeStyle: (themeStyle: ThemeStyle, syncToDb?: boolean) => void;
  setThemeAndPalette: (theme: ThemeMode, palette: Palette, syncToDb?: boolean) => void;
  setAllThemeOptions: (theme: ThemeMode, palette: Palette, themeStyle: ThemeStyle, syncToDb?: boolean) => void;
  toggleTheme: () => void;
  syncFromUserSettings: (settings?: UserSettings) => void;
}

export function applyThemeToDOM(theme: ThemeMode, palette: Palette, themeStyle: ThemeStyle = 'material_clean') {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-palette', palette);
  document.documentElement.setAttribute('data-style', themeStyle);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      palette: 'default',
      themeStyle: 'material_clean',
      setTheme: (theme, syncToDb = true) => {
        const { palette, themeStyle } = get();
        applyThemeToDOM(theme, palette, themeStyle);
        set({ theme });
        if (syncToDb) {
          api.auth.updateSettings({ theme, palette, themeStyle }).catch(() => {});
        }
      },
      setPalette: (palette, syncToDb = true) => {
        const { theme, themeStyle } = get();
        applyThemeToDOM(theme, palette, themeStyle);
        set({ palette });
        if (syncToDb) {
          api.auth.updateSettings({ theme, palette, themeStyle }).catch(() => {});
        }
      },
      setThemeStyle: (themeStyle, syncToDb = true) => {
        const { theme, palette } = get();
        applyThemeToDOM(theme, palette, themeStyle);
        set({ themeStyle });
        if (syncToDb) {
          api.auth.updateSettings({ theme, palette, themeStyle }).catch(() => {});
        }
      },
      setThemeAndPalette: (theme, palette, syncToDb = true) => {
        const { themeStyle } = get();
        applyThemeToDOM(theme, palette, themeStyle);
        set({ theme, palette });
        if (syncToDb) {
          api.auth.updateSettings({ theme, palette, themeStyle }).catch(() => {});
        }
      },
      setAllThemeOptions: (theme, palette, themeStyle, syncToDb = true) => {
        applyThemeToDOM(theme, palette, themeStyle);
        set({ theme, palette, themeStyle });
        if (syncToDb) {
          api.auth.updateSettings({ theme, palette, themeStyle }).catch(() => {});
        }
      },
      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        const { palette, themeStyle } = get();
        applyThemeToDOM(next, palette, themeStyle);
        set({ theme: next });
        api.auth.updateSettings({ theme: next, palette, themeStyle }).catch(() => {});
      },
      syncFromUserSettings: (settings) => {
        if (!settings) return;
        const theme = settings.theme || get().theme || 'dark';
        const palette = settings.palette || get().palette || 'default';
        const themeStyle = (settings.themeStyle as ThemeStyle) || get().themeStyle || 'material_clean';
        applyThemeToDOM(theme, palette, themeStyle);
        set({ theme, palette, themeStyle });
      },
    }),
    {
      name: 'clever-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyThemeToDOM(
            state.theme || 'dark',
            state.palette || 'default',
            state.themeStyle || 'material_clean',
          );
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
      const themeStyle = parsed.state?.themeStyle || 'material_clean';
      applyThemeToDOM(theme, palette, themeStyle);
    } catch {
      applyThemeToDOM('dark', 'default', 'material_clean');
    }
  } else {
    applyThemeToDOM('dark', 'default', 'material_clean');
  }
}
