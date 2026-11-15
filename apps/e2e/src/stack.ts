import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

/**
 * Where the services of the compose stack answer, as a browser on the host reaches them: the ports compose.yaml
 * publishes, unless the environment names others.
 */
export const urls = {
  /** Core, with the admin app on the same origin. */
  core: process.env['CORE_URL'] ?? 'http://localhost:3000',
  evaluator: process.env['EVALUATOR_URL'] ?? 'http://localhost:3001',
  birdwatchApi: process.env['BIRDWATCH_API_URL'] ?? 'http://localhost:4001',
  birdwatchWeb: process.env['BIRDWATCH_WEB_URL'] ?? 'http://localhost:4000',
  showcase: process.env['SHOWCASE_URL'] ?? 'http://localhost:8080',
};

/** The Evaluator's poll interval (compose.yaml's `POLL_INTERVAL_MS`). */
const pollIntervalMs = Number(process.env['POLL_INTERVAL_MS'] ?? 2000);

/**
 * How long a targeting change may take to show in Birdwatch: one poll interval, plus the poll itself, a page load
 * through birdwatch-web, birdwatch-api and the Evaluator, and room for a busy CI runner.
 */
export const withinPollInterval = pollIntervalMs + 5000;

/**
 * How long Birdwatch's evaluations may take to show in the admin app: the Evaluator's telemetry flush interval
 * (2 s with compose.e2e.yaml, about 60 s in the plain compose stack, which the suite may attach to), and Core
 * storing the batch.
 */
export const withinTelemetryFlush = Number(process.env['TELEMETRY_FLUSH_INTERVAL_MS'] ?? 60_000) + 15_000;

/** The readiness check of each service, which `docker compose up --wait` also waits for. */
const readiness = [
  `${urls.core}/health/ready`,
  `${urls.evaluator}/health/ready`,
  `${urls.birdwatchApi}/health/ready`,
  `${urls.birdwatchWeb}/health/ready`,
  `${urls.showcase}/`,
];

/** Whether every service of the stack is up and ready. */
export async function stackIsReady(): Promise<boolean> {
  const answers = await Promise.all(
    readiness.map((url) =>
      fetch(url, { signal: AbortSignal.timeout(2000) }).then(
        (response) => response.ok,
        () => false,
      ),
    ),
  );
  return answers.every(Boolean);
}

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const composeFiles = ['-f', 'compose.yaml', '-f', 'apps/e2e/compose.e2e.yaml'];
const run = promisify(execFile);

async function compose(args: string[]): Promise<void> {
  const { stdout, stderr } = await run('docker', ['compose', ...composeFiles, ...args], {
    cwd: repositoryRoot,
    maxBuffer: 64 * 1024 * 1024,
  });
  process.stderr.write(stdout + stderr);
}

/** Builds and starts the stack, returning once every service reports healthy. */
export async function startStack(): Promise<void> {
  await compose(['up', '--build', '--detach', '--wait', '--wait-timeout', '300']);
}

/** Stops the stack and deletes its volumes, so the next start seeds an empty database again. */
export async function stopStack(): Promise<void> {
  await compose(['down', '--volumes']);
}
