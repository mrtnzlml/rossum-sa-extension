# MDH Regular-Index Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Indexes panel say what a collection already has, stop suggesting indexes the hidden wildcard index already covers, and let an index be picked rather than hand-typed.

**Architecture:** Three additive changes over existing, already-pure code. `indexDef.ts` gains wildcard awareness and one new export (`collectionIndexSummary`); `IndexPanel.tsx` gains a summary line and a preset row reusing the components the search-index work shipped (`Segmented` with `tabs`, `MatchKeyPicker`, `discoverLeafPaths`). No transport change, no Check action — see spec §5 for why one cannot be built honestly.

**Tech Stack:** Preact + `@preact/signals`, TypeScript (strict, `erasableSyntaxOnly`), esbuild, Vitest + jsdom, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-09-01-mdh-regular-index-guidance-design.md`

## Global Constraints

- **Do NOT run `git commit`.** This repo commits once per run, and only when the owner names committing. Every task ends with `git add`.
- **Never leak customer data.** Fixtures use `acme` / `example` / `x` / `y` / `org` only. The spec deliberately states probe findings by shape and never reproduces the real field or collection names observed; keep it that way.
- **Prefer the design system over building in place.** Look in `src/ui/` first, then for an idiom already used here (`aria-pressed` is the toggle idiom). The preset row reuses `Segmented` from `src/mdh/components/ImportControls.tsx` with its `tabs` variant — the same one `ImportWizard`, `ExportWizard` and the search-index modal use. Do not hand-roll chips.
- **`tests/dead-code.test.ts` fails on an export nothing imports.** Every new export lands in the same task as its first consumer.
- **Copy must not claim a measured benefit.** Spec §2 lists what is *not* verified — notably that a compound index would improve the observed 420-documents-for-8-rows query, and equality-then-sort-then-range ordering. Preset help text may explain *why* order matters; it may not promise a speedup.
- **`erasableSyntaxOnly`** — no `enum`, `namespace`, or parameter properties.
- **Do not annotate contextually typed parameters** (an event handler reading `e.target` is the allowed exception).
- **No bare single-letter class names in JSX** — `minify: true` shortens CSS Module locals and collisions are silent.
- **`\uXXXX` does not work in JSX text or attribute values** — use `{'…'}` or an entity. It does work in ordinary JS strings.
- **Only these CSS custom properties exist** (verify in `src/console/console.css` rather than trusting any list): the `--bg-*`, `--text-*`, `--border`, and the `--accent`, `--success`, `--warning`, `--danger`, `--info` families. Do not introduce `color-mix()`.
- **Never wait on an async-loaded node with a fixed count of `await Promise.resolve()` ticks.** Use `vi.waitFor`, and assert INSIDE it — it only retries on a throw. Ten timing bugs of this family were found in the sibling plan.
- **Mutation-test every guard**: break what it protects, confirm the test fails, restore, confirm it passes. Put the evidence in your report.
- Verification for every task: `npm run typecheck && npm test && npm run format:check`. If `format:check` fails, run `npm run format` TWICE — Prettier 3.9.6 is not idempotent on `vi.fn().mockResolvedValue({…})`.
- **`tests/training-key-boundary.test.ts` reads `dist/`** — never run the suite while `npm run build` races it.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/mdh/indexDef.ts` | **Modify.** Wildcard-aware `redundantIndexNames`, corrected constraint test, new `collectionIndexSummary` (the system-index name set stays module-private — an exported one would have no consumer and fail the dead-code guard). |
| `src/mdh/indexPresets.ts` | **Create.** Pure `{indexName, keys, options}` builders. No requests, no DOM. |
| `src/mdh/components/IndexPanel.tsx` | **Modify.** Summary line under the toolbar; preset row and field picker in the Create modal. |
| `src/mdh/components/IndexBuilder.module.css` | **Create.** Layout for the summary line and preset/picker rows. |
| `tests/mdh-index-def.test.ts` | **Modify.** Redundancy and summary cases. |
| `tests/mdh-index-presets.test.ts` | **Create.** Pure preset tests. |
| `tests/mdh-index-panel.test.tsx` | **Modify.** Panel behaviour. |
| `CLAUDE.md` | **Modify.** Spec index entry, and the wildcard fact. |

---

### Task 1: Wildcard-aware redundancy, and the `plain()` correction

Extends a function `IndexPanel` already imports, so it adds no unconsumed export.

