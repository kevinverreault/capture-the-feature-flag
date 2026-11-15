import { resetDemo } from './demo.js';
import { stackIsReady, startStack, stopStack } from './stack.js';

/**
 * Attaches to the compose stack when it is already up and ready, and otherwise starts it (with compose.e2e.yaml),
 * then puts the Birdwatch demo back as Core seeds it. `E2E_STACK=attach` never starts it, and fails when it isn't
 * ready; `E2E_STACK=compose` always runs `docker compose up` with compose.e2e.yaml (which recreates the services
 * it changes). A stack that wasn't up before the suite started it is stopped, volumes and all, at the end, unless
 * `E2E_KEEP_STACK=1`: one that was up is left running, with its data.
 */
export default async function globalSetup(): Promise<(() => Promise<void>) | undefined> {
  const mode = process.env['E2E_STACK'] ?? 'auto';
  if (!['auto', 'attach', 'compose'].includes(mode)) throw new Error(`E2E_STACK must be auto, attach or compose`);

  const wasReady = await stackIsReady();
  const starts = mode === 'compose' || (mode === 'auto' && !wasReady);
  const stopsAtTheEnd = starts && !wasReady && process.env['E2E_KEEP_STACK'] !== '1';
  try {
    if (starts) {
      await startStack();
      // As compose.e2e.yaml sets it, for the scenarios waiting on telemetry (the workers inherit it).
      process.env['TELEMETRY_FLUSH_INTERVAL_MS'] ??= '2000';
    }
    if (!(await stackIsReady())) throw new Error('The compose stack is not ready: start it with `docker compose up`');
    await resetDemo();
  } catch (error) {
    // No scenario runs, so no teardown either: stop now what the suite started (or half started).
    if (stopsAtTheEnd) await stopStack().catch(() => undefined);
    throw error;
  }
  return stopsAtTheEnd ? stopStack : undefined;
}
