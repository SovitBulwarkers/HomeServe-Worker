// Design tokens — HomeServe Pro (worker app). Warm amber/orange accent to
// keep it visually distinct from the blue customer app while sharing the
// same layout language.
export const colors = {
  // Brand amber
  primary: '#E8730A',
  primaryDark: '#C25E05',
  primaryLight: '#FDECDA',
  gradientStart: '#E8730A',
  gradientEnd: '#F5941F',

  // Surfaces
  background: '#F7F6F4',
  surface: '#FFFFFF',
  surfaceMuted: '#F4EFE9',

  // Text
  textPrimary: '#20180F',
  textSecondary: '#6B6157',
  textMuted: '#9B9186',
  textOnPrimary: '#FFFFFF',

  // Borders
  border: '#ECE6DE',
  borderLight: '#F3EFE9',

  // Status
  success: '#19A463',
  successLight: '#E7F8EF',
  warning: '#E8910A',
  warningLight: '#FEF4E3',
  danger: '#E5484D',
  dangerLight: '#FCEAEB',
  info: '#1A5FE8',
  infoLight: '#EAF1FE',

  // Misc
  star: '#F5A623',
  overlay: 'rgba(32, 24, 15, 0.5)',
  white: '#FFFFFF',
  black: '#000000',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
};

export const fontSize = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 28,
  display: 32,
};

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const shadow = {
  card: {
    shadowColor: '#20180F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  raised: {
    shadowColor: '#20180F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
  subtle: {
    shadowColor: '#20180F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
};

export const theme = { colors, spacing, radius, fontSize, fontWeight, shadow };
export default theme;
