/** birdwatch-api's configuration. It all comes from environment variables, so the same image runs anywhere. */
export interface BirdwatchApiConfig {
  host: string;
  port: number;
  logLevel: string;
  /** The Evaluator the SDK asks for flags, such as `http://evaluator:3000`. */
  evaluatorUrl: string;
  /** How long the SDK waits for the Evaluator before falling back. */
  evaluatorTimeoutMs: number;
  /** Where the SDK key comes from: given, or looked up in Core by project and environment key. */
  sdkKeySource: { sdkKey: string } | { coreUrl: string; projectKey: string; environmentKey: string };
  /** The fixed dev key session tokens (fake JWTs) are signed with. It protects nothing: this is a demo. */
  sessionSecret: string;
}

/** The dev key the demo signs its fake logins with, unless SESSION_SECRET says otherwise. Not a secret. */
export const devSessionSecret = 'birdwatch-dev-key-not-a-secret';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BirdwatchApiConfig {
  const evaluatorUrl = url(env, 'EVALUATOR_URL');
  if (!evaluatorUrl) throw new Error('EVALUATOR_URL is required');

  const sdkKey = env['CTFF_SDK_KEY']?.trim();
  const coreUrl = url(env, 'CORE_URL');
  if (!sdkKey && !coreUrl) {
    throw new Error('Set CTFF_SDK_KEY, or CORE_URL to look the SDK key up in Core');
  }

  return {
    host: env['HOST'] ?? '0.0.0.0',
    port: integer(env, 'PORT', 3000, 0, 65535),
    logLevel: env['LOG_LEVEL'] ?? 'info',
    evaluatorUrl,
    evaluatorTimeoutMs: integer(env, 'CTFF_TIMEOUT_MS', 500, 1),
    sdkKeySource: sdkKey
      ? { sdkKey }
      : {
          coreUrl: coreUrl as string,
          projectKey: env['CTFF_PROJECT']?.trim() || 'birdwatch',
          environmentKey: env['CTFF_ENVIRONMENT']?.trim() || 'development',
        },
    sessionSecret: env['SESSION_SECRET']?.trim() || devSessionSecret,
  };
}

/** A URL variable without its trailing slashes, or `''` when unset. */
function url(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) return '';
  if (!URL.canParse(value)) throw new Error(`${name} is not a URL: ${value}`);
  return value.replace(/\/+$/, '');
}

/** An integer variable, where an empty value (e.g. `PORT=` in an env file) means unset. */
function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max = Infinity): number {
  const raw = env[name]?.trim() || String(fallback);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} is not valid: ${raw}`);
  return value;
}
