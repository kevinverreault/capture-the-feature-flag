/* eslint-disable @typescript-eslint/no-explicit-any -- tests read whatever JSON a response carries */

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
}

/** A thin HTTP client for Core's /api/v1, as an outside caller (admin app, Terraform, Evaluator) sees it. */
export function apiClient(baseUrl: string) {
  async function request<T = any>(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<ApiResponse<T>> {
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, body: (text ? JSON.parse(text) : undefined) as T };
  }

  return {
    request,
    get: <T = any>(path: string, headers?: Record<string, string>) => request<T>('GET', path, undefined, headers),
    post: <T = any>(path: string, body: unknown) => request<T>('POST', path, body),
    patch: <T = any>(path: string, body: unknown) => request<T>('PATCH', path, body),
    delete: <T = any>(path: string) => request<T>('DELETE', path),
  };
}

export type ApiClient = ReturnType<typeof apiClient>;

let counter = 0;
/** A key that is unique within the test run, so tests sharing a Core don't collide. */
export function uniqueKey(prefix: string): string {
  counter += 1;
  return `${prefix}-${process.pid}-${counter}`;
}
