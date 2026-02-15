import { ThemeMode } from './types/models';

export const themes = {
  light: {
    background: '#f3f4f6',
    panel: '#ffffff',
    text: '#111827',
    muted: '#6b7280',
    border: '#e5e7eb',
    accent: '#0f766e',
    accentSoft: '#ccfbf1',
    danger: '#b91c1c',
  },
  dark: {
    background: '#0b1020',
    panel: '#111827',
    text: '#f9fafb',
    muted: '#a3aab8',
    border: '#1f2937',
    accent: '#2dd4bf',
    accentSoft: '#113c44',
    danger: '#f87171',
  },
};

export type ThemeColors = (typeof themes)['light'];

export const getTheme = (mode: ThemeMode) => themes[mode];
