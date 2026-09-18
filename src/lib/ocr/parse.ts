import { PaymentMethod } from '@prisma/client';
import { parseAmountToCents, splitTaxInclusive, sumCents } from '@/lib/money';
import type { ConfidenceMap, OcrRawResult, ParsedLineItem, ParsedReceipt, StructuredHints } from './types';

/**
 * Turns raw OCR output into the structured receipt fields the review screen
 * suggests to the user. Nothing here is ever saved without the user seeing it —
 * every field carries a confidence score and low-confidence fields are flagged.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const CURRENCY_SIGNS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /\bZAR\b|(?<![A-Za-z])R\s?\d/, code: 'ZAR' },
  { pattern: /\bUSD\b|\$\s?\d/, code: 'USD' },
  { pattern: /\bEUR\b|€\s?\d/, code: 'EUR' },
  { pattern: /\bGBP\b|£\s?\d/, code: 'GBP' },
  { pattern: /\bNAD\b|N\$\s?\d/, code: 'NAD' },
  { pattern: /\bBWP\b|\bPULA\b/i, code: 'BWP' },
];

const TOTAL_KEYWORDS = [
  { pattern: /\b(grand\s*total|total\s*due|amount\s*due|balance\s*due|total\s*to\s*pay|total\s*payable)\b/i, weight: 1.0 },
  { pattern: /\btotal\s*(incl|inclusive|inc\.?\s*vat)\b/i, weight: 0.98 },
  { pattern: /(?<!sub\s?)(?<!sub)\btotal\b/i, weight: 0.9 },
  { pattern: /\bto\s*pay\b/i, weight: 0.85 },
];

const SUBTOTAL_PATTERN = /\bsub[\s-]?total\b|\btotal\s*excl(?:uding|\.)?\s*vat\b|\bexcl(?:\.|uding)?\s*vat\b/i;
const TAX_PATTERN = /\bvat\b|\btax\b|\bgst\b|\bbtw\b/i;
const TAX_EXCLUDE_PATTERN = /\bvat\s*(?:reg|registration|no|number|nr)\b|\btax\s*invoice\b|\bvat\s*inclusive\b(?!.*\d[.,]\d{2})/i;
const NON_TOTAL_PATTERN =
  /\b(change|tendered|cash\s*received|rounding|savings?|discount|you\s*saved|points|balance\s*b\/?f|opening|deposit|tip|gratuity|subtotal)\b/i;

const MERCHANT_NOISE_PATTERN =
  /\b(tax\s*invoice|vat\s*(?:reg|no|number)|reg(?:istration)?\s*no|company\s*reg|tel|fax|www\.|https?:|@|receipt|invoice|slip|customer\s*copy|merchant\s*copy|terminal|cashier|till|store\s*no|branch\s*code|p\.?o\.?\s*box|street|road|avenue|ave\b|str\b|drive\b|suite|floor|thank\s*you|welcome)\b/i;

const RECEIPT_NUMBER_PATTERNS = [
  /\b(?:tax\s*invoice|invoice|receipt|slip|docket|doc|transaction|trans|order|ref(?:erence)?)\s*(?:no\.?|num(?:ber)?|nr\.?|#|:)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/]{2,24})\b/i,
  /\b(?:inv|rcpt|txn)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\-\/]{2,24})\b/i,
];

const PAYMENT_PATTERNS: Array<{ pattern: RegExp; method: PaymentMethod }> = [
  { pattern: /\b(snapscan|zapper|apple\s*pay|samsung\s*pay|google\s*pay|mobile\s*(?:money|pay)|qr\s*code)\b/i, method: PaymentMethod.MOBILE },
  { pattern: /\b(debit\s*order|stop\s*order)\b/i, method: PaymentMethod.DEBIT_ORDER },
  { pattern: /\b(eft|electronic\s*transfer|bank\s*transfer|instant\s*eft|payfast|ozow)\b/i, method: PaymentMethod.EFT },
  { pattern: /\b(cash|contant)\b/i, method: PaymentMethod.CASH },
  { pattern: /\b(visa|mastercard|master\s*card|amex|american\s*express|credit\s*card|debit\s*card|chip\s*(?:&|and)\s*pin|card\s*payment|bank\s*card|contactless)\b/i, method: PaymentMethod.CARD },
];

/** Matches money-looking tokens: 1 234,56 / 1,234.56 / 45.00 / R45,00 */
const AMOUNT_TOKEN = /(?:R|ZAR|N\$|\$|€|£)?\s?-?\d{1,3}(?:[  ,.]\d{3})*[.,]\d{2}(?![\d.,])|(?:R|ZAR|N\$|\$|€|£)\s?-?\d+(?![\d.,])/gi;

