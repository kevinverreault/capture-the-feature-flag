import type { EnvironmentSnapshot, FlagSnapshot, TargetingSnapshot } from '@ctff/evaluation';
import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

const mainJs = fileURLToPath(new URL('../../dist/main.js', import.meta.url));

/** How often the Evaluator polls Core in these tests. */
export const pollIntervalMs = 100;

export interface RunningEvaluator {
  url: string;
  /** Every JSON log line the Evaluator has written to stdout so far. */
  logs: Record<string, unknown>[];
  /** Whether `/health/ready` answers 200. */
  isReady(): Promise<boolean>;
  /** Resolves once `/health/ready` answers 200. */
  waitUntilReady(): Promise<void>;
  stop(): Promise<void>;
}

/** Starts the built Evaluator as its own process, configured only through environment variables. */
export async function startEvaluator(coreUrl: string, env: Record<string, string> = {}): Promise<RunningEvaluator> {
  const child = spawn(process.execPath, [mainJs], {
    env: {
      PATH: process.env['PATH'],
      CORE_URL: coreUrl,
      PORT: '0',
      HOST: '127.0.0.1',
      LOG_LEVEL: 'info',
      POLL_INTERVAL_MS: String(pollIntervalMs),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs: Record<string, unknown>[] = [];
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The Evaluator did not start in time.\n${stderr}`)), 15_000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`The Evaluator exited with code ${code} before listening.\n${stderr}`));
    });
    createInterface({ input: child.stdout }).on('line', (line) => {
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        entry = { unparsed: line };
      }
      logs.push(entry);
      if (typeof entry['port'] === 'number' && entry['msg'] === 'Evaluator listening') {
        clearTimeout(timer);
        resolve(entry['port']);
      }
    });
  });

  const url = `http://127.0.0.1:${port}`;
  const isReady = async () => (await fetch(`${url}/health/ready`)).ok;
  return {
    url,
    logs,
    isReady,
    waitUntilReady: () =>
      vi.waitFor(
        async () => {
          if (!(await isReady())) throw new Error('The Evaluator is not ready');
        },
        { timeout: 10_000, interval: 50 },
      ),
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

/** A flag the way Core creates it: variations `[true, false]` and off-state targeting, adjusted by `targeting`. */
export function flag(key: string, targeting: Partial<TargetingSnapshot> = {}): FlagSnapshot {
  return {
    key,
    variations: [true, false],
    version: 1,
    targeting: {
      on: false,
      offVariation: 1,
      defaultVariation: 0,
      individualTargets: [],
      rules: [],
      version: 1,
      ...targeting,
    },
  };
}

export function environment(environmentKey: string, flags: FlagSnapshot[]): EnvironmentSnapshot {
  return { projectKey: 'birdwatch', environmentKey, flags };
}
