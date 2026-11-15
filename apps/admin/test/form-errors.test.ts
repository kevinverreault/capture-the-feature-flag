import { CoreApiError } from '@ctff/core-api-client';
import { describe, expect, it } from 'vitest';
import { formErrors } from '../src/lib/form-errors.js';

/** A 400 as Core sends it: every message, and the same messages by property. */
function invalid(fields: Record<string, string[]>, unplaced: string[] = []): CoreApiError {
  return new CoreApiError(400, [...Object.values(fields).flat(), ...unplaced], fields);
}

describe('formErrors', () => {
  it('puts each validation message on the field Core names for it', () => {
    const error = invalid({ key: ['project key must be lowercase kebab-case'], name: ['name must not be blank'] });
    expect(formErrors(error, { fields: ['key', 'name'] })).toEqual({
      fields: { key: 'project key must be lowercase kebab-case', name: 'name must not be blank' },
      form: [],
    });
  });

  it('places a message whatever its wording', () => {
    const error = invalid({ name: ['Please give the project a name'] });
    expect(formErrors(error, { fields: ['name'] }).fields).toEqual({ name: 'Please give the project a name' });
  });

  it('keeps the first message when a field has several', () => {
    const error = invalid({ name: ['name must not be blank', 'name must be a string'] });
    expect(formErrors(error, { fields: ['name'] }).fields).toEqual({ name: 'name must not be blank' });
  });

  it('shows messages about fields the form does not have on the whole form', () => {
    const error = invalid({ color: ['property color should not exist'], name: ['name must not be blank'] });
    expect(formErrors(error, { fields: ['key', 'name'] })).toEqual({
      fields: { name: 'name must not be blank' },
      form: ['property color should not exist'],
    });
  });

  it('shows messages Core gives no property for on the whole form', () => {
    const error = invalid({}, ['The request body is not valid JSON']);
    expect(formErrors(error, { fields: ['name'] })).toEqual({
      fields: {},
      form: ['The request body is not valid JSON'],
    });
  });

  it('puts a conflict on the field given for it', () => {
    const error = new CoreApiError(409, ['Project birdwatch already exists']);
    expect(formErrors(error, { fields: ['key', 'name'], conflictField: 'key' })).toEqual({
      fields: { key: 'Project birdwatch already exists' },
      form: [],
    });
  });

  it('shows any other error response on the whole form', () => {
    const error = new CoreApiError(404, ['Project birdwatch not found']);
    expect(formErrors(error, { fields: ['key'], conflictField: 'key' })).toEqual({
      fields: {},
      form: ['Project birdwatch not found'],
    });
  });
});
