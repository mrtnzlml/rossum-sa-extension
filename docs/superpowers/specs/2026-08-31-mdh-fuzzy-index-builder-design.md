# MDH fuzzy search-index builder — design

**Date:** 2026-08-31
**Builds on:** `2026-08-28-mdh-search-index-v2-migration-design.md`, which stays the base record
for the transport, the lifecycle and the panel. Nothing there is superseded. This is additive:
the same `putSearchIndex`, the same reconcile poll, the same cards.
**Status:** proposed. Presented as the artifact *Fuzzy Index Builder*
(https://claude.ai/code/artifact/e92612df-4c20-43e1-9710-eec62a50bf7d).
**Owner decisions, verbatim where they settle something:**
- Scope: **"A + C"** — presets and a field picker inside the existing Create modal, plus a
  read-only Check action on `READY` cards. The tabbed Guided/JSON builder was offered and
  **declined**; do not read this spec as a step toward it.
- Standing: "Preserve as much as possible of the current functionality"; "Always consider
  backward compatibility"; "Never leak customer names or customer data"; "Do not make any
  assumptions. All decisions must be verified first and grounded in facts."

## 1. What changes, in one paragraph

The Create Search Index modal grows a **preset row** and a **field picker** above the JSON editor.
The editor keeps its current role exactly: it is still the only thing submitted, and a preset does
nothing but write into it. **"Whole-word match" is the modal's actual default** — selected on open,
with its definition already in the editor, replacing the old bare `{mappings:{dynamic:true}}` seed. Separately, a `READY`
index card grows a **Check** action that runs one read-only `$search` against that index and shows
the top five hits. No endpoint, no transport function and no stored shape changes. The point is to
move four pieces of knowledge — the mapping JSON, the field paths, which analyzer actually works,
and whether the result is any good — out of people's heads and into the panel.

## 2. Verified facts this design rests on

Probed live on 2026-08-31 against `elis.rossum.ai` (Rossum's own dashboard, organization 1) with
an org-admin token, on three throwaway collections created and dropped inside the run. The
organization began and ended with the same 21 collections, checked both times. The corpus is
twenty invented vendor names in confusable pairs with German, Czech and Scandinavian diacritics;
no customer organization was touched and no customer name, hostname or dataset name appears here
or in the tests this spec calls for.

**The house analyzer is defined inline, not built into the cluster.** The auto-created `default`
index carries `mappings: {dynamic: true}`, `analyzer` *and* `search_analyzer` both
`default_whitespace_lowercase`, and an `analyzers` array defining that analyzer — whitespace
tokenizer, `lowercase` token filter, and a char mapping `{".": " ", "/": "", "\\": "", "-": " ",
",": " "}`. Read verbatim off a `READY` index.

**Naming it without defining it builds a FAILED index.** An index declaring
`analyzer: "default_whitespace_lowercase"` per field, with no `analyzers` array, was accepted with
`code: "accept"` and reached `status: FAILED`, `queryable: false`. This is the most likely way to
get a hand-written fuzzy index wrong, and nothing in the flow warns about it.

**Folding is worth six of eight cases.** Eight single-token queries where an accented word is the
only signal, `text` with `fuzzy: {maxEdits: 1, prefixLength: 2}`, top-1:

| index | score | missed |
|---|---|---|
| house analyzer (what `default` uses) | **2/8** | zuerich, mueller, schaefer, oestergaard, ceske, akerlund |
| `lucene.standard` | **2/8** | the same six |
| house + `icuFolding` | **7/8** | oestergaard |

The six misses returned **zero rows**, not a wrong row.

**The last case is the query, not the index.** `oestergaard` → `Östergaard` fails at
`prefixLength: 2` because folding shortens `ö` to `o`, so the query's first two characters (`oe`)
stop matching the indexed prefix (`os`). At `prefixLength: 1` — and at `0` — the same index scores
**8/8**. So `maxEdits` and `prefixLength` live in the query, and an index-only feature ships the
half worth two of the eight.

**Lowering the prefix guard costs no precision here.** Ten realistic multi-token queries
(`"zuerich metallwerke ag"`) against the folded index at `prefixLength: 1` returned **10/10** with
the exact expected record ids.

**A realistic corpus hides the whole problem.** Those same ten queries score 10/10 on the
*unfolded* house index too, because the non-accented tokens carry every match. A spot-check
against real data is not evidence — which is the argument for Check.

**Folding applies to the query as well as the document, with no `searchAnalyzer`.** A separate
probe stored four ASCII names and queried them with diacritics (`Zürich` against stored `Zurich`,
`Söhne` against `Sohne`, `České` against `Ceske`, `Östergaard` against `Ostergaard`): **4/4**, with
only the per-field `analyzer` set and `search_analyzer: null`. So the fuzzy preset needs no
top-level analyzer keys.

**A `multi` keyword alternate works, and the same field still fuzzy-matches.** One index mapped
two fields as folded `string` with `multi: {exact: {type: "string", analyzer: "lucene.keyword"}}`.
`regex` addressed as `{"path": {"value": "vat", "multi": "exact"}}` with `"CZ.*"` returned the
row; `text` + `fuzzy` on the parent path `"name"` returned the right row from the same index.

**The wrong path form is an HTTP 400, and its advice is a trap.** `{"path": "vat.exact"}` returns
`400 "Field vat.exact is analyzed. Use a keyword analyzed field or set allowAnalyzedField to
true."` Setting `allowAnalyzedField: true` silences the 400 and runs the regex against the
analyzed field, returning a confidently wrong answer instead of an error. Re-confirmed 2026-08-31.

**A `$search` against a still-building index returns `[]` with `code: "ok"`.** Observed twice
while indexes sat at `PENDING`. It is indistinguishable from a genuine miss, and it is the reason
Check has a `READY` guard.

**A collection created by `insert` has no search index at all** — not even `default`. The `default`
index comes only from `collections/create`. In this codebase only `Sidebar.tsx`'s New Collection
takes that path (`api.createCollection`); `importFile.ts` inserts into a collection that already
exists. So a collection made by a hook, by the data-matching file import, or by a raw insert
starts with zero indexes.

**Contrast, computed not eyeballed.** `#006fe8` on white is 4.73:1 — the brand hue already on
record. Not a design input for the panel, which uses the Console's own tokens; recorded because
the proposal artifact uses it.

### Carried forward from 2026-08-26/28, not re-probed

Marked so nobody mistakes them for today's measurements: input accepts both camelCase and
snake_case (`populate_by_name`); the eight supported mapping types; `PUT` is an upsert returning
202 with no operation id; a `$search` naming a *missing* index returns zero rows with
`status: completed`; a `/` in a collection name is unreachable through V2.

### Not verified, stated rather than assumed

- Whether `icuFolding` behaves acceptably for **non-Latin scripts** — Cyrillic, Greek, CJK. The
  corpus was Latin-only. This bounds the claim the preset copy may make.
- Whether a **non-admin token** may `PUT` a search index.
- Dropping an index that exists only on the engine; whether the native resource emits `DELETING`.
  Both carried from the V2 spec, both unchanged by this work.

## 3. `src/mdh/searchIndexPresets.ts` — new, pure

No requests, no DOM. Tested the way `searchIndexDef.ts` is.

```ts
export type FuzzyOptions = { exactAlternate?: boolean };

export function defaultPreset(): Record<string, any>;
export function fuzzyPreset(fields: string[], opts?: FuzzyOptions): Record<string, any>;
```

**`defaultPreset()`** returns the definition read verbatim off the server's own `default` index —
`mappings: {dynamic: true}`, `analyzer` and `searchAnalyzer` both `default_whitespace_lowercase`,
and the analyzer defined inline. It is a copy of something the engine built and marked `READY`,
which is why it is the one preset whose correctness needs no argument.

**Superseded 2026-09-01: `Custom` is now the first tab and the modal's default.** It holds the
minimal valid definition `{"mappings": {"dynamic": true}}` — verified live to reach `READY`,
`queryable: true`, round-tripping byte-identical — which is also the seed this modal shipped with
before presets existed, so the untouched Create path builds what it always built. "Whole-word
match" is one tab away and keeps the justification below.

**Correction to the claim made when this preset was written.** The text below said the old seed was
"measurably not what `default` does". That is true of the DEFINITIONS and unsupported for
BEHAVIOUR: the two recall experiments in §2 found the house analyzer and `lucene.standard`
equivalent (9/10 vs 9/10, then 2/8 vs 2/8), and a later probe showed `AC 1001`, `AC.1001` and
`AC/1001` all matching an indexed `AC-1001` under the minimal, standard-analyzer index — the
punctuation normalisation attributed to the house analyzer is not exclusive to it. `defaultPreset`
still earns its tab by reproducing the server's own `default` index verbatim, which is what matters
when recreating a dropped one; it has no measured behavioural advantage over the minimal seed.

**It was also the modal's seed and its preselected chip.** The editor previously opened on
`{"mappings": {"dynamic": true}}` — a *plain* dynamic index on `lucene.standard`, measurably not
what `default` does — so pressing Create without touching anything built something subtly different
from the index every collection already gets. Opening on this preset makes the
do-nothing path produce the right thing, and makes the selected chip an honest description of
what is in the editor rather than a control that starts unset.

**`fuzzyPreset(fields)`** emits, for each path, `{type: "string", analyzer:
"whitespace_lowercase_folded"}` under `mappings.fields`, with `dynamic: false`, and one
`analyzers` entry: the house analyzer's tokenizer and char filters, token filters `lowercase` then
`icuFolding`. No top-level `analyzer` or `searchAnalyzer` — measured unnecessary.

The folded analyzer is deliberately **not** named `default_whitespace_lowercase`. Two analyzers
sharing one name and behaving differently, in definitions that get copied between collections,
is worth one extra word to avoid.

With `exactAlternate: true` each field also gets
`multi: {exact: {type: "string", analyzer: "lucene.keyword"}}`. This is an option on the fuzzy
preset rather than a third preset, because the alternate hangs off the same field — offering it
separately would invite a second index nobody needs.

`fields: []` returns a definition with **no `fields` key at all**, not `fields: {}` — an empty
mapping object is a different thing to the engine and there is no reason to send one.


## 4. `SearchIndexPanel.tsx` — the modal

Unchanged: the name input, the JSON editor, the hint line, `splitPastedDefinition` tolerance, the
422 trimming, Cancel/Create, Edit with a locked name, and the slash-named-collection guard.
**The editor stays the only thing read on submit.**

Added above the editor, create mode only:

- A **preset row**: `Whole-word match` · `Fuzzy match`. Choosing one writes its JSON into the
  editor. Nothing is posted.
- When `Fuzzy match` is selected, a **field picker** — the existing `MatchKeyPicker`, given
  `discoverLeafPaths(collection, [], {aggregate: api.aggregate, signal})`. That is `ExportWizard`'s
  pattern, with `[]` for filter stages so every path is offered; `buildLevelPipeline` spreads the
  array, so `[]` is the "no filter" case rather than a special one.
- A **checkbox**, "Also match by exact value or regex", enabled only with `Fuzzy match`.

**No query snippet ships.** A collapsed "Query for this index" block was built and then removed at
the owner's request. The measurement behind it still stands — `prefixLength: 1` is worth the eighth
of eight cases that the analyzer alone does not recover (§2) — so that guidance now lives only in
this spec and in the preset's own comments, not in the product. `searchSnippet` was deleted rather
than left as an export nothing imports, which `tests/dead-code.test.ts` would fail on.

Four rules carry the safety:

1. **Presets write into the editor and never post.** A preset cannot silently drop a key someone
   typed, because they watched it be replaced and the editor still holds the result.
2. **Edit mode renders no presets.** An Edit modal opens on a customer's existing definition; a
   chip that overwrites it in one click is "retiring a feature must never delete customer data"
   wearing a different hat. Edit gains nothing new at all — it opens on the customer's definition,
   with no preset row and no preselection.
3. **Replacing a dirty editor confirms first, inline.** The panel keeps the last preset-emitted
   string; if the editor differs, a preset click swaps the preset row for one line — *"Replace
   your edits with this preset?"* with **Replace** and **Keep mine**. **The field picker routes
   through the same guard** — a change of field or of the exact/regex option cannot silently
   replace hand-written JSON either. (The first implementation guarded only the preset chips; the
   final review caught the picker bypassing it and destroying a hand-edit with no prompt.) It must
   **not**
   use `confirmModal`: `modalContent` is a single signal, so a confirm dialog *replaces* the open
   modal rather than stacking on it, and the editor's contents would be destroyed by the very
   guard meant to protect them. Verified by reading `src/ui/Modal.tsx`.
4. **Discovery failure degrades, never blocks.** If `discoverLeafPaths` rejects or aborts, the
   picker falls back to a free-text path input. The preset still works; only the suggestions go.

**A definition that can never match anything is refused at submit.** `matchesNothing` in
`searchIndexDef.ts` rejects a `mappings` with `dynamic` falsy and no non-empty `fields` — which is
valid V2 input that builds a `READY` index matching zero documents, for ever, with nothing anywhere
saying so. The check is on the definition's SHAPE rather than on which preset produced it, so a
hand-typed definition with the same flaw is caught too. Added after the final review found that
choosing "Fuzzy match" and pressing Create without picking a field did exactly this — a fifth
silent-failure mode inside the feature built to remove four.

**The name is never auto-filled from a preset.** Field choices change after a name would have been
generated, and a stale suggested name is worse than an empty box. The existing auto-fill from a
pasted `indexName` is untouched.

## 5. Check — a card action

`IndexCard` gains an optional `onCheck` and an inline strip. `SearchIndexPanel` passes it for an
index that is `READY` **or** `FAILED`-but-`queryable` — the latter is still serving its previous
build, and the reason is spelled out at the end of this section. It lives on the card, not in the modal, because an index takes
about a minute to build (`PENDING_CREATE` 0.7 s → `PENDING` 33 s → `READY` 55 s, measured
2026-08-28) and a Check inside Create would mean holding a dialog open for the duration.

New pure module `src/mdh/searchIndexCheck.ts`:

```ts
export function indexedPaths(definition: any): string[];
export function checkPipeline(indexName: string, paths: string[], value: string): any[];
```

`indexedPaths` returns the keys of `mappings.fields`, and `[]` for a purely dynamic mapping. No
casing work is needed: `mappings` and `fields` are the same word in both of V2's casings — only
`search_analyzer` differs, and this function never reads it.

`checkPipeline` returns exactly three stages — `$search` (`text` +
`fuzzy: {maxEdits: 1, prefixLength: 1}`), `$limit: 5`, and `$addFields` attaching
`{$meta: "searchScore"}` — assembled here from the index's own definition. **`$addFields`, not
`$project`:** `{_id: 0, score: …}` is an *inclusion* projection, so it would return the score and
drop every field of the matched record, which is the one thing the reader needs to see.
**No stage comes from user text**; the only user input is the `query` string. Run through
`api.aggregate`.

Behaviour, each clause earned by a measurement above:

- **Check does not run below `READY`.** A `$search` against a building index returns `[]` with
  `code: "ok"`, so without the guard Check would report "no matches" for an index that is merely
  unfinished — converting a diagnostic into a new way to be misled. This is the single most
  important line in the section.
- **The path comes from the definition** when the index names fields, so Check cannot query a path
  the index does not map — which is the typo failure it exists to catch. For a `dynamic` index
  there is no such list, so the strip **asks** for one with a plain path input — not the full
  picker, because a card must not fire a discovery aggregate just by rendering, and one input is
  the whole of what the strip needs. **No wildcard path is emitted**, because that syntax is
  unverified here, and no path is ever guessed.
- **Zero rows is an outcome, not an error**, reported with the two explanations the `READY` guard
  leaves standing: the field is not in this index, or the value is not in the data.
- **A failed request is a third thing, and must not render as "No match".** If the aggregate
  throws — network, auth, a malformed definition — the strip says the check could not run. This
  clause was added after a Task 4 review found the first implementation collapsing a thrown error
  into an empty result: a feature whose entire purpose is to stop "no matches" being reported for
  a reason that is not a miss must not introduce a fresh way to do exactly that.
- **A `FAILED`-but-`queryable` index** — the still-serving case the panel already explains — may
  be checked. The card's existing notice directly above the strip already says the previous version
  is what is serving, so the strip does not repeat it.
- **Run is disabled until a required path is given.** On a dynamic index the strip asks for a path;
  without this, Run was live with an empty box and emitted `path: []`.

## 6. Components and stylesheet

**Reuse before promotion, promotion before invention.** Owner preference, 2026-08-31: use the
design system rather than building a new component in place.

- **The preset row is the existing `Segmented`** (`src/mdh/components/ImportControls.tsx`) — a
  segmented single-choice control with `role="group"` and `aria-pressed` per option, already used
  by six files. Nothing new is built for it, and it is rendered with the **`tabs`** variant, the
  same one `ImportWizard` and `ExportWizard` pass, so the modal does not introduce a second control
  style beside the wizards'.
- **`CopyButton` is added to `src/ui/`**, because the system genuinely lacks it: the
  copy-then-tick button is hand-rolled in seven places today. Its consumer is `IndexCard`, whose
  private `handleCopy` is deleted. (It was added for the query snippet as well; that block is gone,
  so `IndexCard` is now its only call site — still a real consumer, so the primitive stays.) The
  other five call sites are left alone — unrelated refactoring.
- **`Segmented` itself belongs in `src/ui/`** and is not moved here; six import sites make that a
  change of its own. Recorded as an observation, not a task.

`SearchIndexBuilder.module.css` holds the arrangement of the preset row, picker row, snippet block
and check strip, plus the small amount of presentation those two blocks genuinely own — the snippet
`<pre>`'s code surface and the check strip's separator and error colour. An earlier draft of this
section claimed the file was "layout only"; that stopped being true once the snippet block landed,
and the file's own header now says so. Two repo rules apply: **no bare single-letter class
names**, and a module rule outranks the monolith at equal specificity, so the module must not own
anything a call site sizes.

## 7. Backward compatibility

The property that matters most: **this writes no state it would ever have to migrate.** A preset
produces an ordinary V2 definition — no marker, no extra key, no extension-specific metadata. An
index created here is indistinguishable from a hand-written one, so a later build, a different
tool or a hook reads it normally.

- **No transport change.** `listSearchIndexes`, `putSearchIndex`, `deleteSearchIndex` untouched.
- **Anything writable today stays writable** — the editor is still the only submitted artifact, so
  no definition becomes unexpressible.
- **Existing definitions are never rewritten by a click** — presets are absent in Edit mode.
- **Legacy `{indexName, mappings}` paste tolerance is untouched** (`splitPastedDefinition`).
- **Both casings still render**, and presets emit camelCase, which V2 accepts.
- **The house analyzer name is left alone.** The folded analyzer takes a new name, so an existing
  index carrying `default_whitespace_lowercase` is never reinterpreted, and `defaultPreset()`
  reproduces it byte-for-byte rather than approximating it.
- **Check is read-only** — one aggregate, three stages, no writes.
- **Slash-named collections** behave exactly as now: reported, not hidden.
- **`IndexPanel` is untouched.** `IndexCard`'s new props are optional and default off, the way
  `notice`/`summary`/`onEdit` were added in the V2 migration. (An earlier draft of this spec said
  `IndexCard` has three consumers including `StagesView`; a grep during Task 4 found exactly two
  import sites, `SearchIndexPanel` and `IndexPanel`. Corrected here rather than left to mislead.)

## 8. Tests

**`tests/mdh-search-index-presets.test.ts`** — new, pure:
- `defaultPreset()` matches the definition read off a real `READY` index, including the inline
  analyzer, both top-level analyzer keys, and the exact char mapping.
- `fuzzyPreset()` emits `dynamic: false`, one entry per field, and exactly one analyzer.
- The folded analyzer's name differs from `default_whitespace_lowercase` — asserted directly,
  because the whole point is that the two must not collide.
- `exactAlternate` puts the keyword analyzer under `multi.exact` and nowhere else.
- **No preset ever emits `allowAnalyzedField`, and no emitted path ends in `.exact`** — the two
  forms the 400 and its bad advice would produce.
- `fields: []` yields no `fields` key.

**`tests/mdh-search-index-check.test.ts`** — new, pure:
- `indexedPaths` reads both casings and returns `[]` for a dynamic mapping.
- `checkPipeline` returns exactly `$search`, `$limit`, `$addFields` — asserted on the **stage keys
  of the returned array**, not on file text. CLAUDE.md records that a guard naming files by
  extension goes blind the moment a file is renamed; asserting on the builder's output cannot.
- A `value` containing `$` or a stage-shaped object stays a string in `text.query` and never
  becomes a stage.

**`tests/mdh-search-index-panel.test.tsx`** — additions:
- A preset click rewrites the editor; Edit mode renders no presets.
- Create mode opens with "Whole-word match" selected AND its definition in the editor; submitting
  untouched sends the full house-analyzer definition, not a bare dynamic mapping.
- The preset row renders with `Segmented`'s `tabs` variant, the same one the import and export
  wizards use.
- A dirty editor raises the INLINE confirmation before replacement — never `confirmModal`, which
  would replace the modal itself — and both entry points are covered: a preset chip and a
  field-picker change.
- Check is absent below `READY` and present at `READY`.
- A discovery rejection leaves a usable free-text path input.

Two repo constraints apply directly. `tests/dead-code.test.ts` fails on an export nothing imports,
so every new export lands in the same commit as its first consumer — `searchIndexCheck.ts` must
not be written a task ahead of the card that calls it. And a component test mocking `JsonEditor`
must have the stub assign `editorRef.current`, or every modal submit short-circuits as "Invalid
JSON" and the preset assertions pass vacuously.

## 9. Usage

One new event, `sa_mdh_search_index_check`, in `EVENT_NAMES` **and** in `PRIVACY.md` in backticks —
a test enforces the pairing. Name-only by construction, like every other event. The presets get no
event: what would be learned does not justify a second line in a privacy document.

**Default is to add it**, and dropping it removes one line from each of the two files with no
other consequence. Flagged because a privacy document is not a place to add lines casually, not
because the design is undecided.

## 10. Out of scope

The tabbed Guided/JSON builder (offered, declined). Synonym sets. Autocomplete, `storedSource` and
`numPartitions` presets. Any change to the transport, the reconcile poll, or the card layout beyond
the Check strip. Creating a `default` index for collections that have none — the gap is real and
recorded in §2, but fixing it is a separate decision about writing to an org on the user's behalf.

## Addendum — modal layout shift (2026-09-07)

This modal's card grew 591 -> 850 px between the Custom and Whole-word tabs, moving the
tab row 129 px, because the JSON editor grows with its document and a vertically centred
card that grows moves its own top edge. Fixed for both index modals at once by
`<ModalBody stable>` + `<ModalActions footer>` + JsonEditor's `fill`; measurements and the
reasoning are recorded once, in section 7b of
`2026-09-01-mdh-regular-index-guidance-design.md`.
