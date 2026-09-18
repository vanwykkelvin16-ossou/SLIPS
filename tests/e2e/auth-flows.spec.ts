import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { completeOnboarding, fillForm, newAccount, signUp, waitForHydration } from './helpers';

/**
 * The account flows that depend on an e-mailed link.
 *
 * With EMAIL_PROVIDER=console the link is written to the server log, which is
 * how these tests retrieve it — the same path a developer uses locally.
 */
const SERVER_LOG = process.env.SERVER_LOG ?? '/tmp/slipsy-server.log';

async function latestEmailLink(match: RegExp): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const log = await readFile(SERVER_LOG, 'utf8').catch(() => '');
    const links = [...log.matchAll(/link=(\S+)/g)].map((m) => m[1]!).filter((link) => match.test(link));
    const last = links[links.length - 1];
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No e-mail link matching ${match} appeared in ${SERVER_LOG}`);
}

test.describe('account flows', () => {
  test('a forgotten password can be reset and used', async ({ page }) => {
    const account = newAccount('reset');
    await signUp(page, account);
    await completeOnboarding(page);

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Sign out' }).first().click();
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

    await test.step('request a reset link', async () => {
      await page.goto('/forgot-password');
      await waitForHydration(page);
      await fillForm(page, [[page.getByLabel('E-mail address'), account.email]]);
      await page.getByRole('button', { name: 'Send reset link' }).click();

      // The answer is deliberately the same whether or not the address exists.
      await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    });

    const newPassword = 'a-completely-different-9';

    await test.step('follow the link and choose a new password', async () => {
      const link = await latestEmailLink(/reset-password/);
      await page.goto(link);
      await waitForHydration(page);

      await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
      await fillForm(page, [
        [page.getByLabel('New password', { exact: true }), newPassword],
        [page.getByLabel('Confirm new password'), newPassword],
      ]);
      await page.getByRole('button', { name: 'Save new password' }).click();
      await expect(page).toHaveURL(/\/login\?reset=1/, { timeout: 30_000 });
    });

    await test.step('the old password no longer works', async () => {
      await waitForHydration(page);
      await fillForm(page, [
        [page.getByLabel('E-mail address'), account.email],
        [page.getByLabel('Password', { exact: true }), account.password],
      ]);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.locator('form').getByRole('alert')).toContainText('not right');
    });

    await test.step('the new password does', async () => {
      await page.goto('/login');
      await waitForHydration(page);
      await fillForm(page, [
        [page.getByLabel('E-mail address'), account.email],
        [page.getByLabel('Password', { exact: true }), newPassword],
      ]);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    });

    await test.step('the same reset link cannot be used twice', async () => {
      const link = await latestEmailLink(/reset-password/);
      await page.goto(link);
      await waitForHydration(page);
      await fillForm(page, [
        [page.getByLabel('New password', { exact: true }), 'yet-another-one-8'],
        [page.getByLabel('Confirm new password'), 'yet-another-one-8'],
      ]);
      await page.getByRole('button', { name: 'Save new password' }).click();
      await expect(page.getByRole('heading', { name: 'That link has expired' })).toBeVisible();
    });
  });

  test('confirming an e-mail address works from the link', async ({ page }) => {
    const account = newAccount('verify');
    await signUp(page, account);

    const link = await latestEmailLink(/verify-email/);
    await page.goto(link);

    await expect(page.getByRole('heading', { name: 'E-mail confirmed' })).toBeVisible({ timeout: 30_000 });
  });

  test('a reset for an unknown address reveals nothing', async ({ page }) => {
    await page.goto('/forgot-password');
    await waitForHydration(page);
    await fillForm(page, [[page.getByLabel('E-mail address'), 'nobody-here-at-all@example.com']]);
    await page.getByRole('button', { name: 'Send reset link' }).click();

    // Identical wording to the success case: the endpoint must not confirm
    // whether an address is registered.
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  });

  test('signing up twice with the same address is refused clearly', async ({ page }) => {
    const account = newAccount('dupeemail');
    await signUp(page, account);
    await completeOnboarding(page);

    await page.goto('/settings');
    await page.getByRole('button', { name: 'Sign out' }).first().click();
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

    await page.goto('/signup');
    await waitForHydration(page);
    await fillForm(page, [
      [page.getByLabel('First name'), account.firstName],
      [page.getByLabel('Business name'), account.businessName],
      [page.getByLabel('Telephone number'), account.phone],
      [page.getByLabel('E-mail address'), account.email],
      [page.getByLabel('Password', { exact: true }), account.password],
      [page.getByLabel('Confirm password'), account.password],
    ]);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create my account' }).click();

    await expect(page.getByText('already registered')).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/signup/);
  });
});
