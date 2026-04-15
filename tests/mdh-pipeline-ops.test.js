import { describe, it, expect } from 'vitest';
import {
  applySortToPipeline,
  applyFilterDeltaToPipeline,
  applySkipToPipeline,
  extractUIStateFromPipeline,
} from '../src/mdh/pipelineOps.js';

describe('applySortToPipeline', () => {
  it('replaces an existing $sort with the new spec', () => {
    const p = [{ $match: {} }, { $sort: { foo: 1 } }, { $skip: 0 }];
    applySortToPipeline(p, { bar: -1 });
    expect(p).toEqual([{ $match: {} }, { $sort: { bar: -1 } }, { $skip: 0 }]);
  });

  it('inserts $sort immediately after $match when absent', () => {
    const p = [{ $match: { x: 1 } }, { $skip: 0 }, { $limit: 50 }];
    applySortToPipeline(p, { foo: -1 });
    expect(p).toEqual([
      { $match: { x: 1 } },
      { $sort: { foo: -1 } },
      { $skip: 0 },
      { $limit: 50 },
    ]);
  });

  it('inserts $sort before $skip/$limit when no $match exists', () => {
    const p = [{ $skip: 0 }, { $limit: 50 }];
    applySortToPipeline(p, { foo: 1 });
    expect(p).toEqual([{ $sort: { foo: 1 } }, { $skip: 0 }, { $limit: 50 }]);
  });

  it('appends $sort when the pipeline is empty', () => {
    const p = [];
    applySortToPipeline(p, { foo: 1 });
    expect(p).toEqual([{ $sort: { foo: 1 } }]);
  });

  it('removes $sort when sortSpec is empty', () => {
    const p = [{ $match: {} }, { $sort: { foo: 1 } }, { $skip: 0 }];
    applySortToPipeline(p, {});
    expect(p).toEqual([{ $match: {} }, { $skip: 0 }]);
  });

  it('preserves user-written $match with placeholders when adding sort', () => {
    const p = [
      { $match: { 'id.erpAcct': 'LYNN', 'id.poId': '{order_id}', 'id.erpName': 'TRILOGIE' } },
      { $skip: 0 },
      { $limit: 50 },
    ];
    applySortToPipeline(p, { amount: -1 });
    expect(p).toEqual([
      { $match: { 'id.erpAcct': 'LYNN', 'id.poId': '{order_id}', 'id.erpName': 'TRILOGIE' } },
      { $sort: { amount: -1 } },
      { $skip: 0 },
      { $limit: 50 },
    ]);
  });

  it('places $sort after the last $match when multiple are present', () => {
    const p = [{ $match: { a: 1 } }, { $project: { x: 1 } }, { $match: { b: 2 } }, { $limit: 10 }];
    applySortToPipeline(p, { x: 1 });
    expect(p).toEqual([
      { $match: { a: 1 } },
      { $project: { x: 1 } },
      { $match: { b: 2 } },
      { $sort: { x: 1 } },
      { $limit: 10 },
    ]);
  });
});

describe('applyFilterDeltaToPipeline', () => {
  it('merges a new filter key into the existing $match', () => {
    const p = [{ $match: { existing: 'x' } }];
    applyFilterDeltaToPipeline(p, 'newKey', 'y', true);
    expect(p).toEqual([{ $match: { existing: 'x', newKey: 'y' } }]);
  });

  it('removes only the specified key from $match when deactivated', () => {
    const p = [{ $match: { keep: 'x', drop: 'y' } }];
    applyFilterDeltaToPipeline(p, 'drop', 'y', false);
    expect(p).toEqual([{ $match: { keep: 'x' } }]);
  });

  it('creates a new $match at the top when activating with no $match present', () => {
    const p = [{ $skip: 0 }, { $limit: 50 }];
    applyFilterDeltaToPipeline(p, 'foo', 'bar', true);
    expect(p).toEqual([{ $match: { foo: 'bar' } }, { $skip: 0 }, { $limit: 50 }]);
  });

  it('does nothing when deactivating a key that is not in $match', () => {
    const p = [{ $match: { a: 1 } }];
    applyFilterDeltaToPipeline(p, 'missing', 'x', false);
    expect(p).toEqual([{ $match: { a: 1 } }]);
  });
});

