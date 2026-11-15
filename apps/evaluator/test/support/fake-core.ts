import {
  type EnvironmentList,
  type EnvironmentListEntry,
  type EnvironmentSnapshot,
  sdkKeyHeader,
} from '@ctff/evaluation';
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A request the fake Core received, and how it answered. */
export interface CoreRequest {
  path: string;
  sdkKey: string | undefined;
  ifNoneMatch: string | undefined;
  status: number;
}

/**
 * A stand-in for Core's evaluator endpoints (`/api/v1/evaluator/*`), built only from the shared types in
 * @ctff/evaluation, which Core's own tests (S2) check Core against. It serves the environment list and one
 * snapshot per SDK key, each with an ETag, and answers `304` to a matching If-None-Match like Core does.
 */
export interface FakeCore {
  url: string;
  requests: CoreRequest[];
  /** Adds the environment, or replaces its snapshot. */
  put(sdkKey: string, snapshot: EnvironmentSnapshot): void;
  remove(sdkKey: string): void;
  /** While unavailable, every request gets `503`. */
  setAvailable(available: boolean): void;
  /** Stops listening, so the Evaluator's requests fail to connect, as when Core is down. */
  stop(): Promise<void>;
  /** Listens again, on the same port. */
  restart(): Promise<void>;
}

export async function startFakeCore(): Promise<FakeCore> {
  const environments = new Map<string, EnvironmentSnapshot>();
  const requests: CoreRequest[] = [];
  let available = true;

  function answer(request: IncomingMessage, response: ServerResponse): void {
    const path = new URL(request.url ?? '/', 'http://fake-core').pathname;
    const sdkKey = header(request, sdkKeyHeader);
    const ifNoneMatch = header(request, 'if-none-match');
    const send = (status: number, body?: unknown) => {
      if (body === undefined) {
        requests.push({ path, sdkKey, ifNoneMatch, status });
        response.writeHead(status).end();
        return;
      }
      const json = JSON.stringify(body);
      const etag = `"${createHash('sha256').update(json).digest('base64url')}"`;
      const unchanged = status === 200 && ifNoneMatch === etag;
      requests.push({ path, sdkKey, ifNoneMatch, status: unchanged ? 304 : status });
      if (unchanged) response.writeHead(304, { etag }).end();
      else response.writeHead(status, { 'content-type': 'application/json', etag }).end(json);
    };

    if (!available) return send(503);
    if (request.method !== 'GET') return send(405);
    if (path === '/api/v1/evaluator/environments') {
      const list: EnvironmentList = {
        environments: [...environments.entries()]
          .map(([key, snapshot]): EnvironmentListEntry => ({
            projectKey: snapshot.projectKey,
            environmentKey: snapshot.environmentKey,
            sdkKey: key,
          }))
          .sort((a, b) => (a.sdkKey < b.sdkKey ? -1 : 1)),
      };
      return send(200, list);
    }
    if (path === '/api/v1/evaluator/snapshot') {
      if (!sdkKey) return send(400);
      const snapshot = environments.get(sdkKey);
      return snapshot ? send(200, snapshot) : send(404);
    }
    return send(404);
  }

  const server: Server = createServer(answer);
  await listen(server, 0);
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    put: (sdkKey, snapshot) => void environments.set(sdkKey, structuredClone(snapshot)),
    remove: (sdkKey) => void environments.delete(sdkKey),
    setAvailable: (value) => (available = value),
    stop: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
    restart: () => listen(server, port),
  };
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value.join(', ') : value;
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}
