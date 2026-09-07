// Pure helpers for the regular Indexes panel: copy-paste parity, diagnostics,
// and byte formatting. No dependencies — unit-tested in isolation.

// Fields from a listed MongoDB index that are NOT create options: `key`/`name`
// are passed separately (as keys/indexName), and `v`/`ns`/`*IndexVersion` are
// output-only/server-set and would be rejected or ignored on create.
const OUTPUT_ONLY = new Set(['key', 'name', 'v', 'ns', 'textIndexVersion', '2dsphereIndexVersion']);

// Convert a listed index (standard MongoDB `listIndexes` shape — `{ v, key,
// name, ...options }`) into the flat shape the Create Index modal parses and
// api.createIndex sends: `{ indexName, keys, options? }`. Option siblings are
// gathered under `options`; `options` is omitted when empty so a plain index
// copies clean. (Search indexes no longer need an equivalent: MDH V2 hands back a
// definition that is already valid input — see searchIndexDef.toSearchIndexDefinition.)
export function toCreateIndexDefinition(idx: any): Record<string, any> | null {
  if (!idx || typeof idx !== 'object') return idx;
  const options: Record<string, any> = {};
  for (const k of Object.keys(idx)) {
    if (!OUTPUT_ONLY.has(k)) options[k] = idx[k];
  }
  const out: Record<string, any> = { indexName: idx.name, keys: textCreateKeys(idx) ?? idx.key };
  if (Object.keys(options).length > 0) out.options = options;
  return out;
}

// A TEXT index's `key` is the internal `{ _fts: 'text', _ftsx: 1 }` — the real
// fields live in `weights`. Rebuild the create-spec key (`{ field: 'text' }`,
// preserving any non-text compound components and their order) so the copied
// definition actually recreates the index. Returns null for non-text indexes.
function textCreateKeys(idx: any): Record<string, any> | null {
  const key = idx.key;
  if (!key || typeof key !== 'object') return null;
  if (!('_fts' in key) && !('_ftsx' in key)) return null;
  if (!idx.weights || typeof idx.weights !== 'object') return null;
  const rebuilt: Record<string, any> = {};
  for (const [k, v] of Object.entries(key)) {
    if (k === '_ftsx') continue;
    if (k === '_fts') {
      for (const field of Object.keys(idx.weights)) rebuilt[field] = 'text';
    } else rebuilt[k] = v;
  }
  return rebuilt;
}

// Classify an index from its key spec. Returns one of
// single | compound | text | hashed | 2dsphere | 2d | wildcard, or null.
export function classifyIndexType(key: any): string | null {
  if (!key || typeof key !== 'object') return null;
  const names = Object.keys(key);
  if (names.some((n) => n.includes('$**'))) return 'wildcard';
  const vals = names.map((n) => key[n]);
  if (vals.includes('text')) return 'text';
  if (vals.includes('2dsphere')) return '2dsphere';
  if (vals.includes('2d')) return '2d';
  if (vals.includes('hashed')) return 'hashed';
  return names.length > 1 ? 'compound' : 'single';
}

// Option fields whose presence makes an index NOT safely redundant — dropping
// such an index could silently remove a constraint or change semantics. Split
// by shape: the booleans are tested for TRUTHINESS because `indexes/list` echoes
// `sparse: false` back for an index created with it (measured 2026-09-01), and
// an explicit `false` is not a constraint. The value-carrying ones are tested
// for presence, because `expireAfterSeconds: 0` is a legitimate TTL index.
const BOOLEAN_CONSTRAINTS = ['unique', 'sparse', 'hidden'];
const VALUE_CONSTRAINTS = ['expireAfterSeconds', 'partialFilterExpression', 'collation'];

function isPlain(i: any): boolean {
  return (
    BOOLEAN_CONSTRAINTS.every((c) => !i[c]) && VALUE_CONSTRAINTS.every((c) => i[c] === undefined)
  );
}

function isWildcard(i: any): boolean {
  return Object.keys(i.key || {}).some((n) => n.includes('$**'));
}

// Deliberately narrower than isWildcard, and used only to decide what COVERS
// other indexes (isWildcard stays broad and is used only to SKIP — an index
// with any `$**` key is never itself flagged, which is the conservative
// direction there). A subpath wildcard (`{"a.$**": 1}`) indexes only paths
// under `a`, and a compound wildcard with a prefix field
// (`{"tenant": 1, "$**": 1}`) only serves queries with equality on that
// prefix — neither covers an unrelated field the way a plain `{"$**": 1}`
// does. A `wildcardProjection` narrows the same way: `{"$**": 1,
// wildcardProjection: {a: 1}}` indexes only `a`, not every scalar path, so it
// is excluded here too even though the key spec alone looks like a full
// wildcard. Do not merge this back into isWildcard: a false positive here
// badges a genuinely load-bearing index as droppable.
//
// Only the key-SHAPE half of "does this cover every field" — see
// coveringWildcardIndex below for the whole answer, options included.
export function isFullWildcard(i: any): boolean {
  const keys = Object.keys(i.key || {});
  return keys.length === 1 && keys[0] === '$**' && i.wildcardProjection === undefined;
}

