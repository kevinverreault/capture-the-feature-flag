import { describe, expect, it } from 'vitest';
import { flagFieldsBody, flagFieldValues } from '../src/lib/flag-fields.js';

const flag = { name: 'Rare bird alerts', description: 'Banner', tags: ['alerts', 'birdwatch'] };

describe('flagFieldValues', () => {
  it('shows the flag as it is when nothing was submitted', () => {
    expect(flagFieldValues(() => undefined, flag)).toEqual({
      name: 'Rare bird alerts',
      description: 'Banner',
      tags: 'alerts, birdwatch',
    });
  });

  it('shows empty fields for a new flag', () => {
    expect(flagFieldValues(() => undefined)).toEqual({ name: '', description: '', tags: '' });
  });

  it('keeps what was submitted, field by field', () => {
    const submitted: Record<string, string> = { name: 'Mine', tags: '' };
    expect(flagFieldValues((name) => submitted[name], flag)).toEqual({
      name: 'Mine',
      description: 'Banner',
      tags: '',
    });
  });
});

describe('flagFieldsBody', () => {
  it('reads the name, description and tags of a submitted form for Core', () => {
    const form = new FormData();
    form.set('name', ' Photo ID ');
    form.set('description', '');
    form.set('tags', 'beta, photos, beta');
    expect(flagFieldsBody(form)).toEqual({ name: 'Photo ID', description: '', tags: ['beta', 'photos'] });
  });

  it('reads absent fields as empty', () => {
    expect(flagFieldsBody(new FormData())).toEqual({ name: '', description: '', tags: [] });
  });
});
