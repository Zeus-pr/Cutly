export const colors = {
  canvas: '#FFFFFF',
  surface: '#F4F6F6',
  ink: '#141110',
  muted: 'rgba(20,17,16,0.48)',
  line: 'rgba(20,17,16,0.10)',
  accent: '#0EC9A5',
  lime: '#0EC9A5',
  limeDark: '#0BA888',
  orange: '#0EC9A5',
  success: '#0BA888',
  warning: '#C48A12',
  danger: '#B42318',
  white: '#FFFFFF'
} as const;

export const spacing = { xs: 6, sm: 10, md: 16, lg: 22, xl: 30, xxl: 40 } as const;
export const radii = { sm: 10, md: 14, lg: 20, pill: 999 } as const;
export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700' as const, letterSpacing: -0.6 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' as const }
};
