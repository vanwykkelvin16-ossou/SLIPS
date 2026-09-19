import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deploymentErrors } from '../scripts/check-deployment.mjs';
const ready = { DATABASE_URL: 'postgresql://app:secret@db.example.com/slips', AUTH_SECRET: 'a'.repeat(48),
  FILE_SIGNING_SECRET: 'b'.repeat(48), CRON_SECRET: 'c'.repeat(48), STORAGE_DRIVER: 's3', S3_BUCKET: 'slips',
  S3_REGION: 'auto', S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test', ADMIN_EMAIL: 'admin@example.com',
  ADMIN_INITIAL_PASSWORD: 'a-test-only-password', EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587', SMTP_USER: 'test', SMTP_PASSWORD: 'test', EMAIL_FROM: 'app@example.com' };
test('configured deployment passes; missing services fail with names only', () => {
  assert.deepEqual(deploymentErrors(ready), []);
  assert.ok(deploymentErrors({}).some((error) => error.includes('DATABASE_URL')));
  const errors = deploymentErrors({...ready, STORAGE_DRIVER: 'local', S3_ENDPOINT: 'http://insecure.example.com', OCR_CACHE_PATH: './cache'});
  assert.equal(errors.length, 3);
  assert.ok(errors.every((error) => !error.includes('test-only-password')));
});
test('placeholder connection strings and shared secrets fail', () => {
  assert.ok(deploymentErrors({...ready, DATABASE_URL: 'postgresql://test:test@localhost/slips'}).some((error) => error.includes('hosted')));
  assert.ok(deploymentErrors({...ready, FILE_SIGNING_SECRET: ready.AUTH_SECRET}).some((error) => error.includes('different')));
});
