// Pure preset builders for regular MongoDB indexes. No requests, no DOM: the
// modal calls these and writes the result into the JSON editor, which stays the
// only thing submitted. Facts behind the choices are in
// docs/superpowers/specs/2026-09-01-mdh-regular-index-guidance-design.md §2.

export type IndexPresetId = 'custom' | 'lookup' | 'cascade' | 'unique' | 'expiring';

// No `indexName`: the modal carries the name in its own input, the way the
// search-index modal does, so a preset describes only the DEFINITION. Names are
// never auto-filled — a suggested name goes stale the moment the field
// selection changes, and a stale name is worse than an empty box.
export type IndexPreset = {
  keys: Record<string, number>;
  options?: Record<string, any>;
};

// The minimal definition the modal opens on — byte-identical to the template
// this panel shipped with before presets existed, so the untouched Create path
// behaves as it always did. `options: {}` is kept for that parity even though
// it is optional: verified live 2026-09-01 that `{indexName, keys}` alone is
// accepted and lists back with no option siblings.
//
// The field name is a placeholder, not a real path — submitting it unedited
// builds an index on a field called literally "field". That was true of the
// shipped template too; the picker exists to replace it.
export function customPreset(): IndexPreset {
  return { keys: { field: 1 }, options: {} };
}

function usable(fields: string[]): string[] {
  return (fields || []).filter((f) => typeof f === 'string' && f.trim() !== '');
}

function ascending(fields: string[]): Record<string, number> {
  const keys: Record<string, number> = {};
  for (const f of usable(fields)) keys[f] = 1;
  return keys;
}

// Single-field. Only worth creating on a collection with NO wildcard index —
// where one exists, every scalar path is already indexed and this adds nothing.
// The panel withholds this preset in that case rather than emitting a no-op.
export function lookupKeyPreset(fields: string[]): IndexPreset {
  return { keys: ascending(usable(fields).slice(0, 1)) };
}

// Compound, in the order the fields were picked. A wildcard index serves only
// ONE field per plan — measured, from a real query that IXSCANned one predicate
// and FETCH-filtered the rest — so a multi-predicate query is the case where a
// hand-made index genuinely earns its place. Ordering guidance is standard
// MongoDB doctrine and is NOT measured here; do not promise a speedup.
export function matchingCascadePreset(fields: string[]): IndexPreset {
  return { keys: ascending(fields) };
}

// `unique` is genuinely enforced by the service, not merely stored: a duplicate
// insert returns E11000 (verified 2026-09-01). A wildcard index cannot do this.
export function uniqueKeyPreset(fields: string[]): IndexPreset {
  return { keys: ascending(fields), options: { unique: true } };
}

// TTL. `expireAfterSeconds` round-trips through indexes/list unchanged
// (verified 2026-09-01). Zero is a legitimate value, so it is passed through
// rather than treated as absent.
export function expiringPreset(field: string, seconds: number): IndexPreset {
  return { keys: ascending([field]), options: { expireAfterSeconds: seconds } };
}

// Presets that build a single-field index. Kept beside the builders so the
// control's constraint and the truncation cannot drift apart: the picker is put
// into single-select for these, which makes the discarded-field state
// unreachable rather than merely explained.
const SINGLE_FIELD_PRESETS = new Set<IndexPresetId>(['lookup', 'expiring']);

export function isSingleFieldPreset(preset: IndexPresetId | null): boolean {
  return !!preset && SINGLE_FIELD_PRESETS.has(preset);
}

// The field row's label. Singular for the single-field presets, because a label
// reading "Fields, in query order" over a control that uses one field is the
// invitation that caused the confusion in the first place.
export function fieldRowLabel(preset: IndexPresetId | null): string {
  if (preset === 'expiring') return 'Date field to expire on';
  if (preset === 'lookup') return 'Field to index';
  return 'Fields, in query order';
}
