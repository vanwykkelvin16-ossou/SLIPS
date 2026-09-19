import path from 'node:path';
import { expect, type Page } from '@playwright/test';

export const RECEIPT_FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'receipt.png');

export interface TestAccount {
  firstName: string;
  businessName: string;
  phone: string;
  email: string;
  password: string;
}

/** Unique per run so tests can be re-run against the same database. */
export function newAccount(label = 'user'): TestAccount {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    // Unique so repeated runs against the same database stay unambiguous.
    firstName: `Thandi${label}${stamp.slice(-5)}`,
    businessName: `Test Trading ${stamp}`,
    phone: '082 123 4567',
    email: `e2e-${label}-${stamp}@example.com`,
    password: 'correct-horse-battery-7',
  };
}

/**
 * Waits until React has hydrated the server-rendered page.
 *
 * Next.js renders `<next-route-announcer>` on the client only, so its presence
 * means event handlers are attached and controlled inputs will keep what is
 * typed into them. Playwright is faster than a person, and without this a fill
 * can land before hydration and be wiped by the first client render.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForSelector('next-route-announcer', { state: 'attached', timeout: 20_000 }).catch(() => undefined);

  /*
   * The route announcer appears before React attaches, so filling a field here
   * races hydration: the typed value passes its own check and is then wiped
   * when React takes over the input. React marks every DOM node it owns with
   * a __reactFiber$… key, so wait for that on the form itself.
   */
  await page
    .waitForFunction(
      () => {
        const form = document.querySelector('form');
        if (!form) return true; // Nothing to fill on this page.
        return Object.keys(form).some((key) => key.startsWith('__react'));
      },
      undefined,
      { timeout: 20_000 },
    )
    .catch(() => undefined);
}

/** Fills a field and confirms the value stuck, re-filling once if it did not. */
export async function fillField(page: Page, field: ReturnType<Page['getByLabel']>, value: string): Promise<void> {
  await field.fill(value);
  try {
    await expect(field).toHaveValue(value, { timeout: 2_000 });
  } catch {
    await field.fill(value);
    await expect(field).toHaveValue(value);
  }
}

/**
 * Fills a whole form, then sweeps back over it re-filling anything a late
 * hydration pass wiped. React can hydrate boundaries independently, so waiting
 * for one signal is not enough on a form this size.
 */
export async function fillForm(page: Page, entries: Array<[ReturnType<Page['getByLabel']>, string]>): Promise<void> {
  for (const [field, value] of entries) {
    await field.fill(value);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let allGood = true;
    for (const [field, value] of entries) {
      if ((await field.inputValue()) !== value) {
        await field.fill(value);
        allGood = false;
      }
    }
    if (allGood) {
      // One more look after a beat: a late hydration pass can still clear a
      // field that was correct a moment ago.
      await page.waitForTimeout(150);
      const settled = await Promise.all(entries.map(async ([field, value]) => (await field.inputValue()) === value));
      if (settled.every(Boolean)) return;
      continue;
    }
    await page.waitForTimeout(250);
  }

  for (const [field, value] of entries) {
    await expect(field).toHaveValue(value);
  }
}

export async function signUp(page: Page, account: TestAccount): Promise<void> {
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

  await expect(page).toHaveURL(/\/welcome/, { timeout: 30_000 });
}

export async function completeOnboarding(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Show me how it works' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /Done — take me in|Start using Slipsy/ }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

export async function signIn(page: Page, account: TestAccount): Promise<void> {
  await page.goto('/login');
  await waitForHydration(page);
  await fillForm(page, [
    [page.getByLabel('E-mail address'), account.email],
    [page.getByLabel('Password', { exact: true }), account.password],
  ]);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard|\/welcome/, { timeout: 30_000 });
}

/**
 * Uploads the fixture slip and waits for the review screen.
 * Returns the receipt id taken from the URL.
 */
export async function uploadReceipt(page: Page, fixture = RECEIPT_FIXTURE): Promise<string> {
  await page.goto('/scan');
  await waitForHydration(page);

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Upload from this device/ }).click();
  await (await chooser).setFiles(fixture);

  // Preview → confirm the page → upload.
  await page.getByRole('button', { name: 'Use this page' }).click();
  await page.getByRole('button', { name: /^Save this slip$/ }).click();

  await expect(page).toHaveURL(/\/slips\/[a-z0-9]+\/review/, { timeout: 150_000 });

  const match = page.url().match(/\/slips\/([a-z0-9]+)\/review/);
  if (!match?.[1]) throw new Error(`Could not read the receipt id from ${page.url()}`);
  return match[1];
}
