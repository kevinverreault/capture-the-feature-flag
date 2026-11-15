/** Core's configuration. It all comes from environment variables, so the same image runs anywhere. */
export interface CoreConfig {
  databaseUrl: string;
  host: string;
  port: number;
  logLevel: string;
  /** Whether Core serves the admin app (off when the admin app runs in its own container). */
  adminEnabled: boolean;
  /** The Core the admin app calls; unset means this one. */
  adminCoreUrl?: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CoreConfig {
  const databaseUrl = env['DATABASE_URL'];
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  // An empty PORT (e.g. `PORT=` in an env file) means unset, not port 0.
  const rawPort = env['PORT']?.trim() || '3000';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`PORT is not a valid port: ${rawPort}`);

  return {
    databaseUrl,
    host: env['HOST'] ?? '0.0.0.0',
    port,
    logLevel: env['LOG_LEVEL'] ?? 'info',
    adminEnabled: parseBoolean('ADMIN_ENABLED', env['ADMIN_ENABLED'], true),
    adminCoreUrl: env['ADMIN_CORE_URL']?.trim() || undefined,
  };
}

function parseBoolean(name: string, raw: string | undefined, fallback: boolean): boolean {
  const value = raw?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false: ${raw}`);
}
