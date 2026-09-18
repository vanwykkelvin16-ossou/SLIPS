import { expect, test } from '@playwright/test';
import { completeOnboarding, fillForm, newAccount, signUp, waitForHydration } from './helpers';

// The administrator's credentials are never written down here. Supply them the
// same way the server does — ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD in the
// environment — and the sign-in test runs; without them it is skipped rather
// than guessed at.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD ?? '';
const HAVE_ADMIN_CREDENTIALS = ADMIN_EMAIL.length > 0 && ADMIN_PASSWORD.length > 0;

test.describe('the admin portal', () => {
  test('refuses access without an admin session', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByRole('heading', { name: 'Sign in to the admin portal' })).toBeVisible();
  });

  test('refuses the directory API without an admin session', async ({ request }) => {
    const response = await request.get('/api/admin/users');
    expect(response.status()).toBe(401);
  });

  test('a signed-in customer still cannot reach the admin portal', async ({ page }) => {
    const account = newAccount('nonadmin');
    await signUp(page, account);
    await completeOnboarding(page);

    // A valid customer session must not grant anything here.
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login/);

    const response = await page.request.get('/api/admin/users');
    expect(response.status()).toBe(401);
  });

  test('rejects wrong credentials with a clear message', async ({ page }) => {
    await page.goto('/admin/login');
    await waitForHydration(page);
    await fillForm(page, [
      [page.getByLabel('E-mail address'), ADMIN_EMAIL || 'not-an-administrator@example.com'],
      [page.getByLabel('Password', { exact: true }), 'definitely-not-the-password'],
    ]);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.locator('form').getByRole('alert')).toContainText('Those sign-in details are not correct.');
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('the administrator can sign in, search the directory and sign out', async ({ page }) => {
    test.skip(!HAVE_ADMIN_CREDENTIALS, 'Set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD to run this test.');

    // A registration made now must appear in the directory straight away.
    const account = newAccount('directory');
    await signUp(page, account);
    await completeOnboarding(page);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Sign out' }).first().click();
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

    await test.step('sign in as the administrator', async () => {
      await page.goto('/admin/login');
      await waitForHydration(page);
      await fillForm(page, [
        [page.getByLabel('E-mail address'), ADMIN_EMAIL],
        [page.getByLabel('Password', { exact: true }), ADMIN_PASSWORD],
      ]);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
    });

    await test.step('the dashboard shows real registration numbers', async () => {
      await expect(page.getByRole('heading', { level: 1, name: 'Registered users' })).toBeVisible();
      await expect(page.getByText('Joined this month')).toBeVisible();
      await expect(page.getByText('Joined today')).toBeVisible();

      // Real counts, not placeholders.
      const totalValue = page.locator('p', { hasText: /^Registered users$/ }).locator('xpath=following-sibling::p[1]');
      await expect(totalValue).toHaveText(/^[0-9  ,]+$/);
    });

    await test.step('search finds the account that just registered', async () => {
      await page.getByLabel('Search registered users').fill(account.businessName);
      await expect(page.getByRole('cell', { name: account.email })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('cell', { name: account.businessName })).toBeVisible();
      await expect(page.getByRole('rowheader', { name: account.firstName })).toBeVisible();

      // Searching by e-mail address works too.
      await page.getByLabel('Search registered users').fill(account.email);
      await expect(page.getByRole('cell', { name: account.email })).toBeVisible({ timeout: 20_000 });
    });

    await test.step('nothing financial is exposed', async () => {
      const body = (await page.locator('body').textContent()) ?? '';
      expect(body).not.toMatch(/passwordHash/i);
      expect(body).not.toMatch(/\bR\s?\d+[.,]\d{2}/);

      const api = await page.request.get('/api/admin/users?search=' + encodeURIComponent(account.email));
      const payload = await api.json();
      const [user] = payload.users;
      expect(Object.keys(user).sort()).toEqual(
        ['businessName', 'email', 'firstName', 'id', 'lastName', 'phone', 'registeredAt', 'status'].sort(),
      );
    });

    await test.step('sorting works', async () => {
      await page.getByLabel('Search registered users').fill('');
      await page.getByLabel('Sort registered users').selectOption('oldest');
      await expect(page.getByRole('table')).toBeVisible();
    });

    await test.step('sign out ends the admin session', async () => {
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/admin\/login/, { timeout: 30_000 });

      await page.goto('/admin');
      await expect(page).toHaveURL(/\/admin\/login/);
    });
  });
});
