export const colors = {
  ink: '#101112',
  muted: '#747978',
  surface: '#FFFFFF',
  canvas: '#F7F7F4',
  line: '#E7E8E3',
  lime: '#C9F35A',
  limeDark: '#91B92A',
  orange: '#F47B4A',
  success: '#218B62',
  warning: '#B27413',
  danger: '#C84747',
  white: '#FFFFFF'
} as const;

export const spacing = { xs: 6, sm: 10, md: 16, lg: 22, xl: 30, xxl: 40 } as const;
export const radii = { sm: 10, md: 16, lg: 24, pill: 999 } as const;
export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: '800' as const },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800' as const },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '700' as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '500' as const },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: '600' as const }
};
