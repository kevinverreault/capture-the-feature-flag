// End-to-end check of the evaluation path against a running `docker compose up`: Core's API changes targeting,
// and the SDK sees the change through the Evaluator. Build the SDK first (`pnpm nx run @ctff/sdk:build`), then:
//
//   node apps/evaluator/scripts/compose-smoke.ts switch-on
//       Creates a project with a flag, checks the SDK gets `false` while targeting is off, switches targeting on
//       through Core's API and checks the SDK gets `true` within one poll interval (see `pollGraceMs`). Prints the
//       SDK key.
//   node apps/evaluator/scripts/compose-smoke.ts expect <sdk-key> <flag-key> <true|false>
//       Checks the SDK gets that variation (for instance after `docker compose stop core`).
//
// Environment: CORE_URL (default http://localhost:3000), EVALUATOR_URL (default http://localhost:3001) and
// POLL_INTERVAL_MS (the Evaluator's, default 2000).

import { createClient, type Client, type EvaluationDetail } from '@ctff/sdk';

const coreUrl = process.env['CORE_URL'] ?? 'http://localhost:3000';
const evaluatorUrl = process.env['EVALUATOR_URL'] ?? 'http://localhost:3001';
const pollIntervalMs = Number(process.env['POLL_INTERVAL_MS'] ?? 2000);
const flagKey = 'smoke-test-flag';
/**
 * The Evaluator starts its next poll one interval after the previous poll ends, so a change shows up within one
 * interval plus the duration of one poll (milliseconds inside compose). This grace covers that, the 100 ms between
 * this script's evaluations, and one evaluation's round trip; nothing more.
 */
const pollGraceMs = 500;
const context = { user_id: 'smoke-test', country: 'CA' };

async function core(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${coreUrl}/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${await response.text()}`);
  return (await response.json()) as Record<string, unknown>;
}

/** Evaluates until `done` accepts the detail or the deadline passes, and returns the last detail. */
async function evaluateUntil(
  client: Client,
  done: (detail: EvaluationDetail) => boolean,
  timeoutMs: number,
): Promise<EvaluationDetail> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const detail = await client.variationDetail(flagKey, context, true);
    if (done(detail) || performance.now() > deadline) return detail;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
  console.error(`ok: ${message}`);
}

async function switchOn(): Promise<void> {
  const projectKey = `smoke-test-${Date.now()}`;
  await core('POST', '/projects', { key: projectKey, name: 'Smoke test' });
  const { sdkKey } = (await core('POST', `/projects/${projectKey}/environments`, {
    key: 'production',
    name: 'Production',
  })) as { sdkKey: string };
  await core('POST', `/projects/${projectKey}/flags`, { key: flagKey, name: 'Smoke test flag' });
  const client = createClient({ evaluatorUrl, sdkKey });

  // The Evaluator learns about the new environment on its next poll.
  const off = await evaluateUntil(client, (detail) => detail.reason.kind !== 'ERROR', pollIntervalMs * 3);
  check(off.value === false && off.reason.kind === 'OFF', `targeting off serves false (${JSON.stringify(off)})`);

  const targeting = (await core('GET', `/projects/${projectKey}/flags/${flagKey}/targeting/production`)) as {
    version: number;
  };
  await core('PATCH', `/projects/${projectKey}/flags/${flagKey}/targeting/production`, {
    version: targeting.version,
    on: true,
  });
  const switched = performance.now();
  const on = await evaluateUntil(
    client,
    (detail) => detail.value && detail.reason.kind === 'DEFAULT',
    pollIntervalMs + pollGraceMs,
  );
  const elapsed = Math.round(performance.now() - switched);
  check(
    on.value === true && on.reason.kind === 'DEFAULT',
    `targeting on serves true after ${elapsed} ms, within one poll interval (${JSON.stringify(on)})`,
  );
  console.log(sdkKey);
}

async function expectVariation(sdkKey: string, key: string, expected: boolean): Promise<void> {
  const detail = await createClient({ evaluatorUrl, sdkKey }).variationDetail(key, context, !expected);
  check(
    detail.value === expected && detail.reason.kind !== 'ERROR',
    `${key} serves ${expected} (${JSON.stringify(detail)})`,
  );
}

const [command, ...args] = process.argv.slice(2);
try {
  if (command === 'switch-on') await switchOn();
  else if (command === 'expect' && args.length === 3 && (args[2] === 'true' || args[2] === 'false')) {
    await expectVariation(args[0] as string, args[1] as string, args[2] === 'true');
  } else throw new Error('Usage: compose-smoke.ts switch-on | expect <sdk-key> <flag-key> <true|false>');
} catch (error) {
  console.error(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
