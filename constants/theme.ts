import { fontFamily } from '@/constants/fonts';

export type Palette = {
  canvas: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accentDark: string;
  sand: string;
  success: string;
  warning: string;
  danger: string;
  white: string;
};

/** CUTLY Color System 02 — cream / navy / coral. */
export const lightColors: Palette = {
  canvas: '#F7F4EE',
  surface: '#FFFFFF',
  ink: '#17263C',
  muted: '#667386',
  line: 'rgba(23,38,60,0.12)',
  accent: '#F06B55',
  accentDark: '#D45540',
  sand: '#E9DED0',
  success: '#2F6F4E',
  warning: '#C48A12',
  danger: '#B42318',
  white: '#FFFFFF'
};

export const darkColors: Palette = {
  canvas: '#121820',
  surface: '#1C2636',
  ink: '#F7F4EE',
  muted: '#9AA6B5',
  line: 'rgba(247,244,238,0.14)',
  accent: '#F06B55',
  accentDark: '#FF8B78',
  sand: '#2A3344',
  success: '#5DAB84',
  warning: '#E2B15A',
  danger: '#FF8A80',
  white: '#FFFFFF'
};

export const colors = lightColors;

export const spacing = { xs: 6, sm: 10, md: 16, lg: 22, xl: 30, xxl: 40 } as const;
export const radii = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
export const typography = {
  display: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700' as const,
    letterSpacing: -0.6,
    fontFamily: fontFamily.bold
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
    fontFamily: fontFamily.bold
  },
  heading: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as const,
    fontFamily: fontFamily.semibold
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '400' as const,
    fontFamily: fontFamily.regular
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as const,
    fontFamily: fontFamily.regular
  }
};
