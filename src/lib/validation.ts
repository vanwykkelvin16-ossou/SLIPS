import parsePhoneNumberFromString from 'libphonenumber-js';
import { z } from 'zod';
import { supportedCurrencies } from '@/config/brand';

export const MIN_PASSWORD_LENGTH = 10;

/**
 * Normalises a phone number to E.164. South African numbers may be typed in
 * the familiar local form (082 123 4567) and are upgraded to +27… ; any other
 * country works when entered with its international prefix.
 */
export function normalisePhone(input: string, defaultCountry: 'ZA' = 'ZA'): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

export function formatPhoneForDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  return parsed?.formatInternational() ?? e164;
}

export const phoneSchema = z
  .string()
  .trim()
  .min(6, 'Enter a telephone number')
  .max(24, 'That number looks too long')
  .transform((value, ctx) => {
    const normalised = normalisePhone(value);
    if (!normalised) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid number, for example 082 123 4567 or +27 82 123 4567',
      });
      return z.NEVER;
    }
    return normalised;
  });

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your e-mail address')
  .max(254, 'That e-mail address is too long')
  .email('Enter a valid e-mail address')
  .transform((value) => value.toLowerCase());

/** Rejects the obvious weak choices without frustrating passphrase users. */
export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(200, 'That password is too long')
  .refine((value) => /[a-z]/i.test(value), 'Include at least one letter')
  .refine((value) => /\d/.test(value) || value.length >= 14, 'Include a number, or use 14+ characters')
  .refine(
    (value) => !['password12', 'password123', '1234567890', 'qwertyuiop', 'letmein123'].includes(value.toLowerCase()),
    'That password is too easy to guess',
  );

export const signupSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Enter your first name').max(60, 'That name is too long'),
    businessName: z.string().trim().min(1, 'Enter your business name').max(120, 'That name is too long'),
    phone: phoneSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'Please accept the Terms of Use and Privacy Policy' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Both passwords must match',
    path: ['confirmPassword'],
  });

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, 'This reset link is not valid'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Both passwords must match',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Both passwords must match',
    path: ['confirmPassword'],
  });

export const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name').max(60),
  lastName: z.string().trim().max(60).optional().or(z.literal('')),
  phone: phoneSchema,
  email: emailSchema,
  notifyByEmail: z.boolean().optional(),
  notifyOnExport: z.boolean().optional(),
  notifyMonthly: z.boolean().optional(),
});

export const businessSchema = z.object({
  name: z.string().trim().min(1, 'Enter your business name').max(120),
  currency: z.enum(supportedCurrencies),
  financialYearStartMonth: z.coerce.number().int().min(1).max(12),
  folderStructure: z.enum(['YEAR_MONTH', 'YEAR_MONTH_CATEGORY', 'CATEGORY_ONLY']),
  phone: z.union([phoneSchema, z.literal('')]).optional(),
  vatNumber: z.string().trim().max(30).optional().or(z.literal('')),
  addressLine: z.string().trim().max(200).optional().or(z.literal('')),
});

const moneyInput = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) => (value === '' || value === undefined ? null : value));

export const receiptUpdateSchema = z.object({
  merchantName: z.string().trim().max(120).nullable().optional(),
  receiptNumber: z.string().trim().max(60).nullable().optional(),
  purchaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker')
    .nullable()
    .optional(),
  purchaseTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time such as 14:30')
    .nullable()
    .optional(),
  currency: z.enum(supportedCurrencies).optional(),
  subtotal: moneyInput,
  tax: moneyInput,
  total: moneyInput,
  paymentMethod: z.enum(['CARD', 'CASH', 'EFT', 'DEBIT_ORDER', 'MOBILE', 'OTHER', 'UNKNOWN']).optional(),
  documentType: z.enum(['RECEIPT', 'TAX_INVOICE', 'OTHER']).optional(),
  categoryId: z.string().cuid().nullable().optional(),
  folderId: z.string().cuid().nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  status: z.enum(['NEEDS_REVIEW', 'FILED']).optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(200),
        quantity: z.union([z.string(), z.number(), z.null()]).optional(),
        unit: moneyInput,
        total: moneyInput,
      }),
    )
    .max(100)
    .optional(),
});

export const folderSchema = z.object({
  name: z.string().trim().min(1, 'Give the folder a name').max(80, 'That name is too long'),
  parentId: z.string().cuid().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Choose a colour')
    .nullable()
    .optional(),
  icon: z.string().trim().max(40).nullable().optional(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Give the category a name').max(60),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
});

export const exportRequestSchema = z
  .object({
    type: z.enum(['SELECTION', 'FOLDER', 'DATE_RANGE', 'FULL_WORKSPACE']),
    receiptIds: z.array(z.string().cuid()).max(2000).optional(),
    folderId: z.string().cuid().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    includeCombinedPdf: z.boolean().default(false),
    summaryFormat: z.enum(['csv', 'xlsx', 'both']).default('csv'),
    label: z.string().trim().max(80).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'SELECTION' && !data.receiptIds?.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Select at least one slip to export', path: ['receiptIds'] });
    }
    if (data.type === 'FOLDER' && !data.folderId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a folder to export', path: ['folderId'] });
    }
    if (data.type === 'DATE_RANGE' && (!data.from || !data.to)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose both a start and end date', path: ['from'] });
    }
    if (data.type === 'DATE_RANGE' && data.from && data.to && data.from > data.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'The start date must come first', path: ['from'] });
    }
  });

export const receiptQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  folderId: z.string().optional(),
  categoryId: z.string().optional(),
  status: z.enum(['UPLOADING', 'PROCESSING', 'NEEDS_REVIEW', 'FILED', 'FAILED']).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  tag: z.string().trim().max(40).optional(),
  sort: z.enum(['newest', 'oldest', 'highest', 'lowest', 'merchant']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  view: z.enum(['grid', 'list']).default('grid'),
  includeDeleted: z.coerce.boolean().default(false),
});

export type ReceiptQuery = z.infer<typeof receiptQuerySchema>;

/** Flattens a ZodError into `{ field: message }` for form rendering. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}