// A superset only truly covers another index's queries if it indexes the same
// document set under the same collation and is visible to the planner.
// partial/sparse index a strict subset of docs; collation restricts which
// queries it serves; hidden indexes serve none. (A `unique` superset is fine
// — uniqueness doesn't restrict read coverage.)
function coversFully(b: any): boolean {
  return (
    b.partialFilterExpression === undefined && !b.sparse && b.collation === undefined && !b.hidden
  );
}

// THE single answer to "does this collection have a wildcard index that
// genuinely covers every field?" — full key shape and no wildcardProjection
// (isFullWildcard), AND not partial/sparse/collated/hidden (coversFully),
// since any of those restrict which documents or queries it actually serves.
// Returns the covering index, or null.
//
// Three call sites used to each re-derive half of this question by hand
// (redundantIndexNames combined isFullWildcard+coversFully inline;
// collectionIndexSummary and IndexPanel used a bare isFullWildcard, ignoring
// options entirely) and disagreed on a `hidden: true` wildcard — redundancy
// correctly found nothing, while the summary still claimed full coverage and
// the panel withheld a preset that was actually still useful. Call sites
// MUST use this rather than re-deriving it. `isWildcard` stays
// module-private on purpose: exporting it alongside this one would invite a
// call site to pick the broad, wrong predicate for a coverage question.
export function coveringWildcardIndex(indexes: any[]): any | null {
  const objs = (indexes || []).filter((i) => i && typeof i === 'object' && i.key);
  return objs.find((i) => isFullWildcard(i) && coversFully(i)) ?? null;
}

// Indexes the service manages, which say nothing about what a user has done.
// `__dynamic_index` is a wildcard index and `__digest_md5_idx` backs change
// detection; both appear on some collections and not others, with no visible
// reason (measured 2026-09-01 — the trigger was not established). Matched by
// exact name, not prefix: an unrecognised `__`-prefixed index is treated as a
// user index everywhere this set is consulted — the safe direction, since it
// may then be flagged or counted, never silently protected or hidden.
const SYSTEM_INDEX_NAMES = new Set(['_id_', '__dynamic_index', '__digest_md5_idx']);

// Names of indexes that are conservatively redundant: a plain index (no
// constraint options, never service-managed) whose key spec — field AND
// direction — is a strict prefix of another index's. A compound superset
// fully serves the prefix index's queries, so dropping the plain prefix loses
// nothing.
export function redundantIndexNames(indexes: any[]): Set<string> {
  const objs = (indexes || []).filter((i) => i && typeof i === 'object' && i.key);
  const sig = (i: any) => Object.entries(i.key).map(([k, v]) => `${k}:${v}`);
  // A FULL wildcard index indexes every scalar path individually, so it
  // covers any plain SINGLE-field index. It covers nothing else: it serves
  // one field per plan (measured — a real query IXSCANned one predicate and
  // FETCH-filtered the other), and it can neither enforce uniqueness nor
  // expire nor index a subset.
  const coveringWildcard = coveringWildcardIndex(objs);
  const out = new Set<string>();
  for (const a of objs) {
    // Every service-managed index is skipped by name, not only `_id_` — a
    // plain single-field index like `__digest_md5_idx` (which backs MDH's
    // differential-sync change detection) would otherwise be flagged
    // redundant the moment a covering wildcard is present, inviting Drop on
    // an index the service itself relies on. isWildcard/`!isPlain` alone
    // don't catch it: it is plain and non-wildcard by key shape.
    if (SYSTEM_INDEX_NAMES.has(a.name) || isWildcard(a) || !isPlain(a)) continue;
    const as = sig(a);
    if (coveringWildcard && as.length === 1) {
      out.add(a.name);
      continue;
    }
    const isPrefixOfCoveringSuperset = objs.some((b) => {
      if (b === a || !coversFully(b)) return false;
      const bs = sig(b);
      return bs.length > as.length && as.every((seg, i) => seg === bs[i]);
    });
    if (isPrefixOfCoveringSuperset) out.add(a.name);
  }
  return out;
}

// The question the panel has never answered: what does this collection already
// have? Returns '' when there is nothing worth saying. Both messages are
// statements of fact read off the index list, not advice.
export function collectionIndexSummary(indexes: any[]): string {
  const objs = (indexes || []).filter((i) => i && typeof i === 'object' && i.key);
  if (!objs.length) return '';
  if (coveringWildcardIndex(objs)) {
    return 'Every field is already indexed individually. A single-field index adds nothing here; compound keys, uniqueness, TTL and sorts still need their own.';
  }
  // A broad-but-not-full wildcard (a subpath like `{"a.$**": 1}`, or a
  // compound wildcard with a prefix field) is a real index, but not one we can
  // characterize here — it neither covers every field (so "already indexed"
  // would be false) nor leaves the collection unindexed (so "full scan" would
  // be false too). This has only ever been observed as a full wildcard live,
  // but the sentence below is a claim of fact about someone's production
  // data, and staying silent is the honest answer when we cannot tell.
  if (objs.some(isWildcard)) return '';
  const userIndexes = objs.filter((i) => !SYSTEM_INDEX_NAMES.has(i.name));
  if (userIndexes.length === 0) {
    return 'No index but _id_ — every query on this collection is a full scan.';
  }
  return '';
}

// Human-readable byte size. '' for null/NaN/Infinity.
export function formatBytes(n?: number | null): string {
  if (n == null || !isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
