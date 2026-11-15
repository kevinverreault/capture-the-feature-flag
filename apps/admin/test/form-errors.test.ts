import { CoreApiError } from '@ctff/core-api-client';
import { describe, expect, it } from 'vitest';
import { formErrors } from '../src/lib/form-errors.js';

describe('formErrors', () => {
  it('puts each validation message on the field it names', () => {
    const error = new CoreApiError(400, [
      'project key must be lowercase kebab-case (e.g. rare-bird-alerts)',
      'name must not be blank',
    ]);
    expect(formErrors(error, ['key', 'name'])).toEqual({
      fields: {
        key: 'project key must be lowercase kebab-case (e.g. rare-bird-alerts)',
        name: 'name must not be blank',
      },
      form: [],
    });
  });

  it('keeps the first message when a field has several', () => {
    const error = new CoreApiError(400, ['name must not be blank', 'name must be a string']);
    expect(formErrors(error, ['name']).fields).toEqual({ name: 'name must not be blank' });
  });

  it('shows messages about no listed field on the whole form', () => {
    const error = new CoreApiError(400, ['property color should not exist', 'name must not be blank']);
    expect(formErrors(error, ['key', 'name'])).toEqual({
      fields: { name: 'name must not be blank' },
      form: ['property color should not exist'],
    });
  });

  it('does not take a word inside the message for the field', () => {
    const error = new CoreApiError(400, ['SDK key is immutable and cannot be changed']);
    expect(formErrors(error, ['name'])).toEqual({ fields: {}, form: ['SDK key is immutable and cannot be changed'] });
  });

  it('puts a conflict on the field given for it', () => {
    const error = new CoreApiError(409, ['Project birdwatch already exists']);
    expect(formErrors(error, ['key', 'name'], { conflictField: 'key' })).toEqual({
      fields: { key: 'Project birdwatch already exists' },
      form: [],
    });
  });

  it('shows any other error response on the whole form', () => {
    const error = new CoreApiError(404, ['Project birdwatch not found']);
    expect(formErrors(error, ['key'], { conflictField: 'key' })).toEqual({
      fields: {},
      form: ['Project birdwatch not found'],
    });
  });

  it('rethrows anything that is not an error response from Core', () => {
    const failure = new TypeError('fetch failed');
    expect(() => formErrors(failure, ['key'])).toThrow(failure);
  });
});
