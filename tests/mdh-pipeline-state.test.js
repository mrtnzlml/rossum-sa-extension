import { describe, it, expect, beforeEach } from 'vitest';
import {
  savePipelineState,
  getPipelineState,
  clearPipelineState,
  clearAllPipelineState,
} from '../src/mdh/pipelineState.js';

beforeEach(() => {
  clearAllPipelineState();
});

describe('pipelineState', () => {
  it('returns null when nothing has been saved for the collection', () => {
    expect(getPipelineState('col1')).toBeNull();
  });

  it('returns null for a falsy collection name', () => {
    expect(getPipelineState(null)).toBeNull();
    expect(getPipelineState('')).toBeNull();
    expect(getPipelineState(undefined)).toBeNull();
  });

  it('round-trips a saved state for a single collection', () => {
    const state = { pipelineText: '[{"$match":{"x":1}}]', variables: { foo: 'bar' }, skip: 50 };
    savePipelineState('col1', state);
    expect(getPipelineState('col1')).toEqual(state);
  });

  it('keeps state for distinct collections separate', () => {
    savePipelineState('colA', { pipelineText: 'A', variables: {}, skip: 0 });
    savePipelineState('colB', { pipelineText: 'B', variables: {}, skip: 100 });
    expect(getPipelineState('colA').pipelineText).toBe('A');
    expect(getPipelineState('colB').pipelineText).toBe('B');
    expect(getPipelineState('colB').skip).toBe(100);
  });

  it('overwrites previously saved state for the same collection', () => {
    savePipelineState('col1', { pipelineText: 'first', variables: {}, skip: 0 });
    savePipelineState('col1', { pipelineText: 'second', variables: {}, skip: 0 });
    expect(getPipelineState('col1').pipelineText).toBe('second');
  });

  it('savePipelineState is a no-op for falsy collection name', () => {
    savePipelineState(null, { pipelineText: 'x', variables: {}, skip: 0 });
    savePipelineState('', { pipelineText: 'y', variables: {}, skip: 0 });
    expect(getPipelineState('null')).toBeNull();
    expect(getPipelineState('')).toBeNull();
  });

  it('clearPipelineState removes a single collection without touching others', () => {
    savePipelineState('colA', { pipelineText: 'A', variables: {}, skip: 0 });
    savePipelineState('colB', { pipelineText: 'B', variables: {}, skip: 0 });
    clearPipelineState('colA');
    expect(getPipelineState('colA')).toBeNull();
    expect(getPipelineState('colB').pipelineText).toBe('B');
  });

  it('clearAllPipelineState removes all entries', () => {
    savePipelineState('colA', { pipelineText: 'A', variables: {}, skip: 0 });
    savePipelineState('colB', { pipelineText: 'B', variables: {}, skip: 0 });
    clearAllPipelineState();
    expect(getPipelineState('colA')).toBeNull();
    expect(getPipelineState('colB')).toBeNull();
  });
});