describe('applySkipToPipeline', () => {
  it('updates an existing $skip value', () => {
    const p = [{ $match: {} }, { $skip: 0 }, { $limit: 50 }];
    applySkipToPipeline(p, 100);
    expect(p).toEqual([{ $match: {} }, { $skip: 100 }, { $limit: 50 }]);
  });

  it('inserts $skip before $limit when absent', () => {
    const p = [{ $match: {} }, { $limit: 50 }];
    applySkipToPipeline(p, 25);
    expect(p).toEqual([{ $match: {} }, { $skip: 25 }, { $limit: 50 }]);
  });

  it('appends $skip when no $limit exists', () => {
    const p = [{ $match: {} }];
    applySkipToPipeline(p, 50);
    expect(p).toEqual([{ $match: {} }, { $skip: 50 }]);
  });
});

describe('extractUIStateFromPipeline', () => {
  it('returns empty state for a pipeline with neither $sort nor $match', () => {
    expect(extractUIStateFromPipeline([{ $limit: 10 }])).toEqual({ sorts: {}, filters: {} });
  });

  it('extracts multi-key $sort verbatim', () => {
    const p = [{ $sort: { name: 1, age: -1 } }];
    expect(extractUIStateFromPipeline(p)).toEqual({ sorts: { name: 1, age: -1 }, filters: {} });
  });

  it('ignores $sort entries with non ±1 values', () => {
    const p = [{ $sort: { name: 1, weird: 5 } }];
    expect(extractUIStateFromPipeline(p).sorts).toEqual({ name: 1 });
  });

  it('extracts primitive-valued $match entries into filters', () => {
    const p = [{ $match: { status: 'active', count: 5, flag: true, nothing: null } }];
    expect(extractUIStateFromPipeline(p).filters).toEqual({
      status: 'active', count: 5, flag: true, nothing: null,
    });
  });

  it('skips operator-valued $match entries (e.g., $gt)', () => {
    const p = [{ $match: { price: { $gt: 10 }, status: 'active' } }];
    expect(extractUIStateFromPipeline(p).filters).toEqual({ status: 'active' });
  });

  it('handles non-array input safely', () => {
    expect(extractUIStateFromPipeline(null)).toEqual({ sorts: {}, filters: {} });
    expect(extractUIStateFromPipeline({})).toEqual({ sorts: {}, filters: {} });
    expect(extractUIStateFromPipeline(undefined)).toEqual({ sorts: {}, filters: {} });
  });

  it('uses only the first $sort and the first $match when multiple exist', () => {
    const p = [
      { $match: { a: 1 } },
      { $sort: { x: 1 } },
      { $match: { b: 2 } },
      { $sort: { y: -1 } },
    ];
    const r = extractUIStateFromPipeline(p);
    expect(r.sorts).toEqual({ x: 1 });
    expect(r.filters).toEqual({ a: 1 });
  });

  it('recovers the bug-report scenario: manual $match survives as chips-equivalent filters', () => {
    const p = [
      { $match: { 'id.erpAcct': 'LYNN', 'id.poId': '{order_id}', 'id.erpName': 'TRILOGIE' } },
      { $sort: { amount: -1 } },
      { $skip: 0 },
      { $limit: 50 },
    ];
    expect(extractUIStateFromPipeline(p)).toEqual({
      sorts: { amount: -1 },
      filters: { 'id.erpAcct': 'LYNN', 'id.poId': '{order_id}', 'id.erpName': 'TRILOGIE' },
    });
  });
});
