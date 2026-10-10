/**
 * React Native Paper — reference-only bridge to CUTLY tokens.
 * Product screens stay on StyleSheet + useThemedStyles (DESIGN.md).
 * Use Paper components when you need a pattern reference; restyle to tokens.
 */
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';
import { darkColors, lightColors, type Palette } from '@/constants/theme';

function fromPalette(base: MD3Theme, palette: Palette): MD3Theme {
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.accent,
      secondary: palette.accentDark,
      background: palette.canvas,
      surface: palette.surface,
      onPrimary: palette.white,
      onSecondary: palette.white,
      onBackground: palette.ink,
      onSurface: palette.ink,
      outline: palette.line,
      error: palette.danger
    },
    roundness: 14
  };
}

export const cutlyPaperLight = fromPalette(MD3LightTheme, lightColors);
export const cutlyPaperDark = fromPalette(MD3DarkTheme, darkColors);
