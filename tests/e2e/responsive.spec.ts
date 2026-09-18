import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding, newAccount, signUp, uploadReceipt } from './helpers';

/**
 * Layout checks at the widths people actually use.
 * Runs under the `mobile` project as well as `desktop` (see playwright.config).
 */

const WIDTHS = [
  { name: 'small phone', width: 320, height: 720 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'large phone', width: 430, height: 932 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'small laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
];

/**
 * Nothing should push the page wider than the viewport.
 *
 * Measured only once layout has settled — fonts swapping and thumbnails
 * arriving both move things around, and a mid-render reading says nothing
 * about what the user ends up seeing.
 */
async function horizontalOverflow(page: Page): Promise<number> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            resolve(document.documentElement.scrollWidth - document.documentElement.clientWidth),
          ),
        );
      }),
  );
}

test.describe('responsive layout', () => {
  test('every main screen fits its viewport at each width', async ({ page }) => {
    const account = newAccount('responsive');
    await signUp(page, account);
    await completeOnboarding(page);

    const receiptId = await uploadReceipt(page);
    await page.getByRole('button', { name: 'Save and file this slip' }).click();
    await expect(page).toHaveURL(new RegExp(`/slips/${receiptId}$`), { timeout: 30_000 });

    const routes = ['/dashboard', '/slips', `/slips/${receiptId}`, '/folders', '/exports', '/settings', '/business', '/help', '/scan'];

    for (const size of WIDTHS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      // The resize reaches the page asynchronously; measuring before it lands
      // reports the previous width's layout.
      await page.waitForFunction((width) => window.innerWidth === width, size.width);

      for (const route of routes) {
        await page.goto(route);
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

        await expect
          .poll(() => horizontalOverflow(page), {
            timeout: 10_000,
            message: `${route} overflows horizontally at ${size.name} (${size.width}px)`,
          })
          .toBeLessThanOrEqual(1);
      }
    }
  });

  test('navigation switches between bottom bar and sidebar', async ({ page }) => {
    const account = newAccount('nav');
    await signUp(page, account);
    await completeOnboarding(page);

    await test.step('phones get the bottom bar with Scan raised', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/dashboard');

      const nav = page.getByRole('navigation', { name: 'Main' });
      await expect(nav).toBeVisible();
      for (const label of ['Home', 'My Slips', 'Folders', 'More']) {
        await expect(nav.getByRole('link', { name: label })).toBeVisible();
      }
      await expect(nav.getByRole('link', { name: 'Scan a slip' })).toBeVisible();

      // The desktop-only destinations live behind More on a phone.
      await expect(nav.getByRole('link', { name: 'Business Profile' })).toHaveCount(0);
    });

    await test.step('desktops get the full sidebar', async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/dashboard');

      const nav = page.getByRole('navigation', { name: 'Main' });
      for (const label of ['Dashboard', 'Scan a Slip', 'My Slips', 'Folders', 'Exports', 'Business Profile', 'Settings', 'Help']) {
        await expect(nav.getByRole('link', { name: label })).toBeVisible();
      }
      await expect(nav.getByRole('button', { name: 'Sign Out' })).toBeVisible();
    });
  });

  test('touch targets on the bottom bar are big enough to hit', async ({ page }) => {
    const account = newAccount('touch');
    await signUp(page, account);
    await completeOnboarding(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');

    const links = page.getByRole('navigation', { name: 'Main' }).getByRole('link');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const box = await links.nth(index).boundingBox();
      expect(box, 'every navigation item should be laid out').not.toBeNull();
      // WCAG 2.2 AA target size.
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  });

  test('the bottom bar never covers the end of a page', async ({ page }) => {
    const account = newAccount('safearea');
    await signUp(page, account);
    await completeOnboarding(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/help');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');

    const measurements = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Main"]');
      const main = document.querySelector('#main-content');
      if (!nav || !main) return null;
      return {
        navHeight: nav.getBoundingClientRect().height,
        // The reserved space that keeps content clear of the fixed bar.
        mainPaddingBottom: Number.parseFloat(getComputedStyle(main).paddingBottom),
        lastChildBottom: Math.max(
          ...[...main.children].map((child) => child.getBoundingClientRect().bottom),
        ),
        navTop: nav.getBoundingClientRect().top,
      };
    });

    expect(measurements).not.toBeNull();
    // Scrolled to the very end, the last piece of content still sits above the bar.
    expect(
      measurements!.mainPaddingBottom,
      'main should reserve at least the height of the bottom bar',
    ).toBeGreaterThanOrEqual(measurements!.navHeight - 1);
  });
});
