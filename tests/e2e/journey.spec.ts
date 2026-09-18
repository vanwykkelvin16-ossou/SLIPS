import { expect, test } from '@playwright/test';
import { completeOnboarding, newAccount, signIn, signUp, uploadReceipt } from './helpers';

/**
 * The journey a real business owner takes: sign up, learn the app, capture a
 * slip, correct what was read, file it, find it again and export it.
 */
test.describe('the core slip journey', () => {
  test('a new business owner can register, file a slip and find it again', async ({ page }) => {
    const account = newAccount('journey');

    await test.step('register a business account', async () => {
      await signUp(page, account);
      await expect(page.getByRole('heading', { name: new RegExp(`Welcome, ${account.firstName}`) })).toBeVisible();
    });

    await test.step('complete onboarding', async () => {
      await completeOnboarding(page);
      await expect(page.getByRole('heading', { name: account.firstName })).toBeVisible();
      await expect(page.getByText('No slips yet')).toBeVisible();
    });

    const receiptId = await test.step('upload a slip and let it be read', async () => {
      return uploadReceipt(page);
    });

    await test.step('the extracted details are suggested for review', async () => {
      await expect(page.getByRole('heading', { name: /Check the details before we file it/ })).toBeVisible();

      // The fixture slip totals R207,92 — extraction should have found it.
      const total = page.getByLabel('Total', { exact: true });
      await expect(total).toHaveValue(/207/, { timeout: 20_000 });

      const merchant = page.getByLabel('Shop or supplier');
      await expect(merchant).not.toHaveValue('');
    });

    await test.step('correct a field and file the slip', async () => {
      await page.getByLabel('Shop or supplier').fill('Fresh Market Trading');
      await page.getByLabel('Purchase date').fill('2026-09-14');
      await page.getByLabel('Category').selectOption({ label: 'Groceries & Supplies' });
      await page.getByLabel('Note').fill('Weekly stock run');

      await page.getByRole('button', { name: 'Save and file this slip' }).click();
      await expect(page).toHaveURL(new RegExp(`/slips/${receiptId}$`), { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'Fresh Market Trading' })).toBeVisible();
      await expect(page.getByText('Filed', { exact: true }).first()).toBeVisible();
    });

    await test.step('the slip survives a sign-out and sign-in', async () => {
      await page.goto('/settings');
      await page.getByRole('button', { name: 'Sign out' }).first().click();
      await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

      await signIn(page, account);
      await page.goto('/slips');
      await expect(page.getByRole('heading', { name: 'Fresh Market Trading' })).toBeVisible();
    });

    await test.step('search finds it', async () => {
      await page.getByLabel('Search your slips').fill('Fresh Market');
      await expect(page.getByRole('heading', { name: 'Fresh Market Trading' })).toBeVisible();

      await page.getByLabel('Search your slips').fill('nothing-matches-this');
      await expect(page.getByText('No slips match those filters')).toBeVisible();
      await page.getByRole('button', { name: 'Clear filters' }).click();
      await expect(page.getByRole('heading', { name: 'Fresh Market Trading' })).toBeVisible();
    });

    await test.step('it was filed into a year and month folder', async () => {
      await page.goto('/folders');
      // Each folder row has a browse link and an export link; assert on the browse one.
      await expect(page.getByRole('link', { name: /^2026 1 slip/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /^September 1 slip/ })).toBeVisible();
    });

    await test.step('an export can be built and downloaded', async () => {
      await page.goto('/exports');
      await page.getByRole('button', { name: 'New export' }).click();
      await page.getByLabel('What should we export?').selectOption('FULL_WORKSPACE');
      await page.getByLabel('Name this export').fill('E2E export');
      await page.getByRole('button', { name: 'Start export' }).click();

      await expect(page.getByRole('heading', { name: 'E2E export' })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('Ready', { exact: true })).toBeVisible({ timeout: 120_000 });

      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download' }).first().click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/\.zip$/);
    });

    await test.step('the individual PDF download works', async () => {
      await page.goto(`/slips/${receiptId}`);
      const download = page.waitForEvent('download');
      await page.getByRole('link', { name: 'Download PDF' }).click();
      const file = await download;
      expect(file.suggestedFilename()).toMatch(/^2026-09-14_FreshMarketTrading_R207-92.*\.pdf$/);
    });

    await test.step('deleting is undoable', async () => {
      await page.goto(`/slips/${receiptId}`);
      await page.getByRole('button', { name: 'Delete' }).click();
      await page.getByRole('button', { name: 'Delete slip' }).click();
      await expect(page).toHaveURL(/\/slips$/, { timeout: 30_000 });

      await page.getByRole('button', { name: 'Undo' }).click();
      await expect(page).toHaveURL(new RegExp(`/slips/${receiptId}$`), { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'Fresh Market Trading' })).toBeVisible();
    });
  });

  test('a duplicate upload is flagged before it is saved twice', async ({ page }) => {
    const account = newAccount('dupe');
    await signUp(page, account);
    await completeOnboarding(page);

    await uploadReceipt(page);
    await page.getByRole('button', { name: 'Save and file this slip' }).click();
    await expect(page).toHaveURL(/\/slips\/[a-z0-9]+$/, { timeout: 30_000 });

    // The very same file again.
    await uploadReceipt(page);
    await expect(page.getByText('This looks like a slip you already have')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('You have already uploaded this exact file.')).toBeVisible();

    // Saving is blocked until the warning is acknowledged.
    await expect(page.getByRole('button', { name: 'Save and file this slip' })).toBeDisabled();
    await page.getByRole('button', { name: 'It is a different purchase — keep both' }).click();
    await expect(page.getByRole('button', { name: 'Save and file this slip' })).toBeEnabled();
  });
});
