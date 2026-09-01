import { describe, it, expect } from 'vitest';
import { indexedPaths, checkPipeline } from '../src/mdh/searchIndexCheck.js';

describe('indexedPaths', () => {
  it('lists the explicitly mapped fields', () => {
    expect(indexedPaths({ mappings: { dynamic: false, fields: { a: {}, b: {} } } })).toEqual([
      'a',
      'b',
    ]);
  });

  // A dynamic index names no fields, so there is nothing to offer and the caller
  // has to ask. It must not guess, and it must not emit a wildcard path — that
  // syntax is unverified against this deployment.
  it('returns nothing for a purely dynamic mapping', () => {
    expect(indexedPaths({ mappings: { dynamic: true } })).toEqual([]);
  });

  it('returns nothing rather than throwing on junk', () => {
    expect(indexedPaths(null)).toEqual([]);
    expect(indexedPaths({ mappings: 'nope' })).toEqual([]);
    expect(indexedPaths({ mappings: { fields: [] } })).toEqual([]);
  });
});

describe('checkPipeline', () => {
  it('is exactly search, limit and addFields', () => {
    const p = checkPipeline('idx', ['name'], 'acme');
    expect(p.map((s) => Object.keys(s)[0])).toEqual(['$search', '$limit', '$addFields']);
  });

  // $project with {_id: 0, score: …} is an INCLUSION projection: it would return
  // the score and drop every field of the matched record — the one thing the
  // reader needs. $addFields keeps the record and attaches the score.
  it('keeps the matched record and attaches the score', () => {
    const p = checkPipeline('idx', ['name'], 'acme');
    expect(p[2].$addFields).toEqual({ score: { $meta: 'searchScore' } });
  });

  it('uses the measured fuzzy settings', () => {
    expect(checkPipeline('idx', ['name'], 'acme')[0].$search.text.fuzzy).toEqual({
      maxEdits: 1,
      prefixLength: 1,
    });
  });

  // The only user input is the query string. A value that looks like a stage must
  // stay a string, or Check becomes a way to run arbitrary pipeline stages.
  it('keeps a stage-shaped value as a plain string', () => {
    const p = checkPipeline('idx', ['name'], '{"$where": "1"}');
    expect(p).toHaveLength(3);
    expect(p[0].$search.text.query).toBe('{"$where": "1"}');
  });

  it('coerces a missing value to an empty string rather than emitting undefined', () => {
    expect(checkPipeline('idx', ['name'], undefined as any)[0].$search.text.query).toBe('');
  });
});