export interface ParseOptions {
  /** Business default, used when the document does not state a currency. */
  defaultCurrency?: string;
  /** Statutory rate used only to derive VAT when the slip states a rate but no amount. */
  defaultTaxRatePercent?: number;
  /** "Today" — injectable so tests are deterministic. */
  now?: Date;
}

export function parseReceipt(raw: OcrRawResult, options: ParseOptions = {}): ParsedReceipt {
  const defaultCurrency = options.defaultCurrency ?? 'ZAR';
  const now = options.now ?? new Date();
  const baseConfidence = clamp01(raw.confidence || 0.5);

  const lines = (raw.lines.length ? raw.lines.map((l) => l.text) : raw.text.split(/\r?\n/))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);

  const lineConfidence = raw.lines.length
    ? raw.lines.map((l) => clamp01(l.confidence))
    : lines.map(() => baseConfidence);

  const hints = raw.structured;
  const fieldConfidence: ConfidenceMap = {};

  const currency = detectCurrency(lines, hints, defaultCurrency);
  fieldConfidence.currency = hints?.currency ? clamp01(hints.currency.confidence) : currency === defaultCurrency ? 0.6 : 0.85;

  const merchant = fromHint(hints?.merchantName) ?? detectMerchant(lines, lineConfidence);
  if (merchant) {
    fieldConfidence.merchantName = hints?.merchantName
      ? clamp01(hints.merchantName.confidence)
      : clamp01(merchant.confidence * baseConfidence + 0.1);
  }

  const dateHint = hints?.purchaseDate ? parseDateCandidate(hints.purchaseDate.value, now) : null;
  const detectedDate = dateHint ? { date: dateHint, confidence: clamp01(hints!.purchaseDate!.confidence) } : detectDate(lines, now);
  if (detectedDate) fieldConfidence.purchaseDate = clamp01(detectedDate.confidence * (0.6 + 0.4 * baseConfidence));

  const time = fromHint(hints?.purchaseTime)?.value ?? detectTime(lines);
  if (time) fieldConfidence.purchaseTime = hints?.purchaseTime ? clamp01(hints.purchaseTime.confidence) : 0.8;

  const receiptNumber = fromHint(hints?.receiptNumber)?.value ?? detectReceiptNumber(lines);
  if (receiptNumber) {
    fieldConfidence.receiptNumber = hints?.receiptNumber ? clamp01(hints.receiptNumber.confidence) : clamp01(0.75 * baseConfidence + 0.15);
  }

  const amounts = detectAmounts(lines, lineConfidence, currency, hints, options.defaultTaxRatePercent ?? 15);
  if (amounts.totalCents !== null) fieldConfidence.totalCents = amounts.totalConfidence;
  if (amounts.subtotalCents !== null) fieldConfidence.subtotalCents = amounts.subtotalConfidence;
  if (amounts.taxCents !== null) fieldConfidence.taxCents = amounts.taxConfidence;

  const paymentMethod = detectPaymentMethod(lines, hints);
  if (paymentMethod !== PaymentMethod.UNKNOWN) fieldConfidence.paymentMethod = 0.8;

  const lineItems = hints?.lineItems?.length
    ? hints.lineItems.map<ParsedLineItem>((item) => ({
        description: item.description.trim(),
        quantity: item.quantity ? Number.parseFloat(item.quantity.replace(',', '.')) || null : null,
        unitCents: parseAmountToCents(item.unitPrice ?? null, currency),
        totalCents: parseAmountToCents(item.total ?? null, currency),
      }))
    : detectLineItems(lines, currency, amounts.totalCents);
  if (lineItems.length) {
    fieldConfidence.lineItems = hints?.lineItems?.length ? 0.85 : clamp01(0.55 * baseConfidence);
  }

  // Internal consistency: subtotal + tax === total is strong corroboration.
  if (
    amounts.totalCents !== null &&
    amounts.subtotalCents !== null &&
    amounts.taxCents !== null &&
    sumCents([amounts.subtotalCents, amounts.taxCents]) === amounts.totalCents
  ) {
    fieldConfidence.totalCents = clamp01((fieldConfidence.totalCents ?? 0.5) + 0.15);
    fieldConfidence.subtotalCents = clamp01((fieldConfidence.subtotalCents ?? 0.5) + 0.15);
    fieldConfidence.taxCents = clamp01((fieldConfidence.taxCents ?? 0.5) + 0.15);
  }

  const scores = Object.values(fieldConfidence).filter((value): value is number => typeof value === 'number');
  const confidence = scores.length ? clamp01(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return {
    merchantName: merchant?.value ?? null,
    receiptNumber: receiptNumber ?? null,
    purchaseDate: detectedDate?.date ?? null,
    purchaseTime: time ?? null,
    currency,
    subtotalCents: amounts.subtotalCents,
    taxCents: amounts.taxCents,
    totalCents: amounts.totalCents,
    paymentMethod,
    lineItems,
    fieldConfidence,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Field detectors
// ---------------------------------------------------------------------------

function detectCurrency(lines: string[], hints: StructuredHints | undefined, fallback: string): string {
  const hinted = hints?.currency?.value?.trim().toUpperCase();
  if (hinted && /^[A-Z]{3}$/.test(hinted)) return hinted;

  const text = lines.join('\n');
  for (const { pattern, code } of CURRENCY_SIGNS) {
    if (pattern.test(text)) return code;
  }
  return fallback;
}

function detectMerchant(lines: string[], confidences: number[]): { value: string; confidence: number } | null {
  const candidates: Array<{ value: string; score: number }> = [];

  lines.slice(0, 8).forEach((line, index) => {
    const cleaned = line.replace(/[*|]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleaned.length < 3 || cleaned.length > 60) return;
    if (MERCHANT_NOISE_PATTERN.test(cleaned)) return;
    if (/^\d[\d\s\-/.,]*$/.test(cleaned)) return; // pure numbers / dates
    if (AMOUNT_TOKEN.test(cleaned)) {
      AMOUNT_TOKEN.lastIndex = 0;
      return;
    }
    AMOUNT_TOKEN.lastIndex = 0;

    const letters = cleaned.replace(/[^A-Za-z]/g, '').length;
    if (letters < 3) return;

    const upperRatio = letters > 0 ? cleaned.replace(/[^A-Z]/g, '').length / letters : 0;
    let score = 1 - index * 0.12;
    if (upperRatio > 0.7) score += 0.2;
    if (index === 0) score += 0.1;
    if (/\b(pty|ltd|cc|inc|group|stores?|supermarket|pharmacy|garage|fuel|cafe|restaurant)\b/i.test(cleaned)) score += 0.15;

    const lineConf = confidences[index] ?? 0.5;
    candidates.push({ value: titleCaseIfShouting(cleaned), score: clamp01(score) * (0.6 + 0.4 * lineConf) });
  });

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0]!;
  return { value: best.value, confidence: clamp01(best.score) };
}

function titleCaseIfShouting(value: string): string {
  const letters = value.replace(/[^A-Za-z]/g, '');
  if (letters.length > 3 && letters === letters.toUpperCase()) {
    return value
      .toLowerCase()
      .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      .replace(/\b(Pty|Ltd|Cc|Bk)\b/g, (m) => m.toUpperCase());
  }
  return value;
}

export function parseDateCandidate(text: string, now: Date): Date | null {
  const cleaned = text.replace(/ /g, ' ').trim();

  // ISO: 2026-09-18
  const iso = cleaned.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) {
    const parsed = buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), now);
    if (parsed) return parsed;
  }

  // Day-first (South African convention): 18/09/2026, 18-09-26, 18.09.2026
  const dayFirst = cleaned.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (dayFirst) {
    const first = Number(dayFirst[1]);
    const second = Number(dayFirst[2]);
    const year = normaliseYear(Number(dayFirst[3]));
    // If the first component cannot be a day, fall back to month-first.
    const dayFirstValid = first <= 31 && second <= 12;
    const monthFirstValid = first <= 12 && second <= 31;
    if (dayFirstValid) {
      const parsed = buildDate(year, second, first, now);
      if (parsed) return parsed;
    }
    if (monthFirstValid) {
      const parsed = buildDate(year, first, second, now);
      if (parsed) return parsed;
    }
  }

  // 18 Sep 2026 / 18 September 2026
  const textualDayFirst = cleaned.match(/\b(\d{1,2})\s*(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?[\s,-]+(\d{2,4})\b/);
  if (textualDayFirst) {
    const month = MONTHS[textualDayFirst[2]!.toLowerCase()];
    if (month) {
      const parsed = buildDate(normaliseYear(Number(textualDayFirst[3])), month, Number(textualDayFirst[1]), now);
      if (parsed) return parsed;
    }
  }

  // Sep 18, 2026
  const textualMonthFirst = cleaned.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*(?:st|nd|rd|th)?[\s,]+(\d{2,4})\b/);
  if (textualMonthFirst) {
    const month = MONTHS[textualMonthFirst[1]!.toLowerCase()];
    if (month) {
      const parsed = buildDate(normaliseYear(Number(textualMonthFirst[3])), month, Number(textualMonthFirst[2]), now);
      if (parsed) return parsed;
    }
  }

  return null;
}