**Files:**
- Modify: `src/mdh/indexDef.ts` (`CONSTRAINTS`, `redundantIndexNames`, ~lines 59–95)
- Modify: `tests/mdh-index-def.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `redundantIndexNames(indexes: any[]): Set<string>` — same signature, more findings.

- [ ] **Step 1: Write the failing tests**

Append to `tests/mdh-index-def.test.ts`:

```ts
describe('redundantIndexNames — wildcard awareness', () => {
  const wildcard = { name: '__dynamic_index', key: { '$**': 1 } };

  // Every scalar path is already indexed individually, so a hand-made
  // single-field index adds nothing. Measured 2026-09-01: some collections
  // carry this index and some carry only _id_, and nothing on screen says which.
  it('flags a plain single-field index when a wildcard index is present', () => {
    const out = redundantIndexNames([wildcard, { name: 'by_code', key: { code: 1 } }]);
    expect(out.has('by_code')).toBe(true);
  });

  // A wildcard index serves ONE field per plan — measured, from a real cached
  // query that IXSCANned one predicate and FETCH-filtered the other at 420 docs
  // examined for 8 rows. So a compound index is never redundant against it.
  it('does not flag a compound index against a wildcard', () => {
    const out = redundantIndexNames([wildcard, { name: 'by_two', key: { a: 1, b: 1 } }]);
    expect(out.has('by_two')).toBe(false);
  });

  // Each constraint is a separate reason, so each gets its own case: a wildcard
  // index cannot enforce uniqueness, expire documents, or index a subset.
  it.each([
    ['unique', { unique: true }],
    ['TTL', { expireAfterSeconds: 3600 }],
    ['partial', { partialFilterExpression: { status: 'active' } }],
    ['sparse', { sparse: true }],
    ['collation', { collation: { locale: 'en' } }],
  ])('does not flag a %s single-field index against a wildcard', (_label, opts) => {
    const out = redundantIndexNames([wildcard, { name: 'constrained', key: { code: 1 }, ...opts }]);
    expect(out.has('constrained')).toBe(false);
  });

  it.each([
    ['partial', { partialFilterExpression: { status: 'active' } }],
    ['sparse', { sparse: true }],
    ['hidden', { hidden: true }],
  ])('does not flag against a %s wildcard — it does not cover everything', (_label, opts) => {
    const out = redundantIndexNames([
      { ...wildcard, ...opts },
      { name: 'by_code', key: { code: 1 } },
    ]);
    expect(out.has('by_code')).toBe(false);
  });

  it('never flags _id_', () => {
    const out = redundantIndexNames([wildcard, { name: '_id_', key: { _id: 1 } }]);
    expect(out.has('_id_')).toBe(false);
  });

  it('never flags the wildcard index itself', () => {
    const out = redundantIndexNames([wildcard, { name: 'by_code', key: { code: 1 } }]);
    expect(out.has('__dynamic_index')).toBe(false);
  });

  // Regression: the wildcard rule is ADDITIVE. Without a wildcard present the
  // existing prefix behaviour must be untouched.
  it('leaves the prefix rule unchanged when no wildcard is present', () => {
    const out = redundantIndexNames([
      { name: 'prefix', key: { a: 1 } },
      { name: 'superset', key: { a: 1, b: 1 } },
    ]);
    expect([...out]).toEqual(['prefix']);
  });
});

