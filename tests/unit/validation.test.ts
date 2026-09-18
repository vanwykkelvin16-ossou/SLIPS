import { describe, expect, it } from 'vitest';
import {
  changePasswordSchema,
  emailSchema,
  exportRequestSchema,
  normalisePhone,
  passwordSchema,
  phoneSchema,
  signupSchema,
} from '@/lib/validation';

describe('phone numbers', () => {
  it('accepts South African numbers written the local way', () => {
    expect(normalisePhone('082 123 4567')).toBe('+27821234567');
    expect(normalisePhone('0821234567')).toBe('+27821234567');
    expect(normalisePhone('082-123-4567')).toBe('+27821234567');
    expect(normalisePhone('+27 82 123 4567')).toBe('+27821234567');
  });

  it('accepts international numbers with a country code', () => {
    expect(normalisePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('rejects numbers that are not real', () => {
    expect(normalisePhone('12345')).toBeNull();
    expect(normalisePhone('not a phone')).toBeNull();
    expect(normalisePhone('')).toBeNull();
  });

  it('normalises through the schema', () => {
    expect(phoneSchema.parse('082 123 4567')).toBe('+27821234567');
    expect(phoneSchema.safeParse('12345').success).toBe(false);
  });
});

describe('email', () => {
  it('lowercases and trims', () => {
    expect(emailSchema.parse('  Thandi@Example.CO.ZA ')).toBe('thandi@example.co.za');
  });

  it('rejects malformed addresses', () => {
    for (const bad of ['', 'no-at-sign', 'two@@example.com', 'trailing@']) {
      expect(emailSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('passwords', () => {
  it('accepts a reasonable passphrase', () => {
    expect(passwordSchema.safeParse('correct-horse-battery-7').success).toBe(true);
    expect(passwordSchema.safeParse('purple elephant marmalade').success).toBe(true);
  });

  it('rejects short or obvious choices', () => {
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('password123').success).toBe(false);
    expect(passwordSchema.safeParse('1234567890').success).toBe(false);
  });
});

describe('signup', () => {
  const valid = {
    firstName: 'Thandi',
    businessName: 'Thandi Trading',
    phone: '082 123 4567',
    email: 'thandi@example.co.za',
    password: 'correct-horse-battery-7',
    confirmPassword: 'correct-horse-battery-7',
    acceptTerms: true as const,
  };

  it('accepts a complete form and normalises it', () => {
    const parsed = signupSchema.parse(valid);
    expect(parsed.phone).toBe('+27821234567');
    expect(parsed.email).toBe('thandi@example.co.za');
  });

  it('requires both passwords to match', () => {
    const result = signupSchema.safeParse({ ...valid, confirmPassword: 'something-else-1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('confirmPassword'))).toBe(true);
    }
  });

  it('requires the terms to be accepted', () => {
    expect(signupSchema.safeParse({ ...valid, acceptTerms: false }).success).toBe(false);
  });

  it('requires a first name and a business name', () => {
    expect(signupSchema.safeParse({ ...valid, firstName: '   ' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, businessName: '' }).success).toBe(false);
  });
});

describe('change password', () => {
  it('requires the current password and a matching new pair', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'old-one',
        password: 'correct-horse-battery-7',
        confirmPassword: 'correct-horse-battery-7',
      }).success,
    ).toBe(true);

    expect(
      changePasswordSchema.safeParse({
        currentPassword: '',
        password: 'correct-horse-battery-7',
        confirmPassword: 'correct-horse-battery-7',
      }).success,
    ).toBe(false);
  });
});

describe('export requests', () => {
  it('requires a selection to contain slips', () => {
    expect(exportRequestSchema.safeParse({ type: 'SELECTION', receiptIds: [] }).success).toBe(false);
  });

  it('requires a folder for a folder export', () => {
    expect(exportRequestSchema.safeParse({ type: 'FOLDER' }).success).toBe(false);
  });

  it('requires both ends of a date range, in order', () => {
    expect(exportRequestSchema.safeParse({ type: 'DATE_RANGE', from: '2026-01-01' }).success).toBe(false);
    expect(
      exportRequestSchema.safeParse({ type: 'DATE_RANGE', from: '2026-12-01', to: '2026-01-01' }).success,
    ).toBe(false);
    expect(
      exportRequestSchema.safeParse({ type: 'DATE_RANGE', from: '2026-01-01', to: '2026-12-31' }).success,
    ).toBe(true);
  });

  it('accepts a whole-workspace export with no extra input', () => {
    const parsed = exportRequestSchema.parse({ type: 'FULL_WORKSPACE' });
    expect(parsed.summaryFormat).toBe('csv');
    expect(parsed.includeCombinedPdf).toBe(false);
  });
});
