/** Core's configuration. It all comes from environment variables, so the same image runs anywhere. */
export interface CoreConfig {
  databaseUrl: string;
  host: string;
  port: number;
  logLevel: string;
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
  };
}
