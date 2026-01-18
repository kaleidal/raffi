/**
 * Raffi Mobile Theme - Dark theme matching the desktop app
 * 
 * Design language: Large rounded buttons, glassmorphism, bold typography
 */

import { Dimensions, Platform } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Main dark theme colors matching desktop
export const Colors = {
  // Primary dark background (matches #090909 from desktop)
  background: '#090909',
  backgroundSecondary: '#121212',
  backgroundTertiary: '#1A1A1A',
  
  // Cards & surfaces
  card: '#1A1A1A',
  cardHover: '#222222',
  
  // Text colors
  text: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.7)',
  textMuted: 'rgba(255, 255, 255, 0.4)',
  
  // Accent colors (white theme matching Raffi desktop)
  primary: '#FFFFFF',
  primaryDark: '#D3D3D3',
  
  // UI Elements
  tint: '#FFFFFF',
  border: 'rgba(255, 255, 255, 0.1)',
  separator: 'rgba(255, 255, 255, 0.05)',
  
  // Overlays
  overlay: 'rgba(0, 0, 0, 0.8)',
  overlayLight: 'rgba(0, 0, 0, 0.5)',
  
  // Status colors
  success: '#46D369',
  warning: '#FF8F3C',  // Orange like desktop
  error: '#FF453A',
  
  // Tab bar
  tabBar: '#000000',
  tabIconDefault: 'rgba(255, 255, 255, 0.4)',
  tabIconSelected: '#FFFFFF',
  
  // Glassmorphism
  glass: 'rgba(255, 255, 255, 0.1)',
  glassStrong: 'rgba(255, 255, 255, 0.15)',
  glassDark: 'rgba(0, 0, 0, 0.3)',
};

// Typography - larger sizes to match desktop feel
export const Typography = {
  sizes: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    xxl: 24,
    xxxl: 32,
    hero: 40,
    display: 48,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};

// Spacing - more generous like desktop
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  section: 40,
};

// Border Radius - more rounded like desktop
export const BorderRadius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  full: 9999,
};

// Screen dimensions helpers
export const Screen = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  isSmall: SCREEN_WIDTH < 375,
  isMedium: SCREEN_WIDTH >= 375 && SCREEN_WIDTH < 414,
  isLarge: SCREEN_WIDTH >= 414,
};

// Poster dimensions (matching typical movie poster ratio 2:3)
export const PosterSize = {
  small: {
    width: 100,
    height: 150,
  },
  medium: {
    width: 130,
    height: 195,
  },
  large: {
    width: 160,
    height: 240,
  },
};

// Hero/Featured content dimensions
export const HeroSize = {
  height: SCREEN_HEIGHT * 0.55,
  posterWidth: SCREEN_WIDTH * 0.35,
};

// Fonts (system fonts for now, can add custom later)
export const Fonts = Platform.select({
  ios: {
    sans: 'System',
    mono: 'Menlo',
  },
  android: {
    sans: 'Roboto',
    mono: 'monospace',
  },
  default: {
    sans: 'System',
    mono: 'monospace',
  },
});
