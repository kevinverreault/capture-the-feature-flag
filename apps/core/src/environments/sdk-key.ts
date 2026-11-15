import { randomBytes } from 'node:crypto';

/** A new opaque SDK key: a recognizable prefix and 144 random bits. */
export function generateSdkKey(): string {
  return `ctff-env-${randomBytes(18).toString('base64url')}`;
}
