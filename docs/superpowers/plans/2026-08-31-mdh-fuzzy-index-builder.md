# MDH Fuzzy Search-Index Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a fuzzy-match search index something you pick from the Create modal, with the field paths offered to you and the matching `$search` query handed over, and let a `READY` index be checked against a real value before anyone trusts it.

**Architecture:** Two new pure modules produce definitions and pipelines; `SearchIndexPanel.tsx` and `IndexCard.tsx` are thin layers over them. The JSON editor stays the only thing submitted — a preset writes into it and never posts. Nothing about the transport, the reconcile poll or the card layout changes.

**Tech Stack:** Preact + `@preact/signals`, TypeScript (strict, `erasableSyntaxOnly`), esbuild, Vitest + jsdom, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-08-31-mdh-fuzzy-index-builder-design.md`

## Global Constraints

- **Do NOT run `git commit`.** This repo commits once per run, and only when the owner names committing. Every task ends with `git add`. The final commit is the owner's call.
- **Never leak customer data.** Fixtures use `acme` / `example` / `x` / `y` / `org`, and `partner-sandbox.rossum.app` where a host is needed. No real organisation name, hostname or dataset prefix.
- **Emit-neutral typing.** Prefer an erased cast (`x as string`) over a runtime change. Never add a guard or an operator just to satisfy a type.
- **`erasableSyntaxOnly`** — no `enum`, no `namespace`, no parameter properties.
- **Do not annotate contextually typed parameters.** A callback handed to `map`/`filter`/`vi.fn` already has a type.
- **`tests/dead-code.test.ts` fails on an export nothing imports.** Every new export must land in the SAME task as its first consumer. This is why the module tasks and their UI consumers are not split.
- **Prefer the design system over building in place.** Look in `src/ui/` first, then for an idiom already used in the repo (`aria-pressed` is the toggle idiom, 8 call sites), then add to `src/ui/` with a real first consumer. This task list already reflects that: the preset row reuses the existing `Segmented`, and `CopyButton` is added to `src/ui/` rather than inlined an eighth time. Do not convert unrelated call sites.
- **No bare single-letter class names in JSX** — `minify: true` shortens CSS Module locals to one or two characters and collisions are silent.
- **Component tests are `.test.tsx` and render JSX;** pure-module tests stay `.test.ts`.
- **Assert null-ness once, where the value is produced** — `const btn = root.querySelector('.x')!;` then plain `btn.click()`.
- **JSX escape sequences:** `\uXXXX` does not work in JSX text or attributes. Use `{'—'}` or an entity.
- Verification for every task: `npm run typecheck && npm test && npm run format:check`.
- **`tests/training-key-boundary.test.ts` reads `dist/`** — never run the suite while `npm run build` is racing it. Looks like a flake; is not one.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/mdh/searchIndexPresets.ts` | **Create.** Pure definition builders: `defaultPreset`, `fuzzyPreset`, `searchSnippet`. No requests, no DOM. |
| `src/mdh/searchIndexCheck.ts` | **Create.** Pure query helpers: `indexedPaths`, `checkPipeline`. Shared by the modal's snippet block and the card's Check strip. |
| `src/mdh/components/SearchIndexPanel.tsx` | **Modify.** Preset row, field picker, snippet block; passes `onCheck` to `READY` cards. |
| `src/mdh/components/IndexCard.tsx` | **Modify.** Optional `onCheck` prop and the inline Check strip. |
| `src/ui/CopyButton.tsx` + `.module.css` | **Create.** Design-system copy-to-clipboard button with transient confirmation. Fills a real gap — the pattern is hand-rolled in seven places today. |
| `src/mdh/components/SearchIndexBuilder.module.css` | **Create.** LAYOUT ONLY for the preset row, picker row, snippet block and check strip. Anything with a look comes from a design-system component. |
| `tests/mdh-search-index-presets.test.ts` | **Create.** Pure tests for the preset builders. |
| `tests/mdh-search-index-check.test.ts` | **Create.** Pure tests for the query helpers. |
| `tests/mdh-search-index-panel.test.tsx` | **Modify.** Behaviour of the new modal and card affordances. |
| `src/usage/event.ts`, `PRIVACY.md` | **Modify.** One new event name, paired. |
| `CLAUDE.md` | **Modify.** Spec index entry. |

---

### Task 1: Preset builders and the preset row

Creates `searchIndexPresets.ts` **and** its consumer together, because `tests/dead-code.test.ts` fails on an export nothing imports.

**Files:**
- Create: `src/mdh/searchIndexPresets.ts`
- Create: `src/mdh/components/SearchIndexBuilder.module.css`
- Modify: `src/mdh/components/SearchIndexPanel.tsx` (`openIndexModal`, around lines 73–158)
- Create: `tests/mdh-search-index-presets.test.ts`
- Modify: `tests/mdh-search-index-panel.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `defaultPreset(): Record<string, any>`, `fuzzyPreset(fields: string[], opts?: FuzzyOptions): Record<string, any>`, `export type FuzzyOptions = { exactAlternate?: boolean }`.

- [ ] **Step 1: Write the failing pure tests**

Create `tests/mdh-search-index-presets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { defaultPreset, fuzzyPreset } from '../src/mdh/searchIndexPresets.js';

describe('defaultPreset', () => {
  // Read verbatim off the `default` index the server creates with every
  // collection (probed live 2026-08-31). Recreating `default` from the editor's
  // old {"mappings":{"dynamic":true}} seed silently swapped in lucene.standard.
  it('reproduces the auto-created default index exactly', () => {
    expect(defaultPreset()).toEqual({
      mappings: { dynamic: true },
      analyzer: 'default_whitespace_lowercase',
      searchAnalyzer: 'default_whitespace_lowercase',
      analyzers: [
        {
          name: 'default_whitespace_lowercase',
          tokenizer: { type: 'whitespace' },
          tokenFilters: [{ type: 'lowercase' }],
          charFilters: [
            { type: 'mapping', mappings: { '.': ' ', '/': '', '\\': '', '-': ' ', ',': ' ' } },
          ],
        },
      ],
    });
  });

  it('hands back a fresh object each time, so editing one result cannot poison the next', () => {
    const a = defaultPreset();
    a.analyzers[0].charFilters[0].mappings['.'] = 'MUTATED';
    expect(defaultPreset().analyzers[0].charFilters[0].mappings['.']).toBe(' ');
  });
});