function normaliseYear(year: number): number {
  if (year >= 1000) return year;
  return year >= 70 ? 1900 + year : 2000 + year;
}

function buildDate(year: number, month: number, day: number, now: Date): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 2000 || year > now.getUTCFullYear() + 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  // A purchase cannot be meaningfully in the future.
  const tomorrow = new Date(now.getTime() + 36 * 60 * 60 * 1000);
  if (date.getTime() > tomorrow.getTime()) return null;
  return date;
}

function detectDate(lines: string[], now: Date): { date: Date; confidence: number } | null {
  const candidates: Array<{ date: Date; confidence: number }> = [];

  lines.forEach((line, index) => {
    const date = parseDateCandidate(line, now);
    if (!date) return;
    let confidence = 0.65;
    if (/\b(date|datum|issued|invoice\s*date|transaction\s*date)\b/i.test(line)) confidence += 0.2;
    if (index < lines.length / 2) confidence += 0.05;
    const ageDays = (now.getTime() - date.getTime()) / 86_400_000;
    if (ageDays >= 0 && ageDays <= 400) confidence += 0.1;
    candidates.push({ date, confidence: clamp01(confidence) });
  });

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.confidence - a.confidence || b.date.getTime() - a.date.getTime());
  return candidates[0]!;
}

function detectTime(lines: string[]): string | null {
  for (const line of lines) {
    const match = line.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:[:.][0-5]\d)?\s*(am|pm)?\b/i);
    if (!match) continue;
    let hour = Number(match[1]);
    const minute = match[2]!;
    const meridiem = match[3]?.toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    // Avoid matching things like "15.00" prices — require a colon or am/pm.
    if (!line.includes(':') && !meridiem) continue;
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }
  return null;
}

