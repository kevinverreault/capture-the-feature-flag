import { resetDemo } from './demo.js';
import { stackIsReady, startStack, stopStack } from './stack.js';

/**
 * Attaches to the compose stack when it is already up and ready, and otherwise starts it (with compose.e2e.yaml),
 * then puts the Birdwatch demo back as Core seeds it. `E2E_STACK=attach` never starts it, and fails when it isn't
 * ready; `E2E_STACK=compose` always runs `docker compose up` (which leaves services already up as they are). A
 * stack the suite started is stopped, volumes and all, at the end, unless `E2E_KEEP_STACK=1`.
 */
export default async function globalSetup(): Promise<(() => Promise<void>) | undefined> {
  const mode = process.env['E2E_STACK'] ?? 'auto';
  if (!['auto', 'attach', 'compose'].includes(mode)) throw new Error(`E2E_STACK must be auto, attach or compose`);

  let started = false;
  if (mode === 'compose' || (mode === 'auto' && !(await stackIsReady()))) {
    await startStack();
    started = true;
    // As compose.e2e.yaml sets it, for the scenarios waiting on telemetry (the workers inherit it).
    process.env['TELEMETRY_FLUSH_INTERVAL_MS'] ??= '2000';
  }
  if (!(await stackIsReady())) throw new Error('The compose stack is not ready: start it with `docker compose up`');

  await resetDemo();
  return started && process.env['E2E_KEEP_STACK'] !== '1' ? stopStack : undefined;
}
