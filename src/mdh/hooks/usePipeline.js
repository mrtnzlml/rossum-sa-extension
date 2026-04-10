import { useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { skip } from '../store.js';

const PLACEHOLDER_RE = /\{(\w+)\}/g;

export function usePipeline() {
  const stateRef = useRef(null);
  if (!stateRef.current) {
    stateRef.current = {
      sortState: signal({}),
      filterState: signal({}),
      placeholderValues: signal({}),
      suppressSync: signal(false),
    };
  }
  const { sortState, filterState, placeholderValues, suppressSync } = stateRef.current;

  function buildPipelineFromUI() {
    const pipeline = [];
    const filters = filterState.value;
    const match = Object.keys(filters).length > 0 ? { ...filters } : {};
    pipeline.push({ $match: match });
    const sorts = sortState.value;
    if (Object.keys(sorts).length > 0) pipeline.push({ $sort: { ...sorts } });
    pipeline.push({ $skip: skip.value });
    return pipeline;
  }

  function toggleSort(field) {
    const current = { ...sortState.value };
    if (!current[field]) current[field] = 1;
    else if (current[field] === 1) current[field] = -1;
    else delete current[field];
    sortState.value = current;
    skip.value = 0;
  }

  function toggleFilter(field, value) {
    const current = { ...filterState.value };
    if (field in current) delete current[field];
    else current[field] = value;
    filterState.value = current;
    skip.value = 0;
  }

  function isFiltered(field) {
    return field in filterState.value;
  }

  function sortIndicator(field) {
    const s = sortState.value[field];
    if (s === 1) return ' \u2191';
    if (s === -1) return ' \u2193';
    return '';
  }

  function extractPlaceholders(text) {
    const names = new Set();
    for (const match of text.matchAll(PLACEHOLDER_RE)) {
      names.add(match[1]);
    }
    return [...names];
  }

  function substitutePlaceholders(text) {
    return text.replace(PLACEHOLDER_RE, (match, name) => {
      if (!(name in placeholderValues.value)) return match;
      const val = placeholderValues.value[name];
      if (val === 'true' || val === 'false' || val === 'null') return val;
      if (val !== '' && !isNaN(Number(val))) return val;
      return val;
    });
  }

  function setPlaceholder(name, value) {
    placeholderValues.value = { ...placeholderValues.value, [name]: value };
  }

  function reset() {
    sortState.value = {};
    filterState.value = {};
    placeholderValues.value = {};
    skip.value = 0;
  }

  return {
    sortState,
    filterState,
    placeholderValues,
    suppressSync,
    buildPipelineFromUI,
    toggleSort,
    toggleFilter,
    isFiltered,
    sortIndicator,
    extractPlaceholders,
    substitutePlaceholders,
    setPlaceholder,
    reset,
  };
}
