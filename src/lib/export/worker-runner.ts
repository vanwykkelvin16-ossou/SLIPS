/**
 * Standalone export worker.
 *
 *   npm run worker:exports
 *
 * Only needed when the app runs on a platform that stops executing a function
 * as soon as it has responded (most serverless hosts). On a normal Node server
 * exports are processed in-process and this is optional — though it also
 * cleans up archives past their retention window, so running it on a schedule
 * is still a good idea.
 */
import { expireOldExports, processPendingExports } from './queue';

const POLL_INTERVAL_MS = Number(process.env.EXPORT_WORKER_INTERVAL_MS ?? 15_000);

let stopping = false;

async function tick() {
  try {
    const processed = await processPendingExports();
    if (processed > 0) {
      // eslint-disable-next-line no-console
      console.info(`[export-worker] processed ${processed} job(s)`);
    }
    const expired = await expireOldExports();
    if (expired > 0) {
      // eslint-disable-next-line no-console
      console.info(`[export-worker] expired ${expired} archive(s)`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[export-worker] tick failed', (error as Error).message);
  }
}

async function main() {
  // eslint-disable-next-line no-console
  console.info(`[export-worker] started, polling every ${POLL_INTERVAL_MS}ms`);

  const shutdown = () => {
    stopping = true;
    // eslint-disable-next-line no-console
    console.info('[export-worker] shutting down');
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (!stopping) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  process.exit(0);
}

void main();
