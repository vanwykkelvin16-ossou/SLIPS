import { z } from 'zod';
import { appUrl } from './app-url';

const envBoolean = (fallback: boolean) => z.preprocess(
  (value) => typeof value === 'string' ? value.trim().toLowerCase() : value,
  z.union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')]).default(fallback),
);

/**
 * Server-side environment. Parsed once at module load so a misconfigured
 * deployment fails fast and loudly rather than at the first upload.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  AUTH_URL: z.string().url().optional(),

  FILE_SIGNING_SECRET: z.string().min(32, 'FILE_SIGNING_SECRET must be at least 32 characters'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: envBoolean(false),

  OCR_PROVIDER: z.enum(['tesseract', 'google-vision', 'aws-textract', 'azure-document-intelligence']).default('tesseract'),
  GOOGLE_VISION_API_KEY: z.string().optional(),
  AWS_TEXTRACT_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AZURE_DOCUMENT_ENDPOINT: z.string().optional(),
  AZURE_DOCUMENT_KEY: z.string().optional(),

  EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  EMAIL_FROM: z.string().default('Slipsy <no-reply@slipsy.local>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: envBoolean(true),

  MALWARE_SCAN_PROVIDER: z.enum(['none', 'clamav', 'webhook']).default('none'),
  CLAMAV_HOST: z.string().optional(),
  CLAMAV_PORT: z.coerce.number().optional(),
  MALWARE_SCAN_WEBHOOK_URL: z.string().optional(),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
  MAX_PAGES_PER_RECEIPT: z.coerce.number().int().positive().default(10),
  EXPORT_RETENTION_HOURS: z.coerce.number().int().positive().default(72),

  RATE_LIMIT_DRIVER: z.enum(['memory']).default('memory'),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\n\nSee .env.example for the full list.`);
  }
  cached = parsed.data;
  return cached;
}

/** Public app URL used for links in e-mails and signed download URLs. */
export function getAppUrl(): string {
  return appUrl();
}

export const isProduction = () => process.env.NODE_ENV === 'production';
