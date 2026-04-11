import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as cache from '../src/mdh/cache.js';

beforeEach(() => {
  cache.invalidateAll();
  cache.unpin();
  vi.useRealTimers();
});

describe('MDH cache', () => {
  it('stores and retrieves values', () => {
    cache.set('col1', 'records', [{ id: 1 }]);
    expect(cache.get('col1', 'records')).toEqual([{ id: 1 }]);
  });

  it('returns null for missing entries', () => {
    expect(cache.get('nonexistent', 'field')).toBeNull();
    cache.set('col1', 'records', []);
    expect(cache.get('col1', 'missing')).toBeNull();
  });

  it('expires entries after TTL (60s)', () => {
    vi.useFakeTimers();
    cache.set('col1', 'records', 'data');

    vi.advanceTimersByTime(59_000);
    expect(cache.get('col1', 'records')).toBe('data');

    vi.advanceTimersByTime(2_000);
    expect(cache.get('col1', 'records')).toBeNull();
  });

  it('pinned collection bypasses TTL', () => {
    vi.useFakeTimers();
    cache.pin('col1');
    cache.set('col1', 'records', 'pinned-data');

    vi.advanceTimersByTime(120_000);
    expect(cache.get('col1', 'records')).toBe('pinned-data');
  });

  it('evicts LRU entries beyond 200 collections', () => {
    for (let i = 0; i < 201; i++) {
      cache.set(`col_${i}`, 'data', i);
    }
    expect(cache.get('col_0', 'data')).toBeNull();
    expect(cache.get('col_200', 'data')).toBe(200);
  });

  it('does not evict pinned collection', () => {
    cache.pin('col_0');
    for (let i = 0; i < 201; i++) {
      cache.set(`col_${i}`, 'data', i);
    }
    expect(cache.get('col_0', 'data')).toBe(0);
  });

  it('invalidateData preserves index caches', () => {
    cache.set('col1', 'records', 'data');
    cache.set('col1', 'totalCount', 42);
    cache.set('col1', 'indexes', ['idx1']);
    cache.set('col1', 'searchIndexes', ['sidx1']);

    cache.invalidateData('col1');

    expect(cache.get('col1', 'records')).toBeNull();
    expect(cache.get('col1', 'totalCount')).toBeNull();
    expect(cache.get('col1', 'indexes')).toEqual(['idx1']);
    expect(cache.get('col1', 'searchIndexes')).toEqual(['sidx1']);
  });

  it('invalidate removes specific field or entire collection', () => {
    cache.set('col1', 'a', 1);
    cache.set('col1', 'b', 2);

    cache.invalidate('col1', 'a');
    expect(cache.get('col1', 'a')).toBeNull();
    expect(cache.get('col1', 'b')).toBe(2);

    cache.invalidate('col1');
    expect(cache.get('col1', 'b')).toBeNull();
  });

  it('reports stats', () => {
    cache.set('col1', 'a', 1);
    cache.set('col1', 'b', 2);
    cache.set('col2', 'c', 3);

    const s = cache.stats('col1');
    expect(s.fieldCount).toBe(3);
    expect(s.age).toBeTypeOf('number');
    expect(s.age).toBeLessThanOrEqual(100);
  });
});