describe('redundantIndexNames — the sparse:false correction', () => {
  const wildcard = { name: '__dynamic_index', key: { '$**': 1 } };

  // indexes/list echoes `sparse: false` back for an index created with it
  // (measured 2026-09-01). `=== undefined` read that as a constraint, so the
  // index was silently skipped. Falsiness is the right test for the booleans.
  it('treats sparse:false as plain', () => {
    const out = redundantIndexNames([wildcard, { name: 'by_code', key: { code: 1 }, sparse: false }]);
    expect(out.has('by_code')).toBe(true);
  });

  it('still treats sparse:true as constrained', () => {
    const out = redundantIndexNames([wildcard, { name: 'by_code', key: { code: 1 }, sparse: true }]);
    expect(out.has('by_code')).toBe(false);
  });

  // The trap: falsiness must NOT be applied to the value-carrying options.
  // A TTL of 0 seconds is a legitimate TTL index and must stay constrained.
  it('treats expireAfterSeconds:0 as a real TTL constraint', () => {
    const out = redundantIndexNames([
      wildcard,
      { name: 'ttl_zero', key: { ts: 1 }, expireAfterSeconds: 0 },
    ]);
    expect(out.has('ttl_zero')).toBe(false);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run tests/mdh-index-def.test.ts`
Expected: the wildcard cases FAIL (`expected false to be true`) because the function has no notion of a wildcard index; `sparse:false` FAILS for the same reason plus the `=== undefined` test.

- [ ] **Step 3: Implement**

In `src/mdh/indexDef.ts`, replace the `CONSTRAINTS` block and the guards inside `redundantIndexNames`:

```ts
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
    BOOLEAN_CONSTRAINTS.every((c) => !i[c]) &&
    VALUE_CONSTRAINTS.every((c) => i[c] === undefined)
  );
}

function isWildcard(i: any): boolean {
  return Object.keys(i.key || {}).some((n) => n.includes('$**'));
}
```

Then inside `redundantIndexNames`, replace the local `plain` with `isPlain` and add the wildcard rule:

```ts
export function redundantIndexNames(indexes: any[]): Set<string> {
  const objs = (indexes || []).filter((i) => i && typeof i === 'object' && i.key);
  const sig = (i: any) => Object.entries(i.key).map(([k, v]) => `${k}:${v}`);
  const coversFully = (b: any) =>
    b.partialFilterExpression === undefined && !b.sparse && b.collation === undefined && !b.hidden;
  // A wildcard index indexes every scalar path individually, so it covers any
  // plain SINGLE-field index. It covers nothing else: it serves one field per
  // plan (measured — a real query IXSCANned one predicate and FETCH-filtered the
  // other), and it can neither enforce uniqueness nor expire nor index a subset.
  const coveringWildcard = objs.find((i) => isWildcard(i) && coversFully(i));
  const out = new Set<string>();
  for (const a of objs) {
    if (a.name === '_id_' || isWildcard(a) || !isPlain(a)) continue;
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
```

Delete the now-unused `CONSTRAINTS` const.

- [ ] **Step 4: Run and watch them pass**

Run: `npx vitest run tests/mdh-index-def.test.ts`
Expected: PASS, including all 18 pre-existing tests.

- [ ] **Step 5: Mutation-test the exclusions**

The value of this rule is entirely in what it refuses to flag. For each, break it, confirm the matching test fails, restore:

1. Remove `isWildcard(a)` from the skip condition → "never flags the wildcard index itself" must fail.
2. Change `as.length === 1` to `as.length >= 1` → "does not flag a compound index" must fail.
3. Change `isPlain` back to `=== undefined` for booleans → "treats sparse:false as plain" must fail.
4. Apply falsiness to `expireAfterSeconds` → "expireAfterSeconds:0" must fail.

Record each in your report. Restore after each and confirm `git diff` is empty at the end.

- [ ] **Step 6: Full verification and stage**

Run: `npm run typecheck && npm test && npm run format:check`

```bash
git add src/mdh/indexDef.ts tests/mdh-index-def.test.ts
```

Do **not** commit.

---

### Task 2: The collection summary line

**Files:**
- Modify: `src/mdh/indexDef.ts` (new export)
- Modify: `src/mdh/components/IndexPanel.tsx` (toolbar area, ~line 186)
- Create: `src/mdh/components/IndexBuilder.module.css`
- Modify: `tests/mdh-index-def.test.ts`, `tests/mdh-index-panel.test.tsx`

**Interfaces:**
- Consumes: `isWildcard` behaviour from Task 1 (internal; not exported).
- Produces: `collectionIndexSummary(indexes: any[]): string` in `src/mdh/indexDef.ts`.

- [ ] **Step 1: Write the failing pure tests**

Append to `tests/mdh-index-def.test.ts`:

```ts
describe('collectionIndexSummary', () => {
  const wildcard = { name: '__dynamic_index', key: { '$**': 1 } };

  it('says a single-field index adds nothing when a wildcard is present', () => {
    const s = collectionIndexSummary([{ name: '_id_', key: { _id: 1 } }, wildcard]);
    expect(s).toContain('Every field is already indexed');
    expect(s).toContain('compound');
  });

  // The actionable one: no index but _id_ means every query is a full scan,
  // and nothing on screen said so before this.
  it('warns when the collection has nothing but _id_', () => {
    const s = collectionIndexSummary([{ name: '_id_', key: { _id: 1 } }]);
    expect(s).toContain('full scan');
  });

  it('says neither when user indexes exist and no wildcard does', () => {
    const s = collectionIndexSummary([
      { name: '_id_', key: { _id: 1 } },
      { name: 'by_code', key: { code: 1 } },
    ]);
    expect(s).toBe('');
  });

  it('does not count a system digest index as a user index', () => {
    const s = collectionIndexSummary([
      { name: '_id_', key: { _id: 1 } },
      { name: '__digest_md5_idx', key: { __digest_md5: 1 } },
    ]);
    expect(s).toContain('full scan');
  });

  it('returns an empty string rather than throwing on junk', () => {
    expect(collectionIndexSummary(null as any)).toBe('');
    expect(collectionIndexSummary([null, 42] as any)).toBe('');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/mdh-index-def.test.ts -t "collectionIndexSummary"`
Expected: FAIL — `collectionIndexSummary is not a function`.

- [ ] **Step 3: Implement**

Append to `src/mdh/indexDef.ts`:

```ts
// Indexes the service manages, which say nothing about what a user has done.
// `__dynamic_index` is a wildcard index and `__digest_md5_idx` backs change
// detection; both appear on some collections and not others, with no visible
// reason (measured 2026-09-01 — the trigger was not established).
const SYSTEM_INDEX_NAMES = new Set(['_id_', '__dynamic_index', '__digest_md5_idx']);

// The question the panel has never answered: what does this collection already
// have? Returns '' when there is nothing worth saying. Both messages are
// statements of fact read off the index list, not advice.
export function collectionIndexSummary(indexes: any[]): string {
  const objs = (indexes || []).filter((i) => i && typeof i === 'object' && i.key);
  if (!objs.length) return '';
  const hasWildcard = objs.some((i) => Object.keys(i.key || {}).some((n) => n.includes('$**')));
  if (hasWildcard) {
    return 'Every field is already indexed individually. A single-field index adds nothing here; compound keys, uniqueness, TTL and sorts still need their own.';
  }
  const userIndexes = objs.filter((i) => !SYSTEM_INDEX_NAMES.has(i.name));
  if (userIndexes.length === 0) {
    return 'No index but _id_ — every query on this collection is a full scan.';
  }
  return '';
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run tests/mdh-index-def.test.ts`
Expected: PASS.

- [ ] **Step 5a: Make the JsonEditor stub a real buffer**

`tests/mdh-index-panel.test.tsx` currently stubs the editor with `setValue: () => {}` — a no-op —
and a hardcoded `getParsed: () => ({ indexName: 'new_idx', keys: { a: 1 } })`. A preset writes
through `setValue`, so as written the submit test below would assert against that fixed value no
matter what the preset produced: it would pass with the whole feature deleted.

Replace the mock factory's body so the stub holds what is written to it:

```tsx
vi.mock('../src/mdh/components/JsonEditor.jsx', () => ({
  default: ({ editorRef }: any) => {
    if (editorRef) {
      // useRef, NOT `let`: a plain binding in a function component body is
      // re-initialised on every render, so the buffer would discard whatever
      // setValue wrote as soon as a preset click re-rendered the modal.
      const bufRef = useRef('{"indexName":"new_idx","keys":{"a":1}}');
      editorRef.current = {
        isValid: () => {
          try {
            JSON.parse(bufRef.current);
            return true;
          } catch {
            return false;
          }
        },
        getParsed: () => JSON.parse(bufRef.current),
        getValue: () => bufRef.current,
        setValue: (v: string) => {
          bufRef.current = v;
        },
        getError: () => '',
        focus: () => {},
        refresh: () => {},
      };
    }
    return <div class="json-editor-stub" />;
  },
}));
```

Add `useRef` to the file's `preact/hooks` import. The default buffer keeps the pre-existing
create-flow tests passing unchanged — verify that before moving on.

- [ ] **Step 5b: Write the failing panel test**

The editor-write assertion needs to read the stub's buffer. The `JsonEditor` mock assigns
`editorRef.current`, so expose it from the mock factory with a module-level `let` the factory
writes to, and a helper the tests call:

```tsx
let lastEditorHandle: any = null;
function editorHandle() {
  return lastEditorHandle;
}
```

Assign `lastEditorHandle = editorRef.current;` inside the existing stub's `if (editorRef)` block.
This is test-only plumbing; it does not change the stub's behaviour.

Add to `tests/mdh-index-panel.test.tsx`. **Use `mount()`** — these two tests never open a modal,
and the file's `mountWithModal()` helper is only needed for the ones that do.

**Do not wait on `.index-list`.** It renders unconditionally from the first synchronous render,
before the mocked `listIndexes` promise resolves, so waiting on it proves nothing and the
absence-assertion below would pass against the pre-load empty state. Wait on something that only
exists after the load — the file already has a `cardByName(root, name)` helper that sibling tests
use for exactly this.

```tsx
describe('IndexPanel — collection summary', () => {
  it('warns when the collection has only _id_', async () => {
    vi.mocked(api.listIndexes).mockResolvedValue({ result: [{ name: '_id_', key: { _id: 1 } }] });
    const root = mount();
    await vi.waitFor(() => expect(cardByName(root, '_id_')).toBeTruthy());
    expect(root.querySelector('[data-testid="index-summary"]')!.textContent).toContain('full scan');
  });

  it('renders no summary when there is nothing to say', async () => {
    vi.mocked(api.listIndexes).mockResolvedValue({
      result: [
        { name: '_id_', key: { _id: 1 } },
        { name: 'by_code', key: { code: 1 } },
      ],
    });
    const root = mount();
    // Anchor on a card that only exists once the mocked load resolves. Waiting on
    // `.index-list` would pass against the pre-load empty state and prove nothing.
    await vi.waitFor(() => expect(cardByName(root, 'by_code')).toBeTruthy());
    expect(root.querySelector('[data-testid="index-summary"]')).toBeNull();
  });
});
```

`tests/mdh-index-panel.test.tsx` already has everything these tests need: `vi.mock` for
`../src/mdh/api.js` and the cache, a `JsonEditor` stub, a `cardByName(root, name)` helper, and both
`mount()` and `mountWithModal()`.

- [ ] **Step 6: Run and watch it fail**

Run: `npx vitest run tests/mdh-index-panel.test.tsx -t "collection summary"`
Expected: FAIL — no `[data-testid="index-summary"]`.

- [ ] **Step 7: Render it**

In `src/mdh/components/IndexPanel.tsx`, add the imports:

```tsx
import { collectionIndexSummary } from '../indexDef.js';
import styles from './IndexBuilder.module.css';
```

Compute it beside `redundant` (~line 174):

```tsx
const summary = collectionIndexSummary(indexes);
```

and render it directly after the closing `</div>` of the toolbar, before `<div class="index-list">`:

```tsx
{summary && (
  <div data-testid="index-summary" class={styles.summary}>
    {summary}
  </div>
)}
```

- [ ] **Step 8: Add the stylesheet**

Create `src/mdh/components/IndexBuilder.module.css`:

```css
/* Layout for the Indexes panel's guidance affordances. Anything with a LOOK
   comes from a design-system component instead — the preset row is the shared
   `Segmented`. A CSS Module rather than the console.css monolith, per the
   design-system direction. The module sheet is linked AFTER the monolith, so a
   rule here outranks a call-site class at equal specificity: this file owns the
   arrangement and never the width of anything a call site positions. */

.summary {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.presetRow {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pickerHint {
  font-size: 12px;
  color: var(--text-secondary);
}
```

- [ ] **Step 9: Full verification and stage**

Run: `npm run typecheck && npm test && npm run format:check`

```bash
git add src/mdh/indexDef.ts src/mdh/components/IndexPanel.tsx \
        src/mdh/components/IndexBuilder.module.css \
        tests/mdh-index-def.test.ts tests/mdh-index-panel.test.tsx
```

---

### Task 3: Presets and the preset row

**Files:**
- Create: `src/mdh/indexPresets.ts`
- Create: `tests/mdh-index-presets.test.ts`
- Modify: `src/mdh/components/IndexPanel.tsx` (the create modal, ~lines 96–150)
- Modify: `tests/mdh-index-panel.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 2's exports. The conditional Lookup key preset is driven by a
  `hasWildcard` flag computed inline from the already-loaded index list (shown in Step 7), not by
  `collectionIndexSummary` — the summary returns prose, which is the wrong thing to branch on.
- Produces: `lookupKeyPreset(fields: string[])`, `matchingCascadePreset(fields: string[])`, `uniqueKeyPreset(fields: string[])`, `expiringPreset(field: string, seconds: number)`, all returning `{ indexName: string; keys: Record<string, number>; options?: Record<string, any> }`; and `type IndexPresetId = 'lookup' | 'cascade' | 'unique' | 'expiring'`.

- [ ] **Step 1: Write the failing pure tests**

Create `tests/mdh-index-presets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  lookupKeyPreset,
  matchingCascadePreset,
  uniqueKeyPreset,
  expiringPreset,
} from '../src/mdh/indexPresets.js';

describe('lookupKeyPreset', () => {
  it('indexes one field ascending, with no options', () => {
    const p = lookupKeyPreset(['code']);
    expect(p.keys).toEqual({ code: 1 });
    expect(p.options).toBeUndefined();
  });

  it('uses only the first field — a lookup key is single-field by definition', () => {
    expect(lookupKeyPreset(['code', 'other']).keys).toEqual({ code: 1 });
  });
});

describe('matchingCascadePreset', () => {
  // Field ORDER is the whole point of a compound index, and the picker preserves
  // the order fields were added. Equality-first ordering is standard MongoDB
  // guidance; it is NOT measured on this cluster (spec §2), so nothing here or
  // in the UI copy may promise a speedup.
  it('preserves the order the fields were given', () => {
    expect(matchingCascadePreset(['status', 'code', 'ts']).keys).toEqual({
      status: 1,
      code: 1,
      ts: 1,
    });
  });

  it('emits no options', () => {
    expect(matchingCascadePreset(['a', 'b']).options).toBeUndefined();
  });
});

describe('uniqueKeyPreset', () => {
  it('sets unique, which is genuinely enforced by the service', () => {
    expect(uniqueKeyPreset(['code']).options).toEqual({ unique: true });
  });

  it('supports a compound unique key', () => {
    expect(uniqueKeyPreset(['org', 'code']).keys).toEqual({ org: 1, code: 1 });
  });
});

describe('expiringPreset', () => {
  it('sets expireAfterSeconds on one date field', () => {
    const p = expiringPreset('ts', 86400);
    expect(p.keys).toEqual({ ts: 1 });
    expect(p.options).toEqual({ expireAfterSeconds: 86400 });
  });

  // Zero is a legitimate TTL — documents expire at the field's own time.
  it('keeps a zero TTL rather than dropping it as falsy', () => {
    expect(expiringPreset('ts', 0).options).toEqual({ expireAfterSeconds: 0 });
  });
});

describe('every preset', () => {
  it('suggests a name derived from the fields, never a placeholder', () => {
    expect(lookupKeyPreset(['code']).indexName).toBe('code_idx');
    expect(matchingCascadePreset(['status', 'code']).indexName).toBe('status_code_idx');
  });

  it('ignores blank and non-string field paths', () => {
    expect(matchingCascadePreset(['ok', '  ', '', null as any]).keys).toEqual({ ok: 1 });
  });

  it('emits no keys at all when nothing usable was given', () => {
    expect(matchingCascadePreset([]).keys).toEqual({});
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/mdh-index-presets.test.ts`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Write the module**

Create `src/mdh/indexPresets.ts`:

```ts
// Pure preset builders for regular MongoDB indexes. No requests, no DOM: the
// modal calls these and writes the result into the JSON editor, which stays the
// only thing submitted. Facts behind the choices are in
// docs/superpowers/specs/2026-09-01-mdh-regular-index-guidance-design.md §2.

export type IndexPresetId = 'lookup' | 'cascade' | 'unique' | 'expiring';

export type IndexPreset = {
  indexName: string;
  keys: Record<string, number>;
  options?: Record<string, any>;
};

function usable(fields: string[]): string[] {
  return (fields || []).filter((f) => typeof f === 'string' && f.trim() !== '');
}

// A readable default the user can overwrite. Dots and dollars are not valid in
// an index name in practice and read badly, so a nested path collapses.
function suggestName(fields: string[], suffix = 'idx'): string {
  const parts = usable(fields).map((f) => f.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''));
  return parts.length ? `${parts.join('_')}_${suffix}` : `my_${suffix}`;
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
  const first = usable(fields).slice(0, 1);
  return { indexName: suggestName(first), keys: ascending(first) };
}

// Compound, in the order the fields were picked. A wildcard index serves only
// ONE field per plan — measured, from a real query that IXSCANned one predicate
// and FETCH-filtered the rest — so a multi-predicate query is the case where a
// hand-made index genuinely earns its place. Ordering guidance is standard
// MongoDB doctrine and is NOT measured here; do not promise a speedup.
export function matchingCascadePreset(fields: string[]): IndexPreset {
  return { indexName: suggestName(fields), keys: ascending(fields) };
}

// `unique` is genuinely enforced by the service, not merely stored: a duplicate
// insert returns E11000 (verified 2026-09-01). A wildcard index cannot do this.
export function uniqueKeyPreset(fields: string[]): IndexPreset {
  return {
    indexName: suggestName(fields, 'unique'),
    keys: ascending(fields),
    options: { unique: true },
  };
}

// TTL. `expireAfterSeconds` round-trips through indexes/list unchanged
// (verified 2026-09-01). Zero is a legitimate value, so it is passed through
// rather than treated as absent.
export function expiringPreset(field: string, seconds: number): IndexPreset {
  return {
    indexName: suggestName([field], 'ttl'),
    keys: ascending([field]),
    options: { expireAfterSeconds: seconds },
  };
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run tests/mdh-index-presets.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5a: Make the JsonEditor stub a real buffer**

`tests/mdh-index-panel.test.tsx` currently stubs the editor with `setValue: () => {}` — a no-op —
and a hardcoded `getParsed: () => ({ indexName: 'new_idx', keys: { a: 1 } })`. A preset writes
through `setValue`, so as written the submit test below would assert against that fixed value no
matter what the preset produced: it would pass with the whole feature deleted.

Replace the mock factory's body so the stub holds what is written to it:

```tsx
vi.mock('../src/mdh/components/JsonEditor.jsx', () => ({
  default: ({ editorRef }: any) => {
    if (editorRef) {
      // useRef, NOT `let`: a plain binding in a function component body is
      // re-initialised on every render, so the buffer would discard whatever
      // setValue wrote as soon as a preset click re-rendered the modal.
      const bufRef = useRef('{"indexName":"new_idx","keys":{"a":1}}');
      editorRef.current = {
        isValid: () => {
          try {
            JSON.parse(bufRef.current);
            return true;
          } catch {
            return false;
          }
        },
        getParsed: () => JSON.parse(bufRef.current),
        getValue: () => bufRef.current,
        setValue: (v: string) => {
          bufRef.current = v;
        },
        getError: () => '',
        focus: () => {},
        refresh: () => {},
      };
    }
    return <div class="json-editor-stub" />;
  },
}));
```

Add `useRef` to the file's `preact/hooks` import. The default buffer keeps the pre-existing
create-flow tests passing unchanged — verify that before moving on.

- [ ] **Step 5b: Write the failing panel test**

The editor-write assertion needs to read the stub's buffer. The `JsonEditor` mock assigns
`editorRef.current`, so expose it from the mock factory with a module-level `let` the factory
writes to, and a helper the tests call:

```tsx
let lastEditorHandle: any = null;
function editorHandle() {
  return lastEditorHandle;
}
```

Assign `lastEditorHandle = editorRef.current;` inside the existing stub's `if (editorRef)` block.
This is test-only plumbing; it does not change the stub's behaviour.

Add to `tests/mdh-index-panel.test.tsx`. **Use `mountWithModal()`, not `mount()`** — the file has
both, and only the former renders the `Modal` host that `openModal` draws into, so `mount()` would
open a modal nothing displays:

```tsx
describe('IndexPanel — presets', () => {
  async function openCreate(root: HTMLElement) {
    const create = [...root.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Create'),
    )!;
    create.click();
    await Promise.resolve();
  }

  it('renders the preset row as tabs, like the other modals', async () => {
    vi.mocked(api.listIndexes).mockResolvedValue({ result: [{ name: '_id_', key: { _id: 1 } }] });
    const root = mountWithModal();
    await vi.waitFor(() => expect(root.querySelector('.index-list')).not.toBeNull());
    await openCreate(root);
    expect(root.querySelector('[data-testid="index-preset-row"]')!.className).toContain('seg-tabs');
  });

  // A wildcard index already covers every single field, so offering a
  // single-field preset there would be offering a no-op.
  it('withholds the lookup-key preset when a wildcard index is present', async () => {
    vi.mocked(api.listIndexes).mockResolvedValue({
      result: [
        { name: '_id_', key: { _id: 1 } },
        { name: '__dynamic_index', key: { '$**': 1 } },
      ],
    });
    const root = mountWithModal();
    await vi.waitFor(() => expect(root.querySelector('.index-list')).not.toBeNull());
    await openCreate(root);
    expect(root.querySelector('[data-testid="preset-lookup"]')).toBeNull();
    expect(root.querySelector('[data-testid="preset-cascade"]')).not.toBeNull();
  });

  it('offers the lookup-key preset when there is no wildcard index', async () => {
    vi.mocked(api.listIndexes).mockResolvedValue({ result: [{ name: '_id_', key: { _id: 1 } }] });
    const root = mountWithModal();
    await vi.waitFor(() => expect(root.querySelector('.index-list')).not.toBeNull());
    await openCreate(root);
    expect(root.querySelector('[data-testid="preset-lookup"]')).not.toBeNull();
  });

  // Task 3's contract is that a preset reaches the EDITOR. Asserting the
  // submitted payload needs a chosen field, and the field picker is Task 4 —
  // that end-to-end assertion lives there instead.
  it('writes the chosen preset into the editor', async () => {
    vi.mocked(api.listIndexes).mockResolvedValue({ result: [{ name: '_id_', key: { _id: 1 } }] });
    const root = mountWithModal();
    await vi.waitFor(() => expect(cardByName(root, '_id_')).toBeTruthy());
    await openCreate(root);
    (root.querySelector('[data-testid="preset-unique"]') as HTMLElement).click();
    await Promise.resolve();

    const written = JSON.parse(editorHandle()!.getValue());
    expect(written.options).toEqual({ unique: true });
    expect(written).toHaveProperty('keys');
  });
});
```

- [ ] **Step 6: Run and watch it fail**

Run: `npx vitest run tests/mdh-index-panel.test.tsx -t "presets"`
Expected: FAIL — no `[data-testid="index-preset-row"]`.

- [ ] **Step 7: Wire the preset row**

In `src/mdh/components/IndexPanel.tsx`, add imports:

```tsx
import { Segmented } from './ImportControls.jsx';
import {
  lookupKeyPreset,
  matchingCascadePreset,
  uniqueKeyPreset,
  expiringPreset,
} from '../indexPresets.js';
import type { IndexPresetId } from '../indexPresets.js';
```

`openCreateModal` currently takes no arguments. Change its declaration to accept the wildcard flag computed from the already-loaded list, and pass it at the call site (`onClick={() => openCreateModal(hasWildcard)}`), where:

```tsx
const hasWildcard = indexes.some(
  (i: any) => i && i.key && Object.keys(i.key).some((n) => n.includes('$**')),
);
```

Inside the modal's render closure, add state and the row. **Presets write into the editor and never POST** — the editor stays the only thing `handleCreate` reads:

```tsx
const [preset, setPreset] = useState<IndexPresetId | null>(null);
const [fields, setFields] = useState<string[]>([]);

function definitionFor(id: IndexPresetId, picked: string[]) {
  if (id === 'lookup') return lookupKeyPreset(picked);
  if (id === 'cascade') return matchingCascadePreset(picked);
  if (id === 'unique') return uniqueKeyPreset(picked);
  return expiringPreset(picked[0] || 'created_at', 2592000);
}

function writePreset(id: IndexPresetId, picked: string[]) {
  editorRef.current?.setValue(JSON.stringify(definitionFor(id, picked), null, 2));
}
```

Render above the editor:

```tsx
<ModalFieldLabel>Start from</ModalFieldLabel>
<Segmented
  testid="index-preset-row"
  ariaLabel="Start from"
  value={preset || undefined}
  onChange={(id: IndexPresetId) => {
    setPreset(id);
    writePreset(id, fields);
  }}
  tabs
  options={[
    ...(hasWildcard
      ? []
      : [{ value: 'lookup', label: 'Lookup key', testid: 'preset-lookup' }]),
    { value: 'cascade', label: 'Matching cascade', testid: 'preset-cascade' },
    { value: 'unique', label: 'Unique key', testid: 'preset-unique' },
    { value: 'expiring', label: 'Expiring', testid: 'preset-expiring' },
  ]}
/>
```

- [ ] **Step 8: Full verification and stage**

Run: `npm run typecheck && npm test && npm run format:check`

```bash
git add src/mdh/indexPresets.ts src/mdh/components/IndexPanel.tsx \
        tests/mdh-index-presets.test.ts tests/mdh-index-panel.test.tsx
```

---

### Task 4: The field picker

**Files:**
- Modify: `src/mdh/components/IndexPanel.tsx`
- Modify: `src/mdh/components/IndexBuilder.module.css`
- Modify: `tests/mdh-index-panel.test.tsx`

**Interfaces:**
- Consumes: `preset`/`fields` state and `writePreset` from Task 3; `MatchKeyPicker` from `./MatchKeyPicker.jsx`; `discoverLeafPaths` from `../columnDiscovery.js`.
- Produces: nothing exported.

- [ ] **Step 1: Write the failing test**

Add to `tests/mdh-index-panel.test.tsx`:

```tsx
describe('IndexPanel — field picker', () => {
  beforeEach(() => {
    vi.mocked(api.listIndexes).mockResolvedValue({ result: [{ name: '_id_', key: { _id: 1 } }] });
  });

  it('offers discovered paths once a preset is chosen', async () => {
    vi.mocked(api.aggregate).mockResolvedValue({
      result: [{ f0: [{ _id: 'code', types: ['string'] }, { _id: 'status', types: ['string'] }] }],
    });
    const root = mountWithModal();
    await vi.waitFor(() => expect(root.querySelector('.index-list')).not.toBeNull());
    const create = [...root.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Create'),
    )!;
    create.click();
    await Promise.resolve();
    (root.querySelector('[data-testid="preset-cascade"]') as HTMLElement).click();
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="index-field-picker"]')).not.toBeNull(),
    );
  });

  // Discovery is a convenience. Losing it must not stop anyone creating an index.
  it('falls back to a free-text path when discovery fails', async () => {
    vi.mocked(api.aggregate).mockRejectedValue(new Error('no discovery'));
    const root = mountWithModal();
    await vi.waitFor(() => expect(root.querySelector('.index-list')).not.toBeNull());
    const create = [...root.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Create'),
    )!;
    create.click();
    await Promise.resolve();
    (root.querySelector('[data-testid="preset-cascade"]') as HTMLElement).click();
    await vi.waitFor(() => expect(vi.mocked(api.aggregate)).toHaveBeenCalled());
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="index-field-fallback"]')).not.toBeNull(),
    );
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/mdh-index-panel.test.tsx -t "field picker"`
Expected: FAIL — no `[data-testid="index-field-picker"]`.

- [ ] **Step 3: Implement**

Add imports to `src/mdh/components/IndexPanel.tsx`:

```tsx
import MatchKeyPicker from './MatchKeyPicker.jsx';
import { discoverLeafPaths } from '../columnDiscovery.js';
```

**Also widen the existing hooks import.** The file currently imports
`{ useState, useEffect, useRef }` from `preact/hooks`; the code below needs `useLayoutEffect` too,
and omitting it is a `ReferenceError` at render, not a type error.

Inside the modal render closure, add discovery. **Only once a preset is chosen** — a modal must not fire an aggregate merely by opening:

```tsx
const [paths, setPaths] = useState<{ loading: boolean; value: string[] | null }>({
  loading: false,
  value: null,
});

useEffect(() => {
  if (!preset || paths.value || paths.loading) return undefined;
  const controller = new AbortController();
  setPaths({ loading: true, value: null });
  discoverLeafPaths(selectedCollection.value as string, [], {
    aggregate: api.aggregate,
    signal: controller.signal,
  })
    .then((found) => setPaths({ loading: false, value: found }))
    .catch(() => setPaths({ loading: false, value: null }));
  return () => controller.abort();
}, [preset]);

// useLayoutEffect, not useEffect: Preact flushes useEffect after paint, so the
// editor's contents could lag a Submit click. "The editor always shows what will
// be sent" is a same-commit requirement.
useLayoutEffect(() => {
  if (preset) writePreset(preset, fields);
}, [fields]);
```

Render below the preset row:

```tsx
{preset && (
  <div class={styles.presetRow}>
    <ModalFieldLabel style="margin-top:8px">Fields, in query order</ModalFieldLabel>
    {paths.value ? (
      <div data-testid="index-field-picker">
        <MatchKeyPicker paths={paths.value} keys={fields} setKeys={setFields} />
      </div>
    ) : paths.loading ? (
      <div class={styles.pickerHint}>Reading field names{'…'}</div>
    ) : (
      <input
        data-testid="index-field-fallback"
        class="input"
        style="width:100%"
        placeholder="field path"
        onChange={(e: any) => setFields(e.target.value ? [e.target.value.trim()] : [])}
      />
    )}
    <div class={styles.pickerHint}>
      Order matters for a compound index: put the fields you match exactly first, then the one you
      sort or range over.
    </div>
  </div>
)}
```

That hint explains *why* order matters and promises no speedup — see the Global Constraints.

- [ ] **Step 3b: Add the end-to-end submit test moved from Task 3**

It lives here because it needs a chosen field, which only exists once this task's picker does:

```tsx
  it('submits the preset and the chosen field exactly', async () => {
    vi.mocked(api.listIndexes).mockResolvedValue({ result: [{ name: '_id_', key: { _id: 1 } }] });
    vi.mocked(api.createIndex).mockResolvedValue({ operationId: null });
    vi.mocked(api.aggregate).mockRejectedValue(new Error('no discovery'));
    const root = mountWithModal();
    await vi.waitFor(() => expect(cardByName(root, '_id_')).toBeTruthy());
    const create = [...root.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Create'),
    )!;
    create.click();
    await Promise.resolve();
    (root.querySelector('[data-testid="preset-unique"]') as HTMLElement).click();
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="index-field-fallback"]')).not.toBeNull(),
    );

    const path = root.querySelector('[data-testid="index-field-fallback"]') as HTMLInputElement;
    path.value = 'code';
    path.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    const submit = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'Create Index',
    )!;
    submit.click();
    await Promise.resolve();
    await Promise.resolve();

    const [, , keys, options] = vi.mocked(api.createIndex).mock.calls[0] as [
      string,
      string,
      any,
      any,
    ];
    expect(keys).toEqual({ code: 1 });
    expect(options).toEqual({ unique: true });
  });
```

**Mutation-test it**: change `uniqueKeyPreset` to emit a different key name, confirm this test
fails, restore, confirm it passes. It is the only end-to-end proof that a preset's output is what
actually gets sent.

- [ ] **Step 4: Run and watch it pass**

Run: `npx vitest run tests/mdh-index-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full verification and stage**

Run: `npm run typecheck && npm test && npm run format:check`

```bash
git add src/mdh/components/IndexPanel.tsx src/mdh/components/IndexBuilder.module.css \
        tests/mdh-index-panel.test.tsx
```

---

### Task 5: Documentation, build, and a headless geometry check

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/plans/2026-09-01-mdh-regular-index-guidance.md` (tick the boxes)

- [x] **Step 1: Add the spec to the index**

In `CLAUDE.md`, under "Where the design detail lives", in the **MDH** bullet, before the fuzzy-index entry:

```markdown
  `2026-09-01-mdh-regular-index-guidance-design.md` (regular-index presets and wildcard guidance),
```

- [x] **Step 2: Record the wildcard fact**

In `CLAUDE.md`, in the Dataset Management bullet, after the existing sentence about a collection created by `insert` having no search index, add:

```markdown
  Regular indexes differ per collection too: some carry a hidden wildcard index `__dynamic_index`
  on `{"$**": 1}` (so every scalar path is already indexed) and some carry only `_id_` (so every
  query is a full scan). What creates it is not established — treat it as an observation.
```

- [x] **Step 3: Build**

Run: `npm run build`
Expected: clean. Required because tests run `src/` and the browser runs `dist/`.

- [x] **Step 4: Run the built-output guards**

Run: `npx vitest run tests/css-class-collision-boundary.test.ts tests/dead-code.test.ts`
Expected: PASS. The first checks the BUILT stylesheet — `minify: true` shortens CSS Module class names and guarantees uniqueness only among themselves.

- [x] **Step 5: Headless geometry check**

jsdom has no layout, so nothing above can see a geometry bug. **Do not launch a visible browser** — `agent-browser --extension` forces headed mode, which is out of bounds. Build a throwaway harness in the scratchpad directory that `<link>`s the BUILT `dist/console/console.base.css` and `dist/console/console.css` and reproduces the real markup of the two new surfaces: the summary line under a toolbar, and the modal's preset row plus picker row above a 250px editor stand-in.

Open it headlessly on a `file://` URL and measure with `eval`:

- The summary line's text is long. Does it wrap, or force the panel wider? Check `scrollWidth > clientWidth` on the panel at a narrow width.
- Does the preset row's `tabs` variant overflow the modal at a narrow width with four options?
- Are all new elements non-zero height?

Report measured numbers, not impressions. Fix any CSS problem and re-measure. Delete the harness when done.

- [x] **Step 6: Final verification and stop**

Run: `npm run typecheck && npm test && npm run format:check`

```bash
git add -A
git status --short
```

**Do not commit.** Report the diff stat and the human click-through checklist: open a collection with only `_id_` and confirm the full-scan line; open one with a wildcard index and confirm the other line and that Lookup key is absent; pick Matching cascade, add two fields, confirm the editor updates; create it and watch the card appear.
