import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding, newAccount, signUp } from './helpers';

/** True once a service worker is registered and activated for this page. */
async function hasActiveWorker(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.some((registration) => Boolean(registration.active));
  });
}

test.describe('progressive web app', () => {
  test('serves a valid, installable manifest', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);

    const manifest = await response.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe('/dashboard');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);

    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');

    const maskable = manifest.icons.filter((icon: { purpose?: string }) => icon.purpose === 'maskable');
    expect(maskable.length).toBeGreaterThanOrEqual(2);
  });

  test('every icon the manifest promises actually exists', async ({ request }) => {
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    const urls: string[] = manifest.icons.map((icon: { src: string }) => icon.src);

    for (const url of [...urls, '/icons/apple-touch-icon.png', '/favicon.ico']) {
      const response = await request.get(url);
      expect(response.status(), `${url} should be served`).toBe(200);
      expect(Number(response.headers()['content-length'] ?? 1)).toBeGreaterThan(0);
    }
  });

  test('links the manifest and the Apple touch icon from the page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest/);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
  });

  test('the service worker registers and caches the offline page', async ({ page }) => {
    await page.goto('/login');

    // Registration happens after hydration and activation takes another tick,
    // so poll rather than assuming it has finished.
    await expect
      .poll(() => hasActiveWorker(page), { timeout: 20_000 })
      .toBe(true);

    // The offline fallback must be in the cache to be of any use offline.
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const keys = await caches.keys();
            for (const key of keys) {
              const cache = await caches.open(key);
              if (await cache.match('/offline')) return true;
            }
            return false;
          }),
        { timeout: 15_000 },
      )
      .toBe(true);
  });

  test('never caches a page or an API response', async ({ page }) => {
    await page.goto('/login');
    await expect.poll(() => hasActiveWorker(page), { timeout: 20_000 }).toBe(true);

    const cached = await page.evaluate(async () => {
      const found: string[] = [];
      for (const key of await caches.keys()) {
        const cache = await caches.open(key);
        for (const request of await cache.keys()) found.push(new URL(request.url).pathname);
      }
      return found;
    });

    // Only public assets and the offline shell may be stored.
    for (const path of cached) {
      expect(
        path.startsWith('/_next/static/') ||
          path.startsWith('/icons/') ||
          path === '/offline' ||
          path === '/favicon.ico' ||
          path === '/og-image.png' ||
          path === '/manifest.webmanifest',
        `${path} must not be cached`,
      ).toBe(true);
    }
  });

  test('the offline page stands alone', async ({ page }) => {
    await page.goto('/offline');
    await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByText(/documents are safe/i)).toBeVisible();
  });
});

test.describe('installation guidance', () => {
  test('an iPhone is given Safari’s real steps, not a fake prompt', async ({ browser }) => {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();

    const account = newAccount('ios');
    await signUp(page, account);

    // The install step of onboarding.
    await page.getByRole('button', { name: 'Show me how it works' }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByText('Add Slipsy to your iPhone or iPad')).toBeVisible();
    await expect(page.getByText('Tap the Share button')).toBeVisible();
    await expect(page.getByText('Choose “Add to Home Screen”')).toBeVisible();
    await expect(page.getByText('Tap “Add”')).toBeVisible();

    // iOS has no automatic prompt, so the app must not pretend otherwise.
    await expect(page.getByRole('button', { name: 'Add to Home Screen' })).toHaveCount(0);

    await context.close();
  });

  test('the install action stays available in More afterwards', async ({ browser }) => {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();

    const account = newAccount('iosmore');
    await signUp(page, account);
    await completeOnboarding(page);

    await page.goto('/more');
    const install = page.getByRole('button', { name: /Add to Home Screen/ });
    await expect(install).toBeVisible();

    await install.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Tap the Share button')).toBeVisible();

    await context.close();
  });
});
