import { expect, test } from '@playwright/test';
import { completeOnboarding, fillForm, newAccount, signUp, uploadReceipt, waitForHydration } from './helpers';

/**
 * Captures the main screens so their layout can be reviewed.
 * Run with: npx playwright test tests/e2e/screenshots.spec.ts
 */
// Supplied from the environment, never written down here.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD ?? '';
const HAVE_ADMIN_CREDENTIALS = ADMIN_EMAIL.length > 0 && ADMIN_PASSWORD.length > 0;
const OUT = 'test-results/screens';

test.describe('visual capture', () => {
  test('public and admin screens', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${OUT}/landing.png`, fullPage: true });

    await page.goto('/signup', { waitUntil: 'networkidle' });
    await page.screenshot({ path: `${OUT}/signup.png` });

    await page.goto('/admin/login');
    await page.screenshot({ path: `${OUT}/admin-login.png` });

    if (!HAVE_ADMIN_CREDENTIALS) return;

    await waitForHydration(page);
    await fillForm(page, [
      [page.getByLabel('E-mail address'), ADMIN_EMAIL],
      [page.getByLabel('Password', { exact: true }), ADMIN_PASSWORD],
    ]);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
    await page.screenshot({ path: `${OUT}/admin-dashboard.png`, fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.screenshot({ path: `${OUT}/admin-dashboard-mobile.png`, fullPage: true });
  });

  test('customer app screens', async ({ page }) => {
    const account = newAccount('screens');
    await signUp(page, account);
    await page.screenshot({ path: `${OUT}/welcome.png` });

    await completeOnboarding(page);
    await page.screenshot({ path: `${OUT}/dashboard-empty.png`, fullPage: true });

    await page.goto('/scan');
    await page.screenshot({ path: `${OUT}/scan.png` });

    const receiptId = await uploadReceipt(page);
    await expect(page.getByRole('heading', { name: /Check the details/ })).toBeVisible();
    await page.screenshot({ path: `${OUT}/review.png`, fullPage: true });

    await page.getByRole('button', { name: 'Save and file this slip' }).click();
    await expect(page).toHaveURL(new RegExp(`/slips/${receiptId}$`), { timeout: 30_000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: `${OUT}/slip-detail.png`, fullPage: true });

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: `${OUT}/dashboard-filled.png`, fullPage: true });

    await page.goto('/slips');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: `${OUT}/slips.png`, fullPage: true });

    await page.goto('/folders');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: `${OUT}/folders.png`, fullPage: true });

    await page.goto('/exports');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: `${OUT}/exports.png`, fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: `${OUT}/dashboard-mobile.png`, fullPage: true });

    await page.goto('/slips');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: `${OUT}/slips-mobile.png`, fullPage: true });

    await page.goto('/more');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: `${OUT}/more-mobile.png`, fullPage: true });
  });
});