function detectReceiptNumber(lines: string[]): string | null {
  for (const line of lines) {
    for (const pattern of RECEIPT_NUMBER_PATTERNS) {
      const match = line.match(pattern);
      const value = match?.[1]?.trim();
      if (!value) continue;
      if (/^(no|number|nr|date|total|invoice|receipt)$/i.test(value)) continue;
      if (!/\d/.test(value)) continue;
      return value.toUpperCase();
    }
  }
  return null;
}

function detectPaymentMethod(lines: string[], hints: StructuredHints | undefined): PaymentMethod {
  const hinted = hints?.paymentMethod?.value?.toLowerCase();
  if (hinted) {
    for (const { pattern, method } of PAYMENT_PATTERNS) {
      if (pattern.test(hinted)) return method;
    }
  }
  const text = lines.join('\n');
  for (const { pattern, method } of PAYMENT_PATTERNS) {
    if (pattern.test(text)) return method;
  }
  return PaymentMethod.UNKNOWN;
}

/** All money-looking values on a line, in minor units, left to right. */
export function amountsInLine(line: string, currency: string): number[] {
  const matches = line.match(AMOUNT_TOKEN) ?? [];
  AMOUNT_TOKEN.lastIndex = 0;
  return matches
    .map((token) => parseAmountToCents(token, currency))
    .filter((value): value is number => value !== null);
}

