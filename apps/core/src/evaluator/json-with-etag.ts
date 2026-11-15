import type { Response } from 'express';
import { createHash } from 'node:crypto';

/** A response body serialized once, with the ETag derived from it. */
export interface JsonWithEtag {
  /** The body as JSON, exactly as it is sent. */
  json: string;
  /** A strong ETag derived from the JSON, so it changes exactly when the body does. */
  etag: string;
}

export function toJsonWithEtag(body: unknown): JsonWithEtag {
  const json = JSON.stringify(body);
  return { json, etag: `"${createHash('sha256').update(json).digest('base64url')}"` };
}

/** Sends the body with its ETag, or `304 Not Modified` when If-None-Match already names it. */
export function sendWithEtag(response: Response, { json, etag }: JsonWithEtag, ifNoneMatch: string | undefined): void {
  response.setHeader('ETag', etag);
  response.setHeader('Cache-Control', 'no-cache');
  if (matchesIfNoneMatch(ifNoneMatch, etag)) {
    response.status(304).end();
    return;
  }
  response.status(200).type('application/json').send(json);
}

/** Whether an If-None-Match header matches the ETag (weak comparison, as RFC 9110 requires for this header). */
export function matchesIfNoneMatch(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const opaque = (tag: string) => tag.trim().replace(/^W\//, '');
  return ifNoneMatch.split(',').some((candidate) => candidate.trim() === '*' || opaque(candidate) === opaque(etag));
}
