import { expect, test } from '@playwright/test';
import { completeOnboarding, newAccount, signUp, uploadReceipt } from './helpers';

/**
 * The guarantee the whole product rests on: one business can never reach
 * another business's documents, however it asks.
 */
test('one business cannot reach another business’s slip', async ({ page, browser }) => {
  const owner = newAccount('owner');
  await signUp(page, owner);
  await completeOnboarding(page);

  const receiptId = await uploadReceipt(page);
  await page.getByRole('button', { name: 'Save and file this slip' }).click();
  await expect(page).toHaveURL(new RegExp(`/slips/${receiptId}$`), { timeout: 30_000 });

  // The signed document URL the owner's own browser is using.
  const signedImageUrl = await page.locator('img[src*="/api/files/receipt"]').first().getAttribute('src');
  expect(signedImageUrl).toBeTruthy();

  const intruderContext = await browser.newContext();
  const intruderPage = await intruderContext.newPage();
  const intruder = newAccount('intruder');
  await signUp(intruderPage, intruder);
  await completeOnboarding(intruderPage);

  await test.step('the slip page shows nothing to another business', async () => {
    await intruderPage.goto(`/slips/${receiptId}`);

    // The route streams (it has a loading state), so the 200 headers are sent
    // before the server decides it is a miss — what matters is that the page
    // renders the not-found screen and none of the owner's data.
    await expect(intruderPage.getByRole('heading', { name: 'We could not find that' })).toBeVisible();
    const body = await intruderPage.locator('body').innerText();
    expect(body).not.toContain('Fresh Market');
    expect(body).not.toContain('207,92');
  });

  await test.step('the API refuses by id', async () => {
    const detail = await intruderPage.request.get(`/api/receipts/${receiptId}`);
    expect(detail.status()).toBe(404);

    const update = await intruderPage.request.patch(`/api/receipts/${receiptId}`, {
      data: { merchantName: 'Taken over' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(update.status()).toBe(404);

    const remove = await intruderPage.request.delete(`/api/receipts/${receiptId}`);
    expect(remove.status()).toBe(404);

    const pdf = await intruderPage.request.get(`/api/receipts/${receiptId}/pdf`);
    expect(pdf.status()).toBe(404);
  });

  await test.step('a leaked signed document URL is refused', async () => {
    // Even holding the owner's signed URL, another business gets nothing.
    const response = await intruderPage.request.get(signedImageUrl!);
    expect(response.status()).toBe(403);
  });

  await test.step('bulk actions cannot touch another business’s slips', async () => {
    const bulk = await intruderPage.request.post('/api/receipts/bulk', {
      data: { receiptIds: [receiptId], action: 'delete' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(bulk.status()).toBe(404);
  });

  await test.step('the owner’s slip is untouched', async () => {
    await page.reload();
    await expect(page.getByRole('heading', { name: /Fresh Market|Unknown merchant/ })).toBeVisible();
  });

  await intruderContext.close();
});

test('signed document URLs are rejected once tampered with', async ({ page }) => {
  const account = newAccount('tamper');
  await signUp(page, account);
  await completeOnboarding(page);

  const receiptId = await uploadReceipt(page);
  await page.getByRole('button', { name: 'Save and file this slip' }).click();
  await expect(page).toHaveURL(new RegExp(`/slips/${receiptId}$`), { timeout: 30_000 });

  const signedUrl = await page.locator('img[src*="/api/files/receipt"]').first().getAttribute('src');
  expect(signedUrl).toBeTruthy();

  const valid = await page.request.get(signedUrl!);
  expect(valid.status()).toBe(200);

  // Flip a character in the signature: the token must no longer verify.
  const tampered = signedUrl!.slice(0, -2) + (signedUrl!.endsWith('A') ? 'B' : 'A');
  const response = await page.request.get(tampered);
  expect(response.status()).toBe(404);

  const noToken = await page.request.get('/api/files/receipt');
  expect(noToken.status()).toBe(404);
});
