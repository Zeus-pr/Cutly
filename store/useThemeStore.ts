import { useMemo } from 'react';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { darkColors, lightColors, type Palette } from '@/constants/theme';

const themeKey = 'cutly.theme';

type ThemeState = {
  dark: boolean;
  setDark: (dark: boolean) => void;
  hydrate: () => Promise<void>;
};

export const useThemeStore = create<ThemeState>((set) => ({
  dark: false,
  setDark: (dark) => {
    set({ dark });
    void SecureStore.setItemAsync(themeKey, dark ? 'dark' : 'light');
  },
  hydrate: async () => {
    const stored = await SecureStore.getItemAsync(themeKey);
    set({ dark: stored === 'dark' });
  }
}));

export function useColors(): Palette {
  const dark = useThemeStore((state) => state.dark);
  return dark ? darkColors : lightColors;
}

export function useThemedStyles<T>(factory: (colors: Palette) => T): T {
  const palette = useColors();
  return useMemo(() => factory(palette), [factory, palette]);
}
