// End-to-end check of the Birdwatch demo against a running `docker compose up` on an empty database:
//
//   node apps/birdwatch-api/scripts/compose-smoke.ts
//
// Checks that Core seeded the birdwatch project, that a birder can log in on the website, see the feed and log a
// sighting while new-sighting-form serves true, and that switching its targeting off through Core's API hides "Log a
// sighting" and makes the API answer 404 within one poll interval. It switches its targeting back on at the end.
//
// Environment: CORE_URL (default http://localhost:3000), BIRDWATCH_API_URL (default http://localhost:4001),
// BIRDWATCH_WEB_URL (default http://localhost:4000) and POLL_INTERVAL_MS (the Evaluator's, default 2000).

const coreUrl = process.env['CORE_URL'] ?? 'http://localhost:3000';
const apiUrl = process.env['BIRDWATCH_API_URL'] ?? 'http://localhost:4001';
const webUrl = process.env['BIRDWATCH_WEB_URL'] ?? 'http://localhost:4000';
const pollIntervalMs = Number(process.env['POLL_INTERVAL_MS'] ?? 2000);
/**
 * On top of one poll interval: the poll's own latency, the pause between this script's attempts, and a page load
 * through the website, birdwatch-api and the Evaluator, with room for a busy CI runner. The spec asks for "within
 * seconds", and the script prints how long it actually took.
 */
const pollGraceMs = 3000;
const killSwitch = 'new-sighting-form';
const targetingPath = `/projects/birdwatch/flags/${killSwitch}/targeting/development`;

async function json(url: string, init: RequestInit = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
  console.error(`ok: ${message}`);
}

/** Retries `attempt` until it returns true or the deadline passes, and returns its last answer. */
async function until(attempt: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    if (await attempt()) return true;
    if (performance.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** Switches the targeting of the kill switch on or off in development, through Core's API. */
async function setTargeting(on: boolean): Promise<void> {
  const { body } = await json(`${coreUrl}/api/v1${targetingPath}`);
  const { status } = await json(`${coreUrl}/api/v1${targetingPath}`, {
    method: 'PATCH',
    body: JSON.stringify({ version: body['version'], on }),
  });
  if (status !== 200)
    throw new Error(`Switching the targeting of ${killSwitch} ${on ? 'on' : 'off'} answered ${status}`);
}

async function webLogIn(birderId: string): Promise<string> {
  const response = await fetch(`${webUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: webUrl },
    body: new URLSearchParams({ birderId }),
    redirect: 'manual',
  });
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith('birdwatch-session='));
  if (response.status !== 303 || !cookie) throw new Error(`Logging in on the website answered ${response.status}`);
  return cookie.split(';')[0] as string;
}

async function feedShowsLogASighting(cookie: string): Promise<boolean> {
  const response = await fetch(webUrl, { headers: { cookie }, redirect: 'manual' });
  if (response.status !== 200) throw new Error(`The feed answered ${response.status}`);
  return (await response.text()).includes('data-testid="log-sighting"');
}

async function logSighting(token: string): Promise<number> {
  const { status } = await json(`${apiUrl}/api/sightings`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ speciesId: 'snowy-owl', location: 'Compose smoke test', count: 1 }),
  });
  return status;
}

async function main(): Promise<void> {
  const flags = await json(`${coreUrl}/api/v1/projects/birdwatch/flags`);
  const flagKeys = (flags.body as unknown as { key: string }[]).map((flag) => flag.key).sort();
  check(
    JSON.stringify(flagKeys) === JSON.stringify(['new-sighting-form', 'photo-id-beta', 'rare-bird-alerts']),
    `Core seeded the birdwatch project with its three flags (${flagKeys.join(', ')})`,
  );

  const session = await json(`${apiUrl}/api/session`, { method: 'POST', body: JSON.stringify({ birderId: 'bram' }) });
  const token = session.body['token'];
  check(session.status === 201 && typeof token === 'string', 'a visitor logs in to birdwatch-api as Bram');
  const feed = await json(`${apiUrl}/api/sightings`, { headers: { authorization: `Bearer ${token as string}` } });
  const values = (feed.body['flags'] as { values: Record<string, boolean> }).values;
  check(
    Array.isArray(feed.body['sightings']) && values[killSwitch] === true,
    `the feed comes with ${killSwitch} serving true`,
  );
  check((await logSighting(token as string)) === 201, 'Bram logs a sighting');

  const cookie = await webLogIn('alice');
  check(await feedShowsLogASighting(cookie), 'the website shows Alice the feed with "Log a sighting"');

  await setTargeting(false);
  try {
    const switched = performance.now();
    const hidden = await until(async () => !(await feedShowsLogASighting(cookie)), pollIntervalMs + pollGraceMs);
    check(
      hidden,
      `"Log a sighting" is gone ${Math.round(performance.now() - switched)} ms after its targeting is switched off`,
    );
    check((await logSighting(token as string)) === 404, `the endpoint answers 404 while ${killSwitch} serves false`);
  } finally {
    await setTargeting(true);
  }
}

try {
  await main();
} catch (error) {
  console.error(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
