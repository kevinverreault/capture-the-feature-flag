// End-to-end check of the Birdwatch demo against a running `docker compose up` on an empty database:
//
//   node apps/birdwatch-api/scripts/compose-smoke.ts
//
// Checks that Core seeded the birdwatch project, that a birder can log in on the website, see the feed and log a
// sighting while new-sighting-form serves true, and that switching its targeting off through Core's API hides "Log a
// sighting" and makes the API answer 404 within one poll interval. It switches its targeting back on at the end.
//
// Then the targeting showcase, as the seed configures it: Alice (CA) sees the rare-bird alert banner and Bram (NL)
// doesn't, only Chiara sees "Photo ID (beta)", the flag inspector shows each flag's evaluation reason with a link
// to the flag in the admin app, and switching the targeting of rare-bird-alerts off makes it serve OFF.
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
const targetingPath = (flagKey: string) => `/projects/birdwatch/flags/${flagKey}/targeting/development`;

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

/** Switches the targeting of a flag on or off in development, through Core's API. */
async function setTargeting(on: boolean, flagKey = killSwitch): Promise<void> {
  const { body } = await json(`${coreUrl}/api/v1${targetingPath(flagKey)}`);
  const { status } = await json(`${coreUrl}/api/v1${targetingPath(flagKey)}`, {
    method: 'PATCH',
    body: JSON.stringify({ version: body['version'], on }),
  });
  if (status !== 200) throw new Error(`Switching the targeting of ${flagKey} ${on ? 'on' : 'off'} answered ${status}`);
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

async function feedPage(cookie: string): Promise<string> {
  const response = await fetch(webUrl, { headers: { cookie }, redirect: 'manual' });
  if (response.status !== 200) throw new Error(`The feed answered ${response.status}`);
  return response.text();
}

async function feedShowsLogASighting(cookie: string): Promise<boolean> {
  return (await feedPage(cookie)).includes('data-testid="log-sighting"');
}

/** The evaluation reason the flag inspector of a page shows for a flag, such as `RULE_MATCH`. */
function inspectedReason(page: string, flagKey: string): string | undefined {
  const row = page.split('data-testid="inspected-flag"').find((part) => part.includes(`data-flag="${flagKey}"`));
  return row?.match(/data-reason="([A-Z_]+)"/)?.[1];
}

/** The link of a flag in the flag inspector of a page. */
function inspectedLink(page: string, flagKey: string): string | undefined {
  const row = page.split('data-testid="inspected-flag"').find((part) => part.includes(`data-flag="${flagKey}"`));
  return row?.match(/href="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
}

const showsAlert = (page: string) => page.includes('data-testid="rare-bird-alert"');
const showsPhotoId = (page: string) => page.includes('data-testid="photo-id"');

async function targetingShowcase(): Promise<void> {
  const alice = await webLogIn('alice');
  const alicePage = await feedPage(alice);
  const bramPage = await feedPage(await webLogIn('bram'));
  const chiaraPage = await feedPage(await webLogIn('chiara'));
  check(
    showsAlert(alicePage) && !showsAlert(bramPage),
    'Alice (CA) sees the rare-bird alert banner and Bram (NL) does not',
  );
  check(
    showsPhotoId(chiaraPage) && !showsPhotoId(alicePage) && !showsPhotoId(bramPage),
    'only Chiara sees "Photo ID (beta)"',
  );
  check(
    inspectedReason(alicePage, 'rare-bird-alerts') === 'RULE_MATCH' &&
      inspectedReason(bramPage, 'rare-bird-alerts') === 'DEFAULT' &&
      inspectedReason(chiaraPage, 'photo-id-beta') === 'TARGET_MATCH',
    'the flag inspector shows RULE_MATCH and DEFAULT for rare-bird-alerts, and TARGET_MATCH for photo-id-beta',
  );
  const link = inspectedLink(alicePage, 'rare-bird-alerts');
  const admin = link ? await fetch(link) : undefined;
  check(
    admin?.status === 200 && (await admin.text()).includes('rare-bird-alerts'),
    `the flag inspector links to rare-bird-alerts in the admin app (${link ?? 'no link'})`,
  );
  const species = await fetch(`${webUrl}/species/snowy-owl`, { headers: { cookie: alice } });
  check(species.status === 200 && (await species.text()).includes('Snowy Owl'), 'the species pages render');

  await setTargeting(false, 'rare-bird-alerts');
  try {
    const off = await until(async () => {
      const page = await feedPage(alice);
      return !showsAlert(page) && inspectedReason(page, 'rare-bird-alerts') === 'OFF';
    }, pollIntervalMs + pollGraceMs);
    check(off, 'with its targeting off, rare-bird-alerts serves OFF and Alice no longer sees the banner');
  } finally {
    await setTargeting(true, 'rare-bird-alerts');
  }
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

  await targetingShowcase();
}

try {
  await main();
} catch (error) {
  console.error(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
