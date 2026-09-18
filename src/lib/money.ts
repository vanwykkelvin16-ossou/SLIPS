import Decimal from 'decimal.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export const CURRENCY_META: Record<string, { symbol: string; name: string; decimals: number }> = {
  ZAR: { symbol: 'R', name: 'South African Rand', decimals: 2 },
  USD: { symbol: '$', name: 'US Dollar', decimals: 2 },
  GBP: { symbol: '£', name: 'Pound Sterling', decimals: 2 },
  EUR: { symbol: '€', name: 'Euro', decimals: 2 },
  NAD: { symbol: 'N$', name: 'Namibian Dollar', decimals: 2 },
  BWP: { symbol: 'P', name: 'Botswana Pula', decimals: 2 },
};

const DEFAULT_META = { symbol: '', name: '', decimals: 2 };

export function currencyMeta(currency: string) {
  return CURRENCY_META[currency.toUpperCase()] ?? { ...DEFAULT_META, symbol: currency.toUpperCase() };
}

/**
 * Convert a user-entered major-unit string/number ("1 234,56", "1,234.56", 12.5)
 * into integer minor units. Returns null when the input is not a valid amount.
 *
 * Handles both South African (space thousands, comma decimal) and
 * anglo-american (comma thousands, dot decimal) conventions.
 */
export function parseAmountToCents(input: string | number | null | undefined, currency = 'ZAR'): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return decimalToCents(new Decimal(input.toString()), currency);
  }

  let raw = input.trim();
  if (!raw) return null;

  // Strip currency symbols, letters and non-breaking/regular spaces used as separators.
  raw = raw.replace(/[A-Za-z$€£¥₹]/g, '').replace(/ /g, ' ').trim();

  const negative = /^\(.*\)$/.test(raw) || raw.startsWith('-');
  raw = raw.replace(/[()\-+]/g, '').trim();

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');

  let normalised: string;
  if (lastComma === -1 && lastDot === -1) {
    normalised = raw.replace(/\s/g, '');
  } else if (lastComma > lastDot) {
    // Comma is the decimal separator: "1 234,56" / "1.234,56"
    normalised = raw.replace(/[\s.]/g, '').replace(',', '.');
  } else {
    // Dot is the decimal separator: "1,234.56" / "1 234.56"
    normalised = raw.replace(/[\s,]/g, '');
  }

  if (!/^\d*\.?\d*$/.test(normalised) || normalised === '' || normalised === '.') return null;

  try {
    const value = new Decimal(normalised);
    const cents = decimalToCents(value, currency);
    if (cents === null) return null;
    return negative ? -cents : cents;
  } catch {
    return null;
  }
}

function decimalToCents(value: Decimal, currency: string): number | null {
  const { decimals } = currencyMeta(currency);
  const scaled = value.times(new Decimal(10).pow(decimals)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  if (!scaled.isFinite()) return null;
  const asNumber = scaled.toNumber();
  if (!Number.isSafeInteger(asNumber)) return null;
  return asNumber;
}

/** Integer minor units -> plain major-unit string ("123456" -> "1234.56"), for form inputs. */
export function centsToInputValue(cents: number | null | undefined, currency = 'ZAR'): string {
  if (cents === null || cents === undefined) return '';
  const { decimals } = currencyMeta(currency);
  return new Decimal(cents).dividedBy(new Decimal(10).pow(decimals)).toFixed(decimals);
}

/**
 * Format integer minor units for display.
 * ZAR renders in the South African convention: `R 1 234,56`.
 */
export function formatMoney(
  cents: number | null | undefined,
  currency = 'ZAR',
  options: { withSymbol?: boolean } = {},
): string {
  const { withSymbol = true } = options;
  // The same non-breaking space as a real amount, so a column of values lines up.
  if (cents === null || cents === undefined) return withSymbol ? `${currencyMeta(currency).symbol} —` : '—';

  const meta = currencyMeta(currency);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const major = new Decimal(abs).dividedBy(new Decimal(10).pow(meta.decimals));
  const fixed = major.toFixed(meta.decimals);
  const [wholeRaw = '0', fraction = ''] = fixed.split('.');
  const grouped = wholeRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  const useCommaDecimal = currency.toUpperCase() === 'ZAR' || currency.toUpperCase() === 'NAD';
  const decimalSep = useCommaDecimal ? ',' : '.';
  const body = meta.decimals > 0 ? `${grouped}${decimalSep}${fraction}` : grouped;
  const sign = negative ? '-' : '';

  return withSymbol ? `${sign}${meta.symbol} ${body}` : `${sign}${body}`;
}

/** Filename-safe money rendering: 24590 -> "R245-90". */
export function formatMoneyForFilename(cents: number | null | undefined, currency = 'ZAR'): string {
  if (cents === null || cents === undefined) return 'no-total';
  const meta = currencyMeta(currency);
  const abs = Math.abs(cents);
  const fixed = new Decimal(abs).dividedBy(new Decimal(10).pow(meta.decimals)).toFixed(meta.decimals);
  const symbol = (meta.symbol || currency).replace(/[^A-Za-z$€£]/g, '') || currency;
  return `${cents < 0 ? '-' : ''}${symbol}${fixed.replace('.', '-')}`;
}

/** Exact integer sum — no floating point involved. */
export function sumCents(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, value) => acc + (value ?? 0), 0);
}

/**
 * VAT/tax helper: given a tax-inclusive total and a rate (e.g. 15 for 15%),
 * returns the exact tax and subtotal components in minor units.
 */
export function splitTaxInclusive(totalCents: number, ratePercent: number): { taxCents: number; subtotalCents: number } {
  const total = new Decimal(totalCents);
  const rate = new Decimal(ratePercent).dividedBy(100);
  const tax = total.times(rate).dividedBy(rate.plus(1)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const taxCents = tax.toNumber();
  return { taxCents, subtotalCents: totalCents - taxCents };
}

/** True when subtotal + tax reconciles exactly against the total. */
export function totalsReconcile(
  subtotalCents: number | null | undefined,
  taxCents: number | null | undefined,
  totalCents: number | null | undefined,
): boolean | null {
  if (totalCents === null || totalCents === undefined) return null;
  if ((subtotalCents === null || subtotalCents === undefined) && (taxCents === null || taxCents === undefined)) return null;
  return sumCents([subtotalCents, taxCents]) === totalCents;
}
