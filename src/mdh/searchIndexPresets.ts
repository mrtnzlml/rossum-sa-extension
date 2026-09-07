// Pure preset builders for MDH V2 search-index definitions. No requests, no DOM:
// the modal calls these and writes the result into the JSON editor, which stays
// the only thing submitted. Every fact below was probed live on 2026-08-31 —
// see docs/superpowers/specs/2026-08-31-mdh-fuzzy-index-builder-design.md §2.

const HOUSE_ANALYZER = 'default_whitespace_lowercase';
const FOLDED_ANALYZER = 'whitespace_lowercase_folded';

// The char mapping the Rossum house analyzer carries. It is why AC-1001, AC 1001
// and AC.1001 match each other. Rebuilt per call: a preset's output goes straight
// into an editable buffer, so two calls must never share a nested object.
function houseCharFilters() {
  return [{ type: 'mapping', mappings: { '.': ' ', '/': '', '\\': '', '-': ' ', ',': ' ' } }];
}

// Surfaced in the UI as "Whole-word match", NOT "Exact match": this analyzer
// lowercases and rewrites `.`, `-`, `,` to spaces while dropping `/` and `\\`, so
// "AC-1001", "AC 1001" and "ac.1001" all match each other. Calling it exact would
// promise a precision it does not have, and would collide with the fuzzy preset's
// "also match by exact value or regex" option, which is a genuinely exact keyword
// alternate. What it really does is match whole words after that normalisation —
// no edit distance, no accent folding.
//
// Read verbatim off the `default` index that collections/create makes. This is the
// one preset that copies something the engine built and marked READY rather than
// constructing it — and the reason it exists is that the editor's previous seed,
// {"mappings":{"dynamic":true}}, is a PLAIN dynamic index on lucene.standard.
// Recreating a dropped `default` from that seed changed matching with no warning.
export function defaultPreset(): Record<string, any> {
  return {
    mappings: { dynamic: true },
    analyzer: HOUSE_ANALYZER,
    searchAnalyzer: HOUSE_ANALYZER,
    analyzers: [
      {
        name: HOUSE_ANALYZER,
        tokenizer: { type: 'whitespace' },
        tokenFilters: [{ type: 'lowercase' }],
        charFilters: houseCharFilters(),
      },
    ],
  };
}

// The minimal valid definition, and what the Create modal opens on. Verified
// live 2026-09-01: PUT with nothing but this reaches `status: READY`,
// `queryable: true`, and the definition round-trips back byte-identical — the
// engine adds no analyzer keys of its own. It is also the exact seed this modal
// shipped with before presets existed, so the untouched Create path builds what
// it always built.
//
// Note what it is NOT: without an `analyzers` block the index runs on Atlas's
// `lucene.standard`, not the house `default_whitespace_lowercase` that
// `collections/create` puts on its own `default` index. Use `defaultPreset()`
// when the point is to reproduce that index; the two are not interchangeable as
// DEFINITIONS, even though no behavioural difference between them has been
// measured (two experiments found them equivalent: 9/10 vs 9/10, then 2/8 vs 2/8).
export function customPreset(): Record<string, any> {
  return { mappings: { dynamic: true } };
}

export type FuzzyOptions = { exactAlternate?: boolean };

function usablePaths(fields: string[]): string[] {
  return (fields || []).filter((f) => typeof f === 'string' && f.trim() !== '');
}

// The house analyzer plus icuFolding. Measured on eight single-token diacritic
// queries: house 2/8, lucene.standard 2/8, this 7/8 — and 8/8 once the QUERY drops
// to prefixLength 1, which is why searchSnippet exists. No top-level analyzer or
// searchAnalyzer: the per-field analyzer analyzes the query too, verified in both
// directions (ASCII query against accented data, and the reverse).
export function fuzzyPreset(
  fields: string[],
  { exactAlternate = false }: FuzzyOptions = {},
): Record<string, any> {
  const paths = usablePaths(fields);
  const mappings: Record<string, any> = { dynamic: false };

  if (paths.length) {
    const out: Record<string, any> = {};
    for (const path of paths) {
      const field: Record<string, any> = { type: 'string', analyzer: FOLDED_ANALYZER };
      // A keyword alternate is addressed at QUERY time as
      // {"path": {"value": f, "multi": "exact"}} — never as "f.exact", which is an
      // HTTP 400 whose advice (allowAnalyzedField) answers wrongly instead of erroring.
      if (exactAlternate) field.multi = { exact: { type: 'string', analyzer: 'lucene.keyword' } };
      out[path] = field;
    }
    mappings.fields = out;
  }

  return {
    mappings,
    analyzers: [
      {
        name: FOLDED_ANALYZER,
        tokenizer: { type: 'whitespace' },
        tokenFilters: [{ type: 'lowercase' }, { type: 'icuFolding' }],
        charFilters: houseCharFilters(),
      },
    ],
  };
}
