/** The Evaluator's configuration. It all comes from environment variables, so the same image runs anywhere. */
export interface EvaluatorConfig {
  /** Core's base URL, whose `/api/v1/evaluator/*` endpoints the Evaluator polls. */
  coreUrl: string;
  host: string;
  port: number;
  logLevel: string;
  /** The pause between the end of one poll of Core and the start of the next. */
  pollIntervalMs: number;
  /** How long one request to Core may take before the poll counts as failed. */
  coreTimeoutMs: number;
  /** The pause between the end of one telemetry flush to Core and the start of the next. */
  telemetryFlushIntervalMs: number;
  /**
   * The most seen contexts per environment held between flushes; past it, the least recently seen are dropped.
   * Bounds memory and the size of a batch.
   */
  telemetryMaxSeenContexts: number;
  /**
   * How long one telemetry request to Core may take. Longer than Core's own limit for storing a batch (40 s), so a
   * batch Core stores isn't reported as lost. Sending at shutdown uses `coreTimeoutMs` instead, to stop promptly.
   */
  telemetryTimeoutMs: number;
  /** The most bytes of JSON in one telemetry request; a flush that holds more is sent in several requests. */
  telemetryMaxBatchBytes: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EvaluatorConfig {
  const coreUrl = env['CORE_URL']?.trim();
  if (!coreUrl) throw new Error('CORE_URL is required');
  if (!URL.canParse(coreUrl)) throw new Error(`CORE_URL is not a URL: ${coreUrl}`);

  return {
    coreUrl: coreUrl.replace(/\/+$/, ''),
    host: env['HOST'] ?? '0.0.0.0',
    port: integer(env, 'PORT', 3000, 0, 65535),
    logLevel: env['LOG_LEVEL'] ?? 'info',
    pollIntervalMs: integer(env, 'POLL_INTERVAL_MS', 5000, 1),
    coreTimeoutMs: integer(env, 'CORE_TIMEOUT_MS', 5000, 1),
    telemetryFlushIntervalMs: integer(env, 'TELEMETRY_FLUSH_INTERVAL_MS', 60_000, 1),
    telemetryMaxSeenContexts: integer(env, 'TELEMETRY_MAX_SEEN_CONTEXTS', 1000, 1),
    telemetryTimeoutMs: integer(env, 'TELEMETRY_TIMEOUT_MS', 45_000, 1),
    // Core accepts up to 10 MB; staying well below it leaves room for a single large environment.
    telemetryMaxBatchBytes: integer(env, 'TELEMETRY_MAX_BATCH_BYTES', 1_000_000, 1024, 10_000_000),
  };
}

/** An integer variable, where an empty value (e.g. `PORT=` in an env file) means unset. */
function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max = Infinity): number {
  const raw = env[name]?.trim() || String(fallback);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} is not valid: ${raw}`);
  return value;
}
