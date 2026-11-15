import { describe, expect, it } from 'vitest';
import { isUnverifiablePost } from '../src/lib/site-check.js';

const post = (headers: Record<string, string>) =>
  new Request('http://admin.test/projects', { method: 'POST', headers });

describe('isUnverifiablePost', () => {
  it('flags a form post that says nothing about where it comes from', () => {
    expect(isUnverifiablePost(post({ 'content-type': 'application/x-www-form-urlencoded' }))).toBe(true);
  });

  it('leaves a post with an Origin or Sec-Fetch-Site header to Astro’s origin check', () => {
    expect(isUnverifiablePost(post({ origin: 'http://admin.test' }))).toBe(false);
    expect(isUnverifiablePost(post({ 'sec-fetch-site': 'same-origin' }))).toBe(false);
  });

  it('leaves reads alone', () => {
    expect(isUnverifiablePost(new Request('http://admin.test/projects'))).toBe(false);
    expect(isUnverifiablePost(new Request('http://admin.test/projects', { method: 'HEAD' }))).toBe(false);
  });
});
