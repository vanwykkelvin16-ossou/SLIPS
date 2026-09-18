/**
 * Central brand & visual-token configuration.
 *
 * Every product name, tagline, colour and shape token used across the app,
 * the PWA manifest, generated icons, e-mail templates and exported PDFs
 * reads from this single file. Rebranding the product is a matter of
 * editing the values below — no other file should hard-code brand copy
 * or hex colours.
 */

export const brand = {
  name: 'Slipsy',
  shortName: 'Slipsy',
  legalName: 'Slipsy',
  tagline: 'Scan it. Save it. Done.',
  description:
    'Slipsy turns piles of paper slips into an organised, searchable, accountant-ready record — in seconds.',
  taglines: [
    'Your slips, sorted.',
    'Scan it. Save it. Done.',
    'No more piles of paper.',
    'Everything is safely filed.',
    'Ready for your accountant.',
  ],
  supportEmail: 'support@slipsy.app',
  websiteUrl: 'https://slipsy.app',
  themeColor: '#0F3D2E',
  backgroundColor: '#F7F9F7',
} as const;

/**
 * Colour tokens. Values are raw HSL channel strings (no `hsl()` wrapper) so
 * they can be consumed both by Tailwind (`hsl(var(--forest-900))`) and by
 * plain TypeScript (e.g. PDF/export generation, canvas icon rendering).
 */
export const colorTokens = {
  forest: {
    50: '150 30% 96%',
    100: '150 28% 90%',
    200: '150 26% 78%',
    300: '150 24% 62%',
    400: '152 30% 46%',
    500: '154 40% 32%',
    600: '156 48% 24%',
    700: '158 52% 18%',
    800: '160 56% 14%',
    900: '162 60% 10%',
  },
  green: {
    50: '146 60% 95%',
    100: '146 55% 88%',
    200: '146 50% 76%',
    300: '146 48% 62%',
    400: '146 46% 50%',
    500: '146 55% 40%',
    600: '146 62% 33%',
    700: '146 65% 26%',
    800: '146 66% 20%',
    900: '146 68% 14%',
  },
  mint: {
    50: '150 55% 97%',
    100: '150 55% 93%',
    200: '150 50% 86%',
    300: '150 45% 76%',
    400: '150 42% 64%',
    500: '150 40% 52%',
  },
  neutral: {
    0: '0 0% 100%',
    50: '110 15% 98%',
    100: '110 12% 96%',
    200: '110 10% 91%',
    300: '110 8% 83%',
    400: '110 6% 65%',
    500: '110 5% 48%',
    600: '120 8% 36%',
    700: '130 12% 24%',
    800: '140 15% 16%',
    900: '150 18% 11%',
  },
  charcoal: '150 18% 13%',
  danger: {
    50: '0 70% 96%',
    500: '0 65% 48%',
    600: '0 68% 40%',
  },
  warning: {
    50: '42 90% 95%',
    500: '38 85% 48%',
    600: '36 82% 40%',
  },
  info: {
    50: '205 70% 96%',
    500: '205 65% 45%',
  },
} as const;

export const radiusTokens = {
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  '2xl': '2rem',
  full: '9999px',
} as const;

export const defaultCategories = [
  'Groceries & Supplies',
  'Fuel & Travel',
  'Meals & Entertainment',
  'Office Supplies',
  'Equipment',
  'Utilities',
  'Rent & Lease',
  'Professional Services',
  'Marketing & Advertising',
  'Repairs & Maintenance',
  'Insurance',
  'Bank & Card Fees',
  'Stock & Inventory',
  'Staff & Wages',
  'Other',
] as const;

export const defaultCurrency = 'ZAR';

export const supportedCurrencies = ['ZAR', 'USD', 'GBP', 'EUR', 'NAD', 'BWP'] as const;