interface AmountResult {
  totalCents: number | null;
  subtotalCents: number | null;
  taxCents: number | null;
  totalConfidence: number;
  subtotalConfidence: number;
  taxConfidence: number;
}

function detectAmounts(
  lines: string[],
  confidences: number[],
  currency: string,
  hints: StructuredHints | undefined,
  defaultTaxRate: number,
): AmountResult {
  const result: AmountResult = {
    totalCents: parseAmountToCents(hints?.total?.value ?? null, currency),
    subtotalCents: parseAmountToCents(hints?.subtotal?.value ?? null, currency),
    taxCents: parseAmountToCents(hints?.tax?.value ?? null, currency),
    totalConfidence: hints?.total ? clamp01(hints.total.confidence) : 0,
    subtotalConfidence: hints?.subtotal ? clamp01(hints.subtotal.confidence) : 0,
    taxConfidence: hints?.tax ? clamp01(hints.tax.confidence) : 0,
  };

  let bestTotal: { cents: number; confidence: number } | null =
    result.totalCents !== null ? { cents: result.totalCents, confidence: result.totalConfidence } : null;
  let bestSubtotal: { cents: number; confidence: number } | null =
    result.subtotalCents !== null ? { cents: result.subtotalCents, confidence: result.subtotalConfidence } : null;
  let bestTax: { cents: number; confidence: number } | null =
    result.taxCents !== null ? { cents: result.taxCents, confidence: result.taxConfidence } : null;
  let taxRatePercent: number | null = null;

  lines.forEach((line, index) => {
    const lineConf = confidences[index] ?? 0.6;
    const amounts = amountsInLine(line, currency);
    const positionBoost = index / Math.max(lines.length - 1, 1) > 0.5 ? 0.08 : 0; // totals live near the bottom

    if (SUBTOTAL_PATTERN.test(line) && amounts.length) {
      const cents = amounts[amounts.length - 1]!;
      const confidence = clamp01(0.82 * (0.55 + 0.45 * lineConf) + positionBoost);
      if (!bestSubtotal || confidence > bestSubtotal.confidence) bestSubtotal = { cents, confidence };
      return;
    }

    if (TAX_PATTERN.test(line) && !TAX_EXCLUDE_PATTERN.test(line)) {
      const rate = line.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
      if (rate) taxRatePercent = Number(rate[1]!.replace(',', '.'));
      const taxAmounts = amounts.filter((cents) => cents > 0);
      if (taxAmounts.length) {
        const cents = taxAmounts[taxAmounts.length - 1]!;
        const confidence = clamp01(0.8 * (0.55 + 0.45 * lineConf) + positionBoost);
        if (!bestTax || confidence > bestTax.confidence) bestTax = { cents, confidence };
      }
      return;
    }

    if (NON_TOTAL_PATTERN.test(line)) return;

    for (const { pattern, weight } of TOTAL_KEYWORDS) {
      if (!pattern.test(line)) continue;
      if (!amounts.length) break;
      const cents = amounts[amounts.length - 1]!;
      if (cents <= 0) break;
      const confidence = clamp01(weight * (0.5 + 0.5 * lineConf) + positionBoost);
      if (!bestTotal || confidence > bestTotal.confidence) bestTotal = { cents, confidence };
      break;
    }
  });

  // Last resort: no "total" keyword anywhere — take the largest amount on the
  // slip, flagged as low confidence so the user is asked to confirm it.
  if (!bestTotal) {
    const all = lines.flatMap((line) => (NON_TOTAL_PATTERN.test(line) ? [] : amountsInLine(line, currency)));
    const max = all.filter((cents) => cents > 0).sort((a, b) => b - a)[0];
    if (max !== undefined) bestTotal = { cents: max, confidence: 0.35 };
  }

  result.totalCents = bestTotal ? bestTotal.cents : null;
  result.totalConfidence = bestTotal ? bestTotal.confidence : 0;
  result.subtotalCents = bestSubtotal ? bestSubtotal.cents : null;
  result.subtotalConfidence = bestSubtotal ? bestSubtotal.confidence : 0;
  result.taxCents = bestTax ? bestTax.cents : null;
  result.taxConfidence = bestTax ? bestTax.confidence : 0;

  // Derive the missing leg when two of three are known.
  if (result.totalCents !== null && result.subtotalCents !== null && result.taxCents === null) {
    const derived = result.totalCents - result.subtotalCents;
    if (derived >= 0 && derived < result.totalCents) {
      result.taxCents = derived;
      result.taxConfidence = 0.55;
    }
  } else if (result.totalCents !== null && result.taxCents !== null && result.subtotalCents === null) {
    const derived = result.totalCents - result.taxCents;
    if (derived > 0) {
      result.subtotalCents = derived;
      result.subtotalConfidence = 0.55;
    }
  } else if (result.totalCents !== null && result.taxCents === null && result.subtotalCents === null) {
    // Only a stated VAT rate is available: derive the split, low confidence.
    const rate = taxRatePercent ?? (/\bvat\b/i.test(lines.join(' ')) ? defaultTaxRate : null);
    if (rate && rate > 0 && rate < 50) {
      const split = splitTaxInclusive(result.totalCents, rate);
      result.taxCents = split.taxCents;
      result.subtotalCents = split.subtotalCents;
      result.taxConfidence = 0.4;
      result.subtotalConfidence = 0.4;
    }
  }

  // Reject impossible combinations rather than saving nonsense.
  if (result.totalCents !== null && result.taxCents !== null && result.taxCents > result.totalCents) {
    result.taxCents = null;
    result.taxConfidence = 0;
  }
  if (result.totalCents !== null && result.subtotalCents !== null && result.subtotalCents > result.totalCents) {
    result.subtotalCents = null;
    result.subtotalConfidence = 0;
  }

  return result;
}