describe('fuzzyPreset', () => {
  it('maps each field as a folded string', () => {
    const def = fuzzyPreset(['vendor_name', 'vat']);
    expect(def.mappings.dynamic).toBe(false);
    expect(def.mappings.fields).toEqual({
      vendor_name: { type: 'string', analyzer: 'whitespace_lowercase_folded' },
      vat: { type: 'string', analyzer: 'whitespace_lowercase_folded' },
    });
  });

  // icuFolding is what takes the diacritic set from 2/8 to 7/8 (measured
  // 2026-08-31). Without it the preset is no better than the default index.
  it('defines the folded analyzer inline, with icuFolding after lowercase', () => {
    const def = fuzzyPreset(['vendor_name']);
    expect(def.analyzers).toHaveLength(1);
    expect(def.analyzers[0].tokenFilters).toEqual([{ type: 'lowercase' }, { type: 'icuFolding' }]);
  });

  // The house analyzer is NOT a cluster built-in: naming it without carrying the
  // definition builds a FAILED index, and the create call returns "accept" first.
  it('carries the analyzer definition rather than only naming it', () => {
    const def = fuzzyPreset(['vendor_name']);
    const named = def.mappings.fields.vendor_name.analyzer;
    expect(def.analyzers.map((a: any) => a.name)).toContain(named);
  });

  // Two analyzers sharing one name and behaving differently, in definitions that
  // get copied between collections, is the collision this name avoids.
  it('does not reuse the house analyzer name for the folded analyzer', () => {
    expect(fuzzyPreset(['x']).analyzers[0].name).not.toBe('default_whitespace_lowercase');
  });

  it('omits the fields key entirely when no field was chosen', () => {
    const def = fuzzyPreset([]);
    expect('fields' in def.mappings).toBe(false);
  });

  it('ignores blank and non-string paths', () => {
    const def = fuzzyPreset(['ok', '  ', '', null as any]);
    expect(Object.keys(def.mappings.fields)).toEqual(['ok']);
  });

  it('adds a keyword alternate under multi.exact when asked', () => {
    const def = fuzzyPreset(['vat'], { exactAlternate: true });
    expect(def.mappings.fields.vat.multi).toEqual({
      exact: { type: 'string', analyzer: 'lucene.keyword' },
    });
  });

  it('adds no alternate by default', () => {
    expect(fuzzyPreset(['vat']).mappings.fields.vat.multi).toBeUndefined();
  });

  // "vat.exact" is an HTTP 400 whose suggested fix — allowAnalyzedField: true —
  // silences the error and runs the regex against the analyzed field, answering
  // confidently wrong. Neither form may ever be generated.
  it('never emits a dotted .exact path or allowAnalyzedField', () => {
    const json = JSON.stringify(fuzzyPreset(['vat'], { exactAlternate: true }));
    expect(json).not.toContain('allowAnalyzedField');
    expect(json).not.toContain('vat.exact');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/mdh-search-index-presets.test.ts`
Expected: FAIL — `Failed to resolve import "../src/mdh/searchIndexPresets.js"`.

- [ ] **Step 3: Write the module**

Create `src/mdh/searchIndexPresets.ts`:

```ts
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
```

- [ ] **Step 4: Run the pure tests and watch them pass**

Run: `npx vitest run tests/mdh-search-index-presets.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Write the failing panel test**

Add to `tests/mdh-search-index-panel.test.tsx`. First **extend the `JsonEditor` stub** — it currently exposes only `isValid`/`getParsed`, and a preset writes through `setValue`. Replace the mock factory's body so the stub keeps a mutable buffer:

```tsx
vi.mock('../src/mdh/components/JsonEditor.jsx', () => ({
  default: ({ value, editorRef }: any) => {
    if (editorRef) {
      // useRef, NOT `let`: a plain binding in a function component body is
      // re-initialised on every render, so the buffer would discard whatever
      // setValue wrote as soon as a preset click re-rendered the modal. The real
      // JsonEditor seeds once at mount and is imperative thereafter; this matches.
      const bufRef = useRef(value);
      editorRef.current = {
        getValue: () => bufRef.current,
        setValue: (v: string) => {
          bufRef.current = v;
        },
        isValid: () => {
          try {
            JSON.parse(bufRef.current);
            return true;
          } catch {
            return false;
          }
        },
        getParsed: () => JSON.parse(bufRef.current),
      };
    }
    return <div class="json-editor-stub" />;
  },
}));
```

Then add the describe block:

```tsx
describe('SearchIndexPanel — presets', () => {
  beforeEach(() => {
    vi.mocked(api.listSearchIndexes).mockResolvedValue([listedIndex()]);
    vi.mocked(api.putSearchIndex).mockResolvedValue({});
  });

  async function openCreate(root: HTMLElement) {
    const create = [...root.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Create'),
    )!;
    create.click();
    await Promise.resolve();
  }

  it('offers both presets in create mode', async () => {
    const root = mount();
    await Promise.resolve();
    await openCreate(root);
    const labels = [...root.querySelectorAll('[data-testid="preset-row"] button')].map(
      (n) => n.textContent,
    );
    expect(labels).toEqual(['Whole-word match', 'Fuzzy match']);
  });

  it('writes the fuzzy definition into the editor and submits exactly that', async () => {
    const root = mount();
    await Promise.resolve();
    await openCreate(root);

    const name = root.querySelector('input.input') as HTMLInputElement;
    name.value = 'vendor_fuzzy';
    (root.querySelector('[data-testid="preset-fuzzy"]') as HTMLElement).click();
    await Promise.resolve();

    const submit = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'Create Search Index',
    )!;
    submit.click();
    await Promise.resolve();
    await Promise.resolve();

    const [, indexName, definition] = vi.mocked(api.putSearchIndex).mock.calls[0];
    expect(indexName).toBe('vendor_fuzzy');
    expect(definition.analyzers[0].tokenFilters).toEqual([
      { type: 'lowercase' },
      { type: 'icuFolding' },
    ]);
  });

  // An Edit modal opens on a customer's existing definition. A chip that
  // overwrites it in one click is "never delete customer data" in a costume.
  it('shows no presets in edit mode', async () => {
    const root = mount();
    await Promise.resolve();
    const edit = root.querySelector('.action-edit') as HTMLElement;
    edit.click();
    await Promise.resolve();
    expect(root.querySelector('[data-testid="preset-row"]')).toBeNull();
  });
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run tests/mdh-search-index-panel.test.tsx`
Expected: FAIL — no `[data-preset]` nodes.

- [ ] **Step 7: Add the preset row to the modal**

In `src/mdh/components/SearchIndexPanel.tsx`, import the module and the stylesheet:

```tsx
import { defaultPreset, fuzzyPreset } from '../searchIndexPresets.js';
import { Segmented } from './ImportControls.jsx';
import styles from './SearchIndexBuilder.module.css';
```

**Use the existing `Segmented` component — do not hand-roll chips.** `ImportControls.tsx` already
exports a segmented single-choice control with `role="group"`, `aria-pressed` per option, and a
`tabs` variant; six files already use it. Building a second one here would be a new component in
place, which this repo prefers against.

Inside the `openModal(...)` render function, above the existing `ModalFieldLabel` for Name, add state and the row. `isEdit` already exists in scope:

```tsx
const [preset, setPreset] = useState<'default' | 'fuzzy' | null>(null);
// The exact string the last preset wrote. Anything else in the editor is the
// user's own work, and replacing it has to be asked about first.
const lastPresetJson = useRef<string | null>(null);
const [pendingPreset, setPendingPreset] = useState<'default' | 'fuzzy' | null>(null);

function definitionFor(id: 'default' | 'fuzzy') {
  return id === 'default' ? defaultPreset() : fuzzyPreset([]);
}

function writePreset(id: 'default' | 'fuzzy') {
  const json = JSON.stringify(definitionFor(id), null, 2);
  editorRef.current?.setValue(json);
  lastPresetJson.current = json;
  setPreset(id);
  setPendingPreset(null);
}

function choosePreset(id: 'default' | 'fuzzy') {
  const current = (editorRef.current?.getValue() || '').trim();
  // Untouched means blank, still what the LAST preset wrote, or still the modal's
  // own boilerplate seed. The seed must be here too, or the very first preset pick
  // on a fresh Create modal always asks permission to overwrite nothing.
  const untouched =
    current === '' ||
    current === (lastPresetJson.current || '').trim() ||
    current === initialJson.trim();
  // NOT confirmModal: `modalContent` is a single signal, so a confirm dialog
  // REPLACES this modal and destroys the editor contents the guard exists to
  // protect. The confirmation is inline, in the preset row's place.
  if (untouched) writePreset(id);
  else setPendingPreset(id);
}
```

Render, immediately after the Name input and before the Definition label — create mode only:

```tsx
{!isEdit && (
  <div class={styles.presetRow}>
    <ModalFieldLabel style="margin-top:8px">Start from</ModalFieldLabel>
    {pendingPreset ? (
      <div class={styles.presetConfirm}>
        <span>Replace your edits with this preset?</span>
        <button class="btn btn-sm btn-primary" onClick={() => writePreset(pendingPreset)}>
          Replace
        </button>
        <button class="btn btn-sm" onClick={() => setPendingPreset(null)}>
          Keep mine
        </button>
      </div>
    ) : (
      <Segmented
        testid="preset-row"
        ariaLabel="Start from"
        value={preset || undefined}
        onChange={choosePreset}
        options={[
          { value: 'default', label: 'Whole-word match', testid: 'preset-default' },
          { value: 'fuzzy', label: 'Fuzzy match', testid: 'preset-fuzzy' },
        ]}
      />
    )}
  </div>
)}
```

- [ ] **Step 8: Add the stylesheet**

Create `src/mdh/components/SearchIndexBuilder.module.css`:

```css
/* Layout-only styles for the search-index builder affordances. Everything with a
   LOOK comes from a design-system component instead — the preset row is the shared
   `Segmented`, the copy button is the shared `CopyButton` — so this file holds
   arrangement and nothing else. A CSS Module rather than the console.css monolith,
   per the design-system direction. The module sheet is linked AFTER the monolith,
   so a rule here outranks a call-site class at equal specificity: this file owns
   the dressing and never the width of anything a call site positions. */

.presetRow {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.presetConfirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}
```

- [ ] **Step 9: Run the full suite**

Run: `npm run typecheck && npm test && npm run format:check`
Expected: all green. If `format:check` fails, run `npm run format` **twice** — Prettier 3.9.6 is not idempotent on `vi.fn().mockResolvedValue({…})` — then re-run `format:check`.

- [ ] **Step 10: Stage**

```bash
git add src/mdh/searchIndexPresets.ts src/mdh/components/SearchIndexBuilder.module.css \
        src/mdh/components/SearchIndexPanel.tsx \
        tests/mdh-search-index-presets.test.ts tests/mdh-search-index-panel.test.tsx
```

Do **not** commit.

---

### Task 2: Field picker and the exact/regex option

**Files:**
- Modify: `src/mdh/components/SearchIndexPanel.tsx`
- Modify: `src/mdh/components/SearchIndexBuilder.module.css`
- Modify: `tests/mdh-search-index-panel.test.tsx`

**Interfaces:**
- Consumes: `fuzzyPreset(fields, { exactAlternate })` from Task 1; `MatchKeyPicker` from `./MatchKeyPicker.jsx`; `discoverLeafPaths` from `../columnDiscovery.js`.
- Produces: nothing new exported.

- [ ] **Step 1: Write the failing test**

Add to `tests/mdh-search-index-panel.test.tsx`:

```tsx
describe('SearchIndexPanel — field picker', () => {
  beforeEach(() => {
    vi.mocked(api.listSearchIndexes).mockResolvedValue([listedIndex()]);
    vi.mocked(api.putSearchIndex).mockResolvedValue({});
    vi.mocked(api.aggregate).mockResolvedValue({
      result: [{ f0: [{ _id: 'vendor_name', types: ['string'] }, { _id: 'vat', types: ['string'] }] }],
    });
  });

  it('offers discovered paths once the fuzzy preset is chosen', async () => {
    const root = mount();
    await Promise.resolve();
    const create = [...root.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Create'),
    )!;
    create.click();
    await Promise.resolve();
    (root.querySelector('[data-testid="preset-fuzzy"]') as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.querySelector('[data-testid="field-picker"]')).not.toBeNull();
  });

  it('names the chosen fields in the submitted definition, with the keyword alternate', async () => {
    // Discovery off, so the fallback input is the field source for this test.
    vi.mocked(api.aggregate).mockRejectedValue(new Error('no discovery'));
    const root = mount();
    await Promise.resolve();
    const create = [...root.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Create'),
    )!;
    create.click();
    await Promise.resolve();
    (root.querySelector('[data-testid="preset-fuzzy"]') as HTMLElement).click();
    await Promise.resolve();

    // Set the field through the documented free-text fallback rather than the
    // combobox keyboard flow: MatchKeyPicker has its own tests, and a window
    // test-seam has no business shipping in the bundle.
    const path = root.querySelector('[data-testid="field-fallback"]') as HTMLInputElement;
    path.value = 'vendor_name';
    path.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    const alt = root.querySelector('[data-testid="exact-alternate"]') as HTMLInputElement;
    alt.checked = true;
    alt.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    const name = root.querySelector('input.input') as HTMLInputElement;
    name.value = 'vendor_fuzzy';
    const submit = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'Create Search Index',
    )!;
    submit.click();
    await Promise.resolve();
    await Promise.resolve();

    const [, , definition] = vi.mocked(api.putSearchIndex).mock.calls[0];
    expect(Object.keys(definition.mappings.fields)).toEqual(['vendor_name']);
    expect(definition.mappings.fields.vendor_name.multi.exact.analyzer).toBe('lucene.keyword');
  });

  // Discovery is a convenience. Losing it must not stop anyone creating an index.
  it('falls back to a free-text path when discovery fails', async () => {
    vi.mocked(api.aggregate).mockRejectedValue(new Error('nope'));
    const root = mount();
    await Promise.resolve();
    const create = [...root.querySelectorAll('button')].find((b) =>
      b.textContent!.includes('Create'),
    )!;
    create.click();
    await Promise.resolve();
    (root.querySelector('[data-testid="preset-fuzzy"]') as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.querySelector('[data-testid="field-fallback"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/mdh-search-index-panel.test.tsx -t "field picker"`
Expected: FAIL — no `[data-testid="field-picker"]`.

- [ ] **Step 3: Implement the picker**

In `SearchIndexPanel.tsx` add the imports:

```tsx
import MatchKeyPicker from './MatchKeyPicker.jsx';
import { discoverLeafPaths } from '../columnDiscovery.js';
```

Inside the modal render function, add state and the discovery effect:

```tsx
const [fields, setFields] = useState<string[]>([]);
const [exactAlternate, setExactAlternate] = useState(false);
const [paths, setPaths] = useState<{ loading: boolean; value: string[] | null }>({
  loading: false,
  value: null,
});

// Only once the fuzzy preset is chosen — a modal must not fire an aggregate
// just by opening. `[]` for the filter stages is the "every path" case;
// buildLevelPipeline spreads the array, so it needs no special handling.
useEffect(() => {
  if (preset !== 'fuzzy' || paths.value || paths.loading) return undefined;
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

// Re-emit whenever the shape of the request changes, so the editor always shows
// what will actually be sent.
useEffect(() => {
  if (preset !== 'fuzzy') return;
  const json = JSON.stringify(fuzzyPreset(fields, { exactAlternate }), null, 2);
  editorRef.current?.setValue(json);
  lastPresetJson.current = json;
}, [fields, exactAlternate]);
```

Replace `definitionFor` so the fuzzy branch carries the current choices:

```tsx
function definitionFor(id: 'default' | 'fuzzy') {
  return id === 'default' ? defaultPreset() : fuzzyPreset(fields, { exactAlternate });
}
```

Render, between the preset row and the Definition label:

```tsx
{!isEdit && preset === 'fuzzy' && (
  <div class={styles.pickerRow}>
    <ModalFieldLabel style="margin-top:8px">Fields to match on</ModalFieldLabel>
    {paths.value ? (
      <div data-testid="field-picker">
        <MatchKeyPicker paths={paths.value} keys={fields} setKeys={setFields} />
      </div>
    ) : paths.loading ? (
      <div class={styles.pickerHint}>Reading field names{'…'}</div>
    ) : (
      <input
        data-testid="field-fallback"
        class="input"
        style="width:100%"
        placeholder="field path"
        onChange={(e: any) => setFields(e.target.value ? [e.target.value.trim()] : [])}
      />
    )}
    <label class={styles.altLabel}>
      <input
        data-testid="exact-alternate"
        type="checkbox"
        checked={exactAlternate}
        onChange={(e: any) => setExactAlternate(e.target.checked)}
      />
      Also match by exact value or regex
    </label>
  </div>
)}
```

- [ ] **Step 4: Add the styles**

Append to `SearchIndexBuilder.module.css`:

```css
.pickerRow {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pickerHint {
  font-size: 12px;
  color: var(--text-secondary);
}

.altLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/mdh-search-index-panel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full verification**

Run: `npm run typecheck && npm test && npm run format:check`
Expected: all green.

- [ ] **Step 7: Stage**

```bash
git add src/mdh/components/SearchIndexPanel.tsx \
        src/mdh/components/SearchIndexBuilder.module.css \
        tests/mdh-search-index-panel.test.tsx
```

---

### Task 2A: Give each modal its own hook chain

**Not in the original plan.** Task 2 surfaced, and the controller independently reproduced, a live
bug in the shipped extension: `src/ui/Modal.tsx` renders the modal body as `{modal.render()}` — a
plain function call — so every hook inside every `openModal` closure attaches positionally to the
shared `Modal` component's own hook chain. Opening modal A with `useState('AAA')`, closing it, then
opening a **different** modal B with `useState('BBB')` renders **`'AAA'`**. There are ~12
`openModal` call sites. Tasks 1-2 took this modal's closure from 2 hooks to ~7, which makes a
latent bug readily reachable, so it is fixed here rather than left.

**Files:**
- Modify: `src/ui/Modal.tsx` (the `{modal.render()}` call, ~line 332)
- Create: `tests/ui-modal-hook-isolation.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: no new exports. Behaviour change only.

- [ ] **Step 1: Write the failing test**

Create `tests/ui-modal-hook-isolation.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { h, render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import Modal, { openModal, closeModal } from '../src/ui/Modal.jsx';

function host() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(<Modal />, root);
  return root;
}

beforeEach(() => closeModal());

describe('Modal — each modal owns its hooks', () => {
  // The body used to be invoked as a plain function call, so its hooks landed on
  // the shared Modal component's hook list. A second modal then read the first
  // one's state out of the reused slot.
  it('does not leak useState between two different modals', async () => {
    const root = host();
    openModal('A', () => {
      const [v] = useState('AAA');
      return <div class="probe">{v}</div>;
    });
    await Promise.resolve();
    expect(root.querySelector('.probe')!.textContent).toBe('AAA');

    closeModal();
    await Promise.resolve();

    openModal('B', () => {
      const [v] = useState('BBB');
      return <div class="probe">{v}</div>;
    });
    await Promise.resolve();
    expect(root.querySelector('.probe')!.textContent).toBe('BBB');
  });

  // Different hook COUNTS are the worse case: positional slots misalign.
  it('does not misalign when the two modals have different hook counts', async () => {
    const root = host();
    openModal('three hooks', () => {
      useState('x');
      useState('y');
      const [z] = useState('z');
      return <div class="probe">{z}</div>;
    });
    await Promise.resolve();
    closeModal();
    await Promise.resolve();

    openModal('one hook', () => {
      const [only] = useState('ONLY');
      return <div class="probe">{only}</div>;
    });
    await Promise.resolve();
    expect(root.querySelector('.probe')!.textContent).toBe('ONLY');
  });

  // A closure effect must be torn down when its modal closes, not left attached
  // to the long-lived Modal host.
  it('runs a body effect cleanup when the modal closes', async () => {
    const root = host();
    let cleaned = false;
    openModal('effect', () => {
      useEffect(() => () => {
        cleaned = true;
      }, []);
      return <div class="probe">x</div>;
    });
    await Promise.resolve();
    expect(root.querySelector('.probe')).not.toBeNull();
    closeModal();
    await Promise.resolve();
    expect(cleaned).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/ui-modal-hook-isolation.test.tsx`
Expected: FAIL — the first test reports `expected 'AAA' to be 'BBB'`. That is the bug, reproduced.

- [ ] **Step 3: Render the body as a component**

In `src/ui/Modal.tsx`, change the single line:

```tsx
        {modal.render()}
```

to:

```tsx
        {/* h(), not a direct call: invoking the body inline makes its hooks land on
            THIS component's hook list, so a second modal reads the first one's state
            out of a reused slot (verified: B rendered A's value). As a component it
            gets its own instance, its own hooks, and unmount cleanup on close. */}
        {h(modal.render, {})}
```

`h` is already imported in this file. `modal.render` is `() => ComponentChildren`, which is a valid
function component — it simply ignores the props object.

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/ui-modal-hook-isolation.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the WHOLE suite — this is the regression net**

Run: `npm test`
Expected: all passing. This touches every modal in the Console, so the full suite is the point, not
a formality. If a test now fails, do not weaken it: work out whether it depended on the old shared
hook chain, and report it if the answer is unclear.

- [ ] **Step 6: Consider the Task 2 workaround**

`tests/mdh-search-index-panel.test.tsx` gained `afterEach(() => closeModal())` as a workaround for
this bug. Decide whether it is still needed with the root cause fixed, and say which in your report.
Removing it is optional; leaving it is harmless hygiene. Do not remove it if the suite goes red.

- [ ] **Step 7: Full verification and stage**

Run: `npm run typecheck && npm test && npm run format:check`

```bash
git add src/ui/Modal.tsx tests/ui-modal-hook-isolation.test.tsx
```

Do **not** commit.

---

### Task 3: The query snippet, and the paths helper both surfaces share

`indexedPaths` lands here rather than with Check, because the Edit-mode snippet is its first consumer and `dead-code.test.ts` fails on an export nothing imports.

**Files:**
- Create: `src/mdh/searchIndexCheck.ts`
- Create: `src/ui/CopyButton.tsx`, `src/ui/CopyButton.module.css`
- Modify: `src/mdh/components/SearchIndexPanel.tsx`
- Modify: `src/mdh/components/IndexCard.tsx` (replace its private `handleCopy`)
- Modify: `src/mdh/components/SearchIndexBuilder.module.css`
- Create: `tests/mdh-search-index-check.test.ts`, `tests/ui-copy-button.test.tsx`
- Modify: `tests/mdh-search-index-presets.test.ts`, `tests/mdh-search-index-panel.test.tsx`

**Interfaces:**
- Consumes: `fuzzyPreset` state from Task 2.
- Produces: `searchSnippet(indexName: string, fields: string[]): string` in `searchIndexPresets.ts`; `indexedPaths(definition: any): string[]` in `searchIndexCheck.ts`; `CopyButton` (default export) in `src/ui/CopyButton.tsx`.

**Why a CopyButton primitive.** The copy-then-tick button is hand-rolled in seven places in this
repo (`QueryItem`, `IdLabel`, `JsonTree`, `RecordCard`, `IndexCard`, and twice under
`src/docs/client/`). The snippet block needs one, and adding an eighth inline copy would be a new
component in place. Add it to the design system instead, with two consumers in this task: the new
snippet block, and `IndexCard`, whose `handleCopy` this task deletes. **Do not convert the other
five call sites** — that is unrelated refactoring for another change.

- [ ] **Step 1: Write the failing pure tests**

Create `tests/mdh-search-index-check.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { indexedPaths } from '../src/mdh/searchIndexCheck.js';

describe('indexedPaths', () => {
  it('lists the explicitly mapped fields', () => {
    expect(
      indexedPaths({ mappings: { dynamic: false, fields: { a: {}, b: {} } } }),
    ).toEqual(['a', 'b']);
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
```

Add to `tests/mdh-search-index-presets.test.ts`:

```ts
import { searchSnippet } from '../src/mdh/searchIndexPresets.js';

describe('searchSnippet', () => {
  // prefixLength 1, not 2: folding shortens ö→o, so a two-character prefix guard
  // drops a word-initial transliteration (oestergaard → Östergaard). Measured.
  it('uses the prefix length the measurement supports', () => {
    const q = JSON.parse(searchSnippet('idx', ['vendor_name']));
    expect(q.$search.text.fuzzy).toEqual({ maxEdits: 1, prefixLength: 1 });
  });

  it('names the index and uses a bare path for one field', () => {
    const q = JSON.parse(searchSnippet('idx', ['vendor_name']));
    expect(q.$search.index).toBe('idx');
    expect(q.$search.text.path).toBe('vendor_name');
  });

  it('uses an array path for several fields', () => {
    const q = JSON.parse(searchSnippet('idx', ['a', 'b']));
    expect(q.$search.text.path).toEqual(['a', 'b']);
  });

  it('leaves the query as a placeholder to paste over', () => {
    expect(JSON.parse(searchSnippet('idx', ['a'])).$search.text.query).toBe('{field_id}');
  });
});
```

- [ ] **Step 2: Run and watch both fail**

Run: `npx vitest run tests/mdh-search-index-check.test.ts tests/mdh-search-index-presets.test.ts`
Expected: FAIL — unresolved import, and `searchSnippet` is not exported.

- [ ] **Step 3: Write `searchIndexCheck.ts`**

```ts
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
```

- [ ] **Step 4: Add `searchSnippet` to `searchIndexPresets.ts`**

```ts
// The other half of a fuzzy match. maxEdits and prefixLength live in the QUERY,
// not the index, and they are worth two of the eight recovered cases on their own
// — so an index-creation surface that emits no query ships the easy half.
export function searchSnippet(indexName: string, fields: string[]): string {
  const paths = usablePaths(fields);
  return JSON.stringify(
    {
      $search: {
        index: indexName || 'index_name',
        text: {
          query: '{field_id}',
          path: paths.length === 0 ? 'field_path' : paths.length === 1 ? paths[0] : paths,
          fuzzy: { maxEdits: 1, prefixLength: 1 },
        },
      },
    },
    null,
    2,
  );
}
```

- [ ] **Step 5: Run the pure tests**

Run: `npx vitest run tests/mdh-search-index-check.test.ts tests/mdh-search-index-presets.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing panel test**

```tsx
describe('SearchIndexPanel — query snippet', () => {
  beforeEach(() => {
    vi.mocked(api.listSearchIndexes).mockResolvedValue([listedIndex()]);
  });

  it('shows the query for an existing definition when editing', async () => {
    const root = mount();
    const edit = await vi.waitFor(() => root.querySelector('.action-edit') as HTMLElement);
    edit.click();
    await Promise.resolve();
    const block = root.querySelector('[data-testid="query-snippet"]')!;
    const parsed = JSON.parse(block.textContent!);
    // listedIndex() maps a single field, `name`.
    expect(parsed.$search.text.path).toBe('name');
    expect(parsed.$search.index).toBe('default');
  });
});
```

- [ ] **Step 7: Run it and watch it fail**

Run: `npx vitest run tests/mdh-search-index-panel.test.tsx -t "query snippet"`
Expected: FAIL — no `[data-testid="query-snippet"]`.

- [ ] **Step 7a: Write the failing CopyButton test**

Create `tests/ui-copy-button.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { h, render } from 'preact';
import CopyButton from '../src/ui/CopyButton.jsx';

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

describe('CopyButton', () => {
  it('copies the text it is given', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(<CopyButton text="hello" />, root);
    (root.querySelector('button') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('confirms after a copy and returns to the resting label', async () => {
    vi.useFakeTimers();
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(<CopyButton text="hello" />, root);
    const btn = root.querySelector('button') as HTMLButtonElement;
    expect(btn.textContent).toBe('Copy');
    btn.click();
    await Promise.resolve();
    expect(btn.textContent).toContain('Copied');
    vi.advanceTimersByTime(1200);
    expect(btn.textContent).toBe('Copy');
    vi.useRealTimers();
  });

  // Takes a getter so a caller can copy something expensive to serialise without
  // building it on every render.
  it('accepts a function for the text', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(<CopyButton text={() => 'lazy'} />, root);
    (root.querySelector('button') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('lazy');
  });
});
```

Run: `npx vitest run tests/ui-copy-button.test.tsx` — expect FAIL, unresolved import.

- [ ] **Step 7b: Write the CopyButton primitive**

Create `src/ui/CopyButton.tsx`:

```tsx
import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import styles from './CopyButton.module.css';

// Copy-to-clipboard with a transient confirmation (design system). This pattern was
// hand-written in seven places before this component existed; each one owned its own
// timer and its own label swap, and several mutated `textContent` directly, which
// fights the renderer. `text` may be a string or a getter, so a caller can avoid
// serialising something expensive on every render.
export default function CopyButton({
  text,
  label = 'Copy',
  className,
}: {
  text: string | (() => string);
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The timer is owned by the effect that owns the component: a remount otherwise
  // leaves it running against a destroyed node.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <button
      type="button"
      class={styles.copy + (className ? ' ' + className : '')}
      onClick={() => {
        const value = typeof text === 'function' ? text() : text;
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1000);
        });
      }}
    >
      {copied ? '\u2713 Copied' : label}
    </button>
  );
}
```

Note the escape: `'\u2713 Copied'` sits inside a JS string expression, which is where `\uXXXX`
works. Writing it as raw JSX text would render six literal characters.

Create `src/ui/CopyButton.module.css`:

```css
/* Copy-to-clipboard button (design system). No width and no margin: the call site
   places it, since the module sheet outranks a call-site class at equal specificity. */

.copy {
  font: inherit;
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
}

.copy:hover {
  color: var(--text-primary);
  border-color: var(--accent);
}
```

Run: `npx vitest run tests/ui-copy-button.test.tsx` — expect PASS, 3 tests.

- [ ] **Step 7c: Convert `IndexCard` to the primitive**

In `src/mdh/components/IndexCard.tsx`, delete the private `handleCopy` function entirely and
replace the copy button with the shared component:

```tsx
import CopyButton from '../../ui/CopyButton.jsx';
```

```tsx
{definition && (
  <CopyButton className="action-copy" text={() => JSON.stringify(definition, null, 2)} />
)}
```

The existing panel test asserts on `.action-copy` and on the clipboard payload, so it must keep
passing unchanged — that is the regression check for this conversion.

- [ ] **Step 8: Render the snippet block**

Add the imports to `SearchIndexPanel.tsx`:

```tsx
import { searchSnippet } from '../searchIndexPresets.js';
import { indexedPaths } from '../searchIndexCheck.js';
import CopyButton from '../../ui/CopyButton.jsx';
```

`openIndexModal` currently takes `{ mode, name, definition }`. Inside the render function, below `<JsonEditor .../>` and the hint div, add:

```tsx
{(() => {
  const snippetFields = isEdit ? indexedPaths(initialDefinition) : fields;
  const snippet = searchSnippet(initialName || '', snippetFields);
  return (
    <details class={styles.snippet}>
      <summary>Query for this index</summary>
      <pre data-testid="query-snippet" class={styles.snippetCode}>
        {snippet}
      </pre>
      <CopyButton text={snippet} />
    </details>
  );
})()}
```

Note: in create mode `initialName` is `''`, so the snippet shows `index_name` until the index is named. That is deliberate — the name field is the source of truth and is not read reactively here.

- [ ] **Step 9: Add the styles**

```css
.snippet {
  margin-top: 8px;
  font-size: 12px;
}

.snippetCode {
  background: var(--bg-code);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px 10px;
  overflow-x: auto;
  margin: 6px 0;
  white-space: pre;
}
```

- [ ] **Step 10: Full verification and stage**

Run: `npm run typecheck && npm test && npm run format:check`

```bash
git add src/mdh/searchIndexCheck.ts src/mdh/searchIndexPresets.ts \
        src/ui/CopyButton.tsx src/ui/CopyButton.module.css \
        src/mdh/components/SearchIndexPanel.tsx src/mdh/components/IndexCard.tsx \
        src/mdh/components/SearchIndexBuilder.module.css \
        tests/mdh-search-index-check.test.ts tests/mdh-search-index-presets.test.ts \
        tests/ui-copy-button.test.tsx tests/mdh-search-index-panel.test.tsx
```

---

### Task 4: Check

**Files:**
- Modify: `src/mdh/searchIndexCheck.ts`
- Modify: `src/mdh/components/IndexCard.tsx`
- Modify: `src/mdh/components/SearchIndexPanel.tsx`
- Modify: `src/mdh/components/SearchIndexBuilder.module.css`
- Modify: `tests/mdh-search-index-check.test.ts`, `tests/mdh-search-index-panel.test.tsx`

**Interfaces:**
- Consumes: `indexedPaths` from Task 3; `api.aggregate(collection, pipeline, {signal})`.
- Produces: `checkPipeline(indexName: string, paths: string[], value: string): any[]`; `IndexCard` gains `onCheck?: (value: string, path?: string) => Promise<any[]>` and `checkNeedsPath?: boolean`.

- [ ] **Step 1: Write the failing pure tests**

Add to `tests/mdh-search-index-check.test.ts`:

```ts
import { checkPipeline } from '../src/mdh/searchIndexCheck.js';

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
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/mdh-search-index-check.test.ts`
Expected: FAIL — `checkPipeline is not a function`.

- [ ] **Step 3: Add `checkPipeline`**

Append to `src/mdh/searchIndexCheck.ts`:

```ts
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
```

- [ ] **Step 4: Run the pure tests**

Run: `npx vitest run tests/mdh-search-index-check.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing card tests**

```tsx
describe('SearchIndexPanel — check', () => {
  it('offers Check on a READY index', async () => {
    vi.mocked(api.listSearchIndexes).mockResolvedValue([listedIndex()]);
    const root = mount();
    await vi.waitFor(() => expect(root.querySelector('.action-check')).not.toBeNull());
  });

  // A $search against a building index returns [] with code "ok". Without this
  // guard Check would report "no matches" for an index that is merely unfinished.
  it('offers no Check while the index is still building', async () => {
    vi.mocked(api.listSearchIndexes).mockResolvedValue([
      listedIndex({ status: 'PENDING_CREATE', queryable: false }),
    ]);
    const root = mount();
    // Wait for the card itself, then assert the Check button is absent from it —
    // otherwise this passes vacuously before the list has even rendered.
    await vi.waitFor(() => expect(root.querySelector('.record-card')).not.toBeNull());
    expect(root.querySelector('.action-check')).toBeNull();
  });

  it('runs one read-only aggregate against that index and shows the hits', async () => {
    vi.mocked(api.listSearchIndexes).mockResolvedValue([listedIndex()]);
    vi.mocked(api.aggregate).mockResolvedValue({
      result: [{ name: 'Acme Metallwerke', score: 2.9 }],
    });
    const root = mount();
    const check = await vi.waitFor(() => root.querySelector('.action-check') as HTMLElement);
    check.click();
    await Promise.resolve();

    const input = root.querySelector('[data-testid="check-value"]') as HTMLInputElement;
    input.value = 'acme';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    (root.querySelector('[data-testid="check-run"]') as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();

    const [collection, pipeline] = vi.mocked(api.aggregate).mock.calls[0];
    expect(collection).toBe('vendors');
    expect(pipeline.map((s: any) => Object.keys(s)[0])).toEqual([
      '$search',
      '$limit',
      '$addFields',
    ]);
    expect((pipeline[0] as any).$search.index).toBe('default');
    expect(root.textContent).toContain('Acme Metallwerke');
  });

  // indexedPaths returns [] for a dynamic index, so without the path input the
  // pipeline would carry an empty path array and match nothing.
  it('asks for a path when the index declares no fields', async () => {
    vi.mocked(api.listSearchIndexes).mockResolvedValue([
      listedIndex({ definition: { mappings: { dynamic: true } } }),
    ]);
    vi.mocked(api.aggregate).mockResolvedValue({ result: [] });
    const root = mount();
    const check = await vi.waitFor(() => root.querySelector('.action-check') as HTMLElement);
    check.click();
    await Promise.resolve();

    const path = root.querySelector('[data-testid="check-path"]') as HTMLInputElement;
    path.value = 'vendor_name';
    path.dispatchEvent(new Event('input', { bubbles: true }));
    (root.querySelector('[data-testid="check-run"]') as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();

    const [, pipeline] = vi.mocked(api.aggregate).mock.calls[0];
    expect((pipeline[0] as any).$search.text.path).toBe('vendor_name');
  });

  it('reports an empty result as an outcome, not an error', async () => {
    vi.mocked(api.listSearchIndexes).mockResolvedValue([listedIndex()]);
    vi.mocked(api.aggregate).mockResolvedValue({ result: [] });
    const root = mount();
    const check = await vi.waitFor(() => root.querySelector('.action-check') as HTMLElement);
    check.click();
    await Promise.resolve();
    (root.querySelector('[data-testid="check-run"]') as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(root.textContent).toContain('No match');
    expect(error.value).toBeNull();
  });
});
```

- [ ] **Step 6: Run and watch it fail**

Run: `npx vitest run tests/mdh-search-index-panel.test.tsx -t "check"`
Expected: FAIL — no `.action-check`.

- [ ] **Step 7: Add the strip to `IndexCard.tsx`**

Add to the prop type and destructuring:

```tsx
  onCheck,
  checkNeedsPath,
}: {
  // …existing props…
  // Runs one read-only probe and resolves the rows. Present only for an index
  // the panel has confirmed is READY — see the panel for why that matters.
  onCheck?: (value: string, path?: string) => Promise<any[]>;
  // True when the definition names no fields (a dynamic index), so the strip has
  // to ASK which path to search. It must never guess, and it must never emit a
  // wildcard path — that syntax is unverified against this deployment.
  checkNeedsPath?: boolean;
}) {
```

Add state beside `expanded`:

```tsx
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkValue, setCheckValue] = useState('');
  const [checkPath, setCheckPath] = useState('');
  const [checkRows, setCheckRows] = useState<any[] | null>(null);
  const [checking, setChecking] = useState(false);
```

Add the button inside `.record-actions`, before `onEdit`:

```tsx
{onCheck && (
  <button
    class="action-check"
    onClick={() => {
      setCheckOpen(!checkOpen);
      setCheckRows(null);
    }}
  >
    Check
  </button>
)}
```

And the strip, after the `notice` block:

```tsx
{checkOpen && onCheck && (
  <div class={styles.checkStrip}>
    {checkNeedsPath && (
      <input
        data-testid="check-path"
        class="input"
        placeholder="field path"
        value={checkPath}
        onInput={(e: any) => setCheckPath(e.target.value)}
      />
    )}
    <input
      data-testid="check-value"
      class="input"
      placeholder="a value from your documents"
      value={checkValue}
      onInput={(e: any) => setCheckValue(e.target.value)}
    />
    <button
      data-testid="check-run"
      class="btn btn-sm btn-primary"
      disabled={checking}
      onClick={async () => {
        setChecking(true);
        try {
          setCheckRows(await onCheck(checkValue, checkPath));
        } catch {
          setCheckRows([]);
        }
        setChecking(false);
      }}
    >
      Run
    </button>
    {checkRows &&
      (checkRows.length === 0 ? (
        <div class={styles.checkEmpty}>
          No match. Either this field is not in the index, or the value is not in the data.
        </div>
      ) : (
        <ol class={styles.checkRows}>
          {checkRows.map((r) => (
            <li>
              <span class={styles.checkScore}>{Number(r.score ?? 0).toFixed(2)}</span>
              <span>{JSON.stringify(r)}</span>
            </li>
          ))}
        </ol>
      ))}
  </div>
)}
```

Import the stylesheet at the top of `IndexCard.tsx`:

```tsx
import styles from './SearchIndexBuilder.module.css';
```

- [ ] **Step 8: Wire it in the panel**

In `SearchIndexPanel.tsx`, add the import and, inside the `indexes.map` callback, build the handler:

```tsx
import { indexedPaths, checkPipeline } from '../searchIndexCheck.js';
```

```tsx
// READY only. A $search against a building index returns [] with code "ok",
// indistinguishable from a real miss — so offering Check earlier would turn a
// diagnostic into a new way to be misled. A FAILED-but-queryable index is still
// serving its previous build, so it stays checkable.
const isReady = isObj && String(idx.status).toUpperCase() === 'READY';
const checkable = isReady || stillServing;
const declaredPaths = definition ? indexedPaths(definition) : [];
const onCheck = checkable
  ? async (value: string, path?: string) => {
      // A dynamic index declares no fields, so the strip asked for one. Never
      // guess a path and never emit a wildcard — unverified against this cluster.
      const paths = declaredPaths.length ? declaredPaths : path ? [path] : [];
      const res = await api.aggregate(
        selectedCollection.value as string,
        checkPipeline(name, paths, value),
      );
      return res?.result || [];
    }
  : undefined;
```

and pass `onCheck={onCheck}` plus `checkNeedsPath={declaredPaths.length === 0}` to `<IndexCard …/>`.

- [ ] **Step 9: Add the styles**

```css
.checkStrip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  font-size: 12px;
}

.checkEmpty {
  flex-basis: 100%;
  color: var(--text-secondary);
}

.checkRows {
  flex-basis: 100%;
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.checkScore {
  display: inline-block;
  min-width: 42px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}
```

- [ ] **Step 10: Full verification and stage**

Run: `npm run typecheck && npm test && npm run format:check`

```bash
git add src/mdh/searchIndexCheck.ts src/mdh/components/IndexCard.tsx \
        src/mdh/components/SearchIndexPanel.tsx \
        src/mdh/components/SearchIndexBuilder.module.css \
        tests/mdh-search-index-check.test.ts tests/mdh-search-index-panel.test.tsx
```

---

### Task 5: The usage event

**Files:**
- Modify: `src/usage/event.ts`, `PRIVACY.md`, `src/mdh/components/SearchIndexPanel.tsx`

**Interfaces:**
- Consumes: `track` from `../../usage/track.js` — alias it as `trackUsage`, the way `IndexPanel.tsx` does, or `useOperationStatus`'s own `track` shadows it.

- [ ] **Step 1: Add the event name**

In `src/usage/event.ts`, after `'sa_mdh_index_create'`:

```ts
  'sa_mdh_search_index_check',
```

- [ ] **Step 2: Add the paired privacy line**

In `PRIVACY.md`, after the `sa_mdh_index_create` row:

```markdown
| `sa_mdh_search_index_check` | a search index was checked against a value |
```

- [ ] **Step 3: Fire it**

In `SearchIndexPanel.tsx`, add the aliased import and call it inside `onCheck` before the aggregate:

```tsx
import { track as trackUsage } from '../../usage/track.js';
```

```tsx
      trackUsage('sa_mdh_search_index_check');
```

- [ ] **Step 4: Run the pairing guard**

Run: `npm test`
Expected: PASS. The privacy-pairing test fails loudly if the backticked name is missing from `PRIVACY.md`.

- [ ] **Step 5: Stage**

```bash
git add src/usage/event.ts PRIVACY.md src/mdh/components/SearchIndexPanel.tsx
```

---

### Task 6: Documentation, build, and a real-browser pass

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/plans/2026-08-31-mdh-fuzzy-index-builder.md` (tick the boxes)

- [x] **Step 1: Add the spec to the index**

In `CLAUDE.md`, under "Where the design detail lives", in the **MDH** bullet, before the search-index V2 entry:

```markdown
  `2026-08-31-mdh-fuzzy-index-builder-design.md` (search-index presets and Check),
```

- [x] **Step 2: Note the collection-creation gap**

In `CLAUDE.md`, in the Dataset Management bullet, add one sentence after the search-index exception:

```markdown
  A collection created by `insert` rather than `collections/create` has NO search index at all —
  not even `default` — so `$search` against it returns zero rows with `status: completed`.
```

- [x] **Step 3: Build**

Run: `npm run build`
Expected: clean. This is required before anyone reloads the extension — tests run `src/`, the browser runs `dist/`.

- [x] **Step 4: Confirm the CSS Module class names survived minification**

Run: `npm test -- css-class-collision`
Expected: PASS. `minify: true` shortens CSS Module locals to one or two characters and guarantees uniqueness only among themselves.

- [ ] **Step 5: Check it in a real browser**

> **Not done as written** — a headed browser is out of bounds for this agent. Substituted a headless CSS-geometry pass instead (a scratchpad HTML harness linking the built `dist/console/console.base.css` + `console.css`, opened via `agent-browser` with `set viewport`, measured with `eval`; see task-6-report.md). That covers layout/overflow but NOT the actual click-through behavior in 1-5 above — a human still needs to run those five steps in a real browser before this ships.

jsdom has no layout, so nothing above can see a geometry bug. In the Console's Dataset Management app, on a collection in an internal org:

1. Open **Search Indexes** → **+ Create** → click **Fuzzy match**. The field picker appears and the editor fills.
2. Add a field, tick **Also match by exact value or regex**, and confirm the editor updates.
3. Type into the editor, then click **Whole-word match** — the inline "Replace your edits?" line must appear *in place of the chips*, and **Keep mine** must leave the editor untouched.
4. Create it, watch the badge reach `READY`, then use **Check** with a value you know is present, and one you know is not.
5. Open **Edit** on an existing index — there must be **no preset chips**, and the query snippet must name that index's own fields.

- [x] **Step 6: Final verification**

Run: `npm run typecheck && npm test && npm run format:check`
Expected: all green, with the suite's count up by roughly 30.

- [x] **Step 7: Stage everything and stop**

```bash
git add -A
git status --short
```

**Do not commit.** Report the diff stat and wait for the owner to name committing.
