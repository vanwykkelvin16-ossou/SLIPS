import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('deployment environment', () => {
  it('honours false strings for SMTP and S3 configuration', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
    vi.stubEnv('AUTH_SECRET', 'a'.repeat(48));
    vi.stubEnv('FILE_SIGNING_SECRET', 'b'.repeat(48));
    vi.stubEnv('SMTP_SECURE', 'false');
    vi.stubEnv('S3_FORCE_PATH_STYLE', 'false');
    const { getEnv } = await import('@/lib/env');
    expect(getEnv().SMTP_SECURE).toBe(false);
    expect(getEnv().S3_FORCE_PATH_STYLE).toBe(false);
  });

  it('uses the normalised production domain for email links', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('AUTH_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'slips.example.com');
    vi.stubEnv('VERCEL_URL', 'preview.example.com');
    const { getAppUrl } = await import('@/lib/env');
    expect(`${getAppUrl()}/verify-email`).toBe('https://slips.example.com/verify-email');
  });
});
