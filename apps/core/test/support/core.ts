import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { inject } from 'vitest';

const mainJs = fileURLToPath(new URL('../../dist/main.js', import.meta.url));

export interface RunningCore {
  baseUrl: string;
  databaseUrl: string;
  /** Every JSON log line Core has written to stdout so far. */
  logs: Record<string, unknown>[];
  stop(): Promise<void>;
}

/** Creates an empty database on the test server and returns its URL. */
export async function createDatabase(): Promise<string> {
  const adminUrl = inject('adminDatabaseUrl');
  const name = `ctff_test_${randomBytes(6).toString('hex')}`;
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

/**
 * Starts the built Core as its own process, configured only through environment variables. The demo seed is off
 * (SEED_DEMO=false) unless `env` turns it on, so each test file starts on an empty database.
 */
export async function startCore(
  options: { databaseUrl?: string; env?: Record<string, string> } = {},
): Promise<RunningCore> {
  const databaseUrl = options.databaseUrl ?? (await createDatabase());
  const child = spawn(process.execPath, [mainJs], {
    env: {
      PATH: process.env['PATH'],
      DATABASE_URL: databaseUrl,
      PORT: '0',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'info',
      SEED_DEMO: 'false',
      ...options.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs: Record<string, unknown>[] = [];
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Core did not start in time.\n${stderr}`)), 30_000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Core exited with code ${code} before listening.\n${stderr}`));
    });
    createInterface({ input: child.stdout }).on('line', (line) => {
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        entry = { unparsed: line };
      }
      logs.push(entry);
      if (typeof entry['port'] === 'number' && entry['msg'] === 'Core listening') {
        clearTimeout(timer);
        resolve(entry['port']);
      }
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    databaseUrl,
    logs,
    stop: () => stopProcess(child),
  };
}

function stopProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
  });
}
