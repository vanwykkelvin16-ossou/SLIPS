import { afterEach, describe, expect, it } from 'vitest';
import { appUrl, normaliseAppUrl } from '@/lib/app-url';

const KEYS = ['NEXT_PUBLIC_APP_URL', 'AUTH_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL'] as const;

afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

describe('normaliseAppUrl', () => {
  it('keeps a well-formed URL as its origin', () => {
    expect(normaliseAppUrl('https://slipsy.example.com')).toBe('https://slipsy.example.com');
  });

  it('assumes https for a bare hostname', () => {
    // This is what breaks a build when it reaches `new URL()` unguarded.
    expect(normaliseAppUrl('slipsy.vercel.app')).toBe('https://slipsy.vercel.app');
  });

  it('drops a trailing slash and any path', () => {
    expect(normaliseAppUrl('https://slipsy.example.com/')).toBe('https://slipsy.example.com');
    expect(normaliseAppUrl('https://slipsy.example.com/app')).toBe('https://slipsy.example.com');
  });

  it('keeps a port and http for local use', () => {
    expect(normaliseAppUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('returns null rather than throwing on rubbish', () => {
    expect(normaliseAppUrl(undefined)).toBeNull();
    expect(normaliseAppUrl('')).toBeNull();
    expect(normaliseAppUrl('   ')).toBeNull();
    expect(normaliseAppUrl('http://')).toBeNull();
  });
});

describe('appUrl', () => {
  it('prefers the explicitly configured address', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://configured.example.com';
    process.env.VERCEL_URL = 'deployment.vercel.app';
    expect(appUrl()).toBe('https://configured.example.com');
  });

  it('falls back to the host’s production domain, then the deployment one', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'slipsy.vercel.app';
    process.env.VERCEL_URL = 'slipsy-abc123.vercel.app';
    expect(appUrl()).toBe('https://slipsy.vercel.app');

    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(appUrl()).toBe('https://slipsy-abc123.vercel.app');
  });

  it('skips a misconfigured value instead of failing', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'not a url at all ://';
    process.env.VERCEL_URL = 'slipsy.vercel.app';
    expect(appUrl()).toBe('https://slipsy.vercel.app');
  });

  it('always returns something usable', () => {
    expect(appUrl()).toBe('http://localhost:3000');
  });
});