function detectLineItems(lines: string[], currency: string, totalCents: number | null): ParsedLineItem[] {
  const items: ParsedLineItem[] = [];

  for (const line of lines) {
    if (NON_TOTAL_PATTERN.test(line) || SUBTOTAL_PATTERN.test(line) || TAX_PATTERN.test(line)) continue;
    if (TOTAL_KEYWORDS.some(({ pattern }) => pattern.test(line))) continue;

    const amounts = amountsInLine(line, currency);
    if (amounts.length === 0) continue;

    const lastAmountIndex = line.search(AMOUNT_TOKEN);
    AMOUNT_TOKEN.lastIndex = 0;
    if (lastAmountIndex <= 0) continue;

    const description = line
      .slice(0, lastAmountIndex)
      .replace(/[*x#]\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (description.length < 2 || description.length > 60) continue;
    if (!/[A-Za-z]{2}/.test(description)) continue;

    const quantityMatch = description.match(/^(\d+(?:[.,]\d{1,3})?)\s*(?:x|\*)\s*(.+)$/i);
    const totalForLine = amounts[amounts.length - 1] ?? null;
    const unitForLine = amounts.length > 1 ? amounts[amounts.length - 2]! : null;

    items.push({
      description: quantityMatch ? quantityMatch[2]!.trim() : description,
      quantity: quantityMatch ? Number(quantityMatch[1]!.replace(',', '.')) : null,
      unitCents: unitForLine,
      totalCents: totalForLine,
    });
  }

  if (items.length < 2) return [];

  // Only keep line items when they plausibly reconcile against the total —
  // otherwise they are OCR noise and would mislead the user.
  if (totalCents !== null) {
    const itemsSum = sumCents(items.map((item) => item.totalCents));
    const ratio = itemsSum / totalCents;
    if (ratio < 0.5 || ratio > 1.6) return [];
  }

  return items.slice(0, 60);
}

function fromHint(hint: { value: string; confidence: number } | undefined): { value: string; confidence: number } | null {
  if (!hint?.value?.trim()) return null;
  return { value: hint.value.trim(), confidence: clamp01(hint.confidence) };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
