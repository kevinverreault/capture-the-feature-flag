import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A request that went through the proxy to the Evaluator. */
export interface ProxiedRequest {
  method: string;
  path: string;
  /** The parsed JSON body, if any. */
  body: unknown;
}

/** An HTTP proxy in front of an Evaluator that records every request, to count the SDK's calls. */
export interface CountingProxy {
  url: string;
  requests: ProxiedRequest[];
  stop(): Promise<void>;
}

export async function startCountingProxy(targetUrl: string): Promise<CountingProxy> {
  const requests: ProxiedRequest[] = [];
  const server: Server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString();
    const method = request.method ?? 'GET';
    const path = request.url ?? '/';
    requests.push({ method, path, body: text ? (JSON.parse(text) as unknown) : undefined });

    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (typeof value === 'string' && name !== 'host' && name !== 'content-length') headers.set(name, value);
    }
    try {
      const answer = await fetch(`${targetUrl}${path}`, { method, headers, body: text || undefined });
      response.writeHead(answer.status, { 'content-type': answer.headers.get('content-type') ?? 'text/plain' });
      response.end(await answer.text());
    } catch {
      response.writeHead(502).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    stop: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };
}
