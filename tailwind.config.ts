import type { Config } from 'tailwindcss';
import { colorTokens, radiusTokens } from './src/config/brand';

const hsl = (token: string) => `hsl(${token})`;

const mapScale = (scale: Record<string, string>) =>
  Object.fromEntries(Object.entries(scale).map(([key, value]) => [key, hsl(value)]));

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: mapScale(colorTokens.forest),
        green: mapScale(colorTokens.green),
        mint: mapScale(colorTokens.mint),
        ink: mapScale(colorTokens.neutral),
        charcoal: hsl(colorTokens.charcoal),
        danger: mapScale(colorTokens.danger),
        warning: mapScale(colorTokens.warning),
        info: mapScale(colorTokens.info),
        surface: hsl(colorTokens.neutral[0]),
        page: hsl(colorTokens.neutral[50]),
        line: hsl(colorTokens.neutral[200]),
      },
      borderRadius: radiusTokens,
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.875rem', { lineHeight: '1.375rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1.1' }],
      },
      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
        '22': '5.5rem',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
      boxShadow: {
        card: '0 1px 2px 0 hsl(150 18% 13% / 0.04), 0 1px 3px 0 hsl(150 18% 13% / 0.06)',
        raised: '0 2px 6px -1px hsl(150 18% 13% / 0.08), 0 4px 12px -2px hsl(150 18% 13% / 0.06)',
        float: '0 8px 24px -6px hsl(150 18% 13% / 0.14)',
        sheet: '0 -8px 32px -12px hsl(150 18% 13% / 0.22)',
        focus: '0 0 0 3px hsl(146 55% 40% / 0.35)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'pop-in': {
          '0%': { transform: 'scale(0.85)', opacity: '0' },
          '60%': { transform: 'scale(1.04)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'check-draw': {
          from: { strokeDashoffset: '48' },
          to: { strokeDashoffset: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'progress-indeterminate': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(300%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-up': 'slide-up 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'sheet-up': 'sheet-up 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pop-in': 'pop-in 320ms cubic-bezier(0.16, 1, 0.3, 1)',
        'check-draw': 'check-draw 420ms ease-out forwards',
        shimmer: 'shimmer 1.6s infinite',
        'progress-indeterminate': 'progress-indeterminate 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
