// Pure query helpers for MDH V2 search indexes. Shared by the Create/Edit modal's
// query snippet and the card's Check strip. No requests: the caller runs the
// pipeline through api.aggregate.

// The keys of mappings.fields, or [] for a dynamic index that names none. No
// casing work is needed here — `mappings` and `fields` are the same word in both
// of V2's casings; only search_analyzer differs, and this never reads it.
export function indexedPaths(definition: any): string[] {
  const mappings = definition && typeof definition === 'object' ? definition.mappings : null;
  if (!mappings || typeof mappings !== 'object') return [];
  const fields = mappings.fields;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return [];
  return Object.keys(fields);
}

const CHECK_LIMIT = 5;

// One read-only probe of a single index. Assembled here from the index's own
// definition: no stage ever comes from user text, and the only user input is the
// query string. Callers must not run this below READY — a $search against a
// building index returns [] with code "ok", which is indistinguishable from a
// genuine miss (verified live 2026-08-31).
export function checkPipeline(indexName: string, paths: string[], value: string): any[] {
  const list = (paths || []).filter((p) => typeof p === 'string' && p.trim() !== '');
  return [
    {
      $search: {
        index: indexName,
        text: {
          query: String(value ?? ''),
          path: list.length === 1 ? list[0] : list,
          fuzzy: { maxEdits: 1, prefixLength: 1 },
        },
      },
    },
    { $limit: CHECK_LIMIT },
    { $addFields: { score: { $meta: 'searchScore' } } },
  ];
}
