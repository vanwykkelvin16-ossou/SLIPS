import { pathToFileURL } from 'node:url';

/** Returns setting names and safe instructions; never includes secret values. */
export function deploymentErrors(env) {
  const errors = [];
  const required = ['DATABASE_URL', 'AUTH_SECRET', 'FILE_SIGNING_SECRET', 'CRON_SECRET',
    'S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'ADMIN_EMAIL', 'ADMIN_INITIAL_PASSWORD'];
  for (const name of required) if (!env[name]?.trim()) errors.push(`${name} is required`);
  for (const name of ['AUTH_SECRET', 'FILE_SIGNING_SECRET', 'CRON_SECRET']) {
    if (env[name] && env[name].length < 32) errors.push(`${name} must contain at least 32 characters`);
  }
  if (env.AUTH_SECRET && env.AUTH_SECRET === env.FILE_SIGNING_SECRET) errors.push('AUTH_SECRET and FILE_SIGNING_SECRET must be different');
  if (env.STORAGE_DRIVER !== 's3') errors.push('STORAGE_DRIVER must be s3 on Vercel');
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    if (!env[name]) continue;
    try {
      const url = new URL(env[name]);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || ['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error();
    } catch { errors.push(`${name} must be a hosted PostgreSQL connection string`); }
  }
  for (const name of ['AUTH_URL', 'NEXT_PUBLIC_APP_URL', 'S3_ENDPOINT']) {
    if (!env[name]) continue;
    try {
      const url = new URL(env[name]);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    } catch { errors.push(`${name} must be an HTTPS URL`); }
  }
  if (env.ADMIN_INITIAL_PASSWORD && (env.ADMIN_INITIAL_PASSWORD.length < 12 || env.ADMIN_INITIAL_PASSWORD === env.ADMIN_EMAIL)) {
    errors.push('ADMIN_INITIAL_PASSWORD must be at least 12 characters and different from ADMIN_EMAIL');
  }
  if (env.OCR_CACHE_PATH && !env.OCR_CACHE_PATH.startsWith('/tmp/')) errors.push('OCR_CACHE_PATH must be under /tmp/ on Vercel, or left unset');
  if (env.EMAIL_PROVIDER !== 'smtp') errors.push('EMAIL_PROVIDER must be smtp for customer verification and password-reset delivery');
  for (const name of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM']) {
    if (!env[name]?.trim()) errors.push(`${name} is required for email delivery`);
  }
  const ocrKeys = {
    'google-vision': ['GOOGLE_VISION_API_KEY'],
    'aws-textract': ['AWS_TEXTRACT_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    'azure-document-intelligence': ['AZURE_DOCUMENT_ENDPOINT', 'AZURE_DOCUMENT_KEY'],
  };
  for (const name of ocrKeys[env.OCR_PROVIDER] ?? []) if (!env[name]?.trim()) errors.push(`${name} is required by OCR_PROVIDER`);
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--if-vercel') && process.env.VERCEL !== '1') {
    console.info('[deployment] Local compile: hosted configuration check skipped.');
  } else {
    const errors = deploymentErrors(process.env);
    if (errors.length) {
      console.error('[deployment] Add or correct these Vercel environment variables:\n' + errors.map((e) => `  - ${e}`).join('\n'));
      console.error('[deployment] See DEPLOY.md. No migrations or deployment have been run.');
      process.exitCode = 1;
    } else console.info('[deployment] Required configuration is present. Service connectivity must still be verified.');
  }
}
