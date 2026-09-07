# MDH regular indexes — guidance, presets and wildcard-aware redundancy

**Date:** 2026-09-01
**Sibling:** `2026-08-31-mdh-fuzzy-index-builder-design.md`, which did the same job for Atlas
**search** indexes and shipped in `dc2560f`. This is the regular-index counterpart. It reuses that
work's components — `Segmented` (tabs), `MatchKeyPicker`, `discoverLeafPaths` — and deliberately
does NOT copy its Check action; §2 explains why that is not available here.
**Status:** proposed.
**Owner decisions:**
- Asked for "a similar upgrade but for the regular indexes", after the search-index work landed.
- Standing: "Preserve as much as possible of the current functionality"; "Always consider
  backward compatibility"; "Never leak customer names or customer data"; "Do not make any
  assumptions. All decisions must be verified first and grounded in facts."

## 1. What changes, in one paragraph

The Indexes panel gains **presets and a field picker** in its Create modal, replacing the
`{"indexName": "my_index", "keys": {"field": 1}, "options": {}}` placeholder you currently type
over; a **one-line statement of what the collection already has**, because some collections carry
a hidden wildcard index and some carry nothing but `_id_` and nothing on screen says which; and
**wildcard-aware redundancy**, so an index the wildcard already covers is finally flagged. There
is no Check action — the API cannot support an honest one, and §2 shows the measurements that
settle it. No endpoint and no stored shape changes.

## 2. Verified facts this design rests on

Probed live on 2026-09-01 against `elis.rossum.ai` (Rossum's own dashboard, organization 1) with
an org-admin token. Read-only checks ran against existing collections; the one write probe used a
throwaway collection created and dropped inside the run, and the organization began and ended with
the same 21 collections. No customer organization was touched. Field and collection names observed
during probing are Rossum's own internal test data and are **deliberately not reproduced here** —
findings are stated by shape.

### The Check analogue is not available, and this is why

**`$indexStats` is blocked.** `{"$indexStats": {}}` returns HTTP 400,
`not authorized on <db> to execute command`. So "this index has served N queries" — the single
most valuable thing an index panel could say, and the natural counterpart to the search-index
Check — cannot be built. This confirms a prior note rather than discovering it.

**`explain` is refused.** Passing `{"explain": true}` as an aggregate option returns HTTP 400,
`The explain option is not supported. Use AsyncDatabase.command instead.` Data Storage exposes no
raw `command` endpoint, so there is no route to it. "Will my query use this index?" therefore
cannot be answered on demand.

**`$planCacheStats` works, and is richer than expected — but is opportunistic.** It returns, per
cached query shape: the originating query and sort, the `cachedPlan` including `IXSCAN`/`FETCH`
stages and the chosen `indexName`, `candidatePlanScores`, and full `creationExecStats` with
`totalKeysExamined`, `totalDocsExamined` and `nReturned`.

Its limit is what makes it unsuitable as a Check: **the plan cache only holds shapes for which the
planner had to choose between multiple candidate plans.** A `find` with a sort, and an aggregation
pipeline, both run during the probe and neither produced an entry. Two entries existed, both from
real hook traffic. So the cache is a record of what happened to be interesting, not a diagnostic
anyone can run against a query they are about to ship.

### Every collection does not have the same indexes, and nothing says so

**Some collections carry a hidden wildcard index `__dynamic_index` on `{"$**": 1}`; others carry
only `_id_`.** Measured across seven collections:

| indexes present | collections observed |
|---|---|
| `_id_` + `__digest_md5_idx` + `__dynamic_index` | three master-data-shaped collections |
| `_id_` + `__dynamic_index` | one memorization-shaped collection |
| `_id_` only | a `PROD_`-prefixed collection, the extension's own Architect collection, and a collection created by `insert` |

**What creates `__dynamic_index` is NOT established.** It is present on collections associated
with MDH matching and absent from ones created through plain Data Storage — including
`collections/create`, which the extension's own sidebar uses — but the probe did not identify the
trigger. Stated as an observation, not a rule.

**The consequence is the point.** Where the wildcard exists, every scalar path is already indexed
individually, so a hand-made single-field index adds nothing. Where it does not, the collection has
no index but `_id_` and **every query is a full collection scan**, with nothing on screen saying
so. That is the direct counterpart of the search-index finding that a collection created by
`insert` has no search index at all.

**A wildcard index serves one field per plan, and the rest is fetch-and-filter.** A real cached
hook query with two predicates produced an `IXSCAN` on `__dynamic_index` for one field and a
`FETCH` stage filtering the other, examining **420 documents to return 8 rows**. A second shape
examined 229 keys and 74 documents to return 39. This is measured, from real traffic.

### Creating indexes is trustworthy

**`indexes/create` honours its options.** `unique`, `expireAfterSeconds`,
`partialFilterExpression`, `sparse` and a compound key with a `-1` component all round-tripped
through `indexes/list` unchanged. **`unique` is genuinely enforced**, not merely stored: inserting
a duplicate returned `E11000 duplicate key error`.

**`sparse: false` is echoed back, and today's `plain()` treats that as a constraint.**
`redundantIndexNames` decides an index is plain with `CONSTRAINTS.every((c) => i[c] === undefined)`.
The probe sent `sparse: false` explicitly and `indexes/list` returned it, so such an index has
`sparse === false` — not `undefined` — and is read as constrained. The effect is only ever to skip
it from the redundancy analysis, which is the safe direction (never flagged, never wrongly
suggested for dropping), so this is a small accuracy gap rather than a bug. Worth fixing while the
function is open: test falsiness for the boolean constraints (`unique`, `sparse`, `hidden`) and
`undefined` for the value-carrying ones (`expireAfterSeconds`, `partialFilterExpression`,
`collation`), since `expireAfterSeconds: 0` is a legitimate TTL.

This matters because of a precedent in the sibling work: the deprecated search-index create
accepted `storedSource` and `numPartitions` with a 202 and silently discarded them. `indexes/create`
does **not** behave that way, so a TTL or unique preset can be trusted to do what it says.

### Not verified, stated rather than assumed

- **That a compound index would materially improve the 420-documents-for-8-rows query.** This
  follows from the observed plan shape and from how MongoDB's planner uses compound versus wildcard
  indexes, but it was **not measured on this cluster**. Measuring it honestly needs either a
  synthetic corpus large enough to be meaningful or an index added to a collection this probe was
  not authorized to modify. Confirm during implementation before the copy claims a benefit.
- **Equality-then-sort-then-range compound ordering.** Standard MongoDB guidance, not measured
  here. It informs the preset's field order; the preset must not claim a measured speedup.
- **What creates `__dynamic_index`**, as above.
- Whether a wildcard index can be created through `indexes/create` (`keys: {"$**": 1}`) — not
  attempted.

## 3. `src/mdh/indexDef.ts` — extend, do not replace

The module is already good and already pure. Two of its four exports are untouched
(`toCreateIndexDefinition`, `formatBytes`).

**`redundantIndexNames` becomes wildcard-aware.** Today it compares user indexes only against each
other: an index is redundant when it is a key-prefix of a fully-covering superset, and it is
already careful to exclude supersets that are `partial`, `sparse`, collated or `hidden`, since
those index a different document set. It has no notion of the wildcard index, so a single-field
index that `__dynamic_index` already covers is never flagged — which, given §2, is the most common
redundancy there is.

The addition: when a wildcard index (`classifyIndexType` already returns `'wildcard'` for it) is
present and itself plain, a **single-field, plain, non-`_id_`** index is redundant. Deliberately
narrow, and each exclusion is load-bearing:

- **Single-field only.** A wildcard index cannot serve a compound query the way a compound index
  can — §2 measured it fetch-and-filtering the second predicate — so a compound index is never
  redundant against it.
- **Plain only**, using the corrected falsiness test from §2 rather than today's
  `=== undefined`. `unique`, TTL, `partialFilterExpression`, `sparse` and `collation` all do
  something a wildcard index cannot do at all. A unique index that duplicates a wildcard's key is
  still the only thing enforcing uniqueness, and calling it redundant would invite someone to drop
  the constraint. This mirrors the existing `CONSTRAINTS`/`plain()` guard rather than inventing a
  second rule.
- **Sorts are not modelled.** A wildcard index is generally unable to provide a sort, so a
  single-field index created to serve one is arguably not redundant. The panel cannot know a
  query's sort, so this is a known false-positive source and the copy must say "redundant?" — the
  existing badge already carries the question mark, and it stays.

**One exported answer to "does a wildcard cover everything?" — `coveringWildcardIndex(indexes)`.**
This became the branch's main structural decision, after the question was answered wrongly, in a
different way, in three separate places. It returns the index that genuinely covers every scalar
path, or `null`, and it answers the WHOLE question rather than half of it:

- the key must be exactly one entry named exactly `$**` (a subpath wildcard `{"a.$**": 1}` covers
  only paths under `a`; a compound wildcard `{"tenant": 1, "$**": 1}` needs equality on `tenant`);
- it must carry no `wildcardProjection`, which restricts a wildcard to the projected paths;
- and it must be plain in the same sense the prefix rule already required — not partial, sparse,
  collated or hidden, since a hidden index serves no query at all.

All three consumers use it: `redundantIndexNames`, `collectionIndexSummary`, and the panel's
Lookup-key gate. The earlier `isWildcard` stays **private** and deliberately broad; it answers a
different question — "is this index itself wildcard-shaped, and therefore never itself flagged" —
where erring wide is the safe direction. Splitting these two questions across call sites is what
went wrong three times; a call site must not re-derive either.

**Service-managed indexes are never flagged redundant.** `redundantIndexNames` skips every name in
the service-managed set, not just `_id_`. Without this, `__digest_md5_idx` — key `{__digest_md5:
1}`, plain and single-field — was flagged `redundant?` beside an enabled Drop on any collection
carrying a wildcard, which is **three of the seven** probed in §2. That index backs the service's
change-detection, and the badge invited dropping it. Caught by the final review; it was new damage
introduced by the wildcard rule itself, since before it the digest index was a prefix of nothing.

**New: `collectionIndexSummary(indexes)`** returns the one line §4 renders, or `''` when there is
nothing worth saying. It needs to know which indexes the service manages — `_id_`,
`__dynamic_index`, `__digest_md5_idx` — but that set stays a module-private constant rather than a
second export: `tests/dead-code.test.ts` fails on an export nothing imports, and nothing outside
this module needs it. Names are matched literally; an unrecognised `__`-prefixed index counts as a
user index, which is the safe direction (it may be flagged, never silently hidden).

## 4. The panel

Unchanged: the card list, badges, sizes, Copy, Drop, the operation poll.

**A one-line summary under the toolbar**, the counterpart of the search-index panel's sync line,
answering the question the panel has never answered — what does this collection already have?

- Wildcard present: *"Every field is already indexed individually. A single-field index adds
  nothing here; compound keys, uniqueness, TTL and sorts still need their own."*
- Wildcard absent: *"No index but `_id_` — every query on this collection is a full scan."*

There is a **third** outcome, and it matters as much as the other two: **silence**. When a wildcard
is present but does not cover everything — a subpath, a projection-restricted or a hidden one —
neither sentence is true, so the panel says nothing. Both sentences are statements of fact about
someone's production data, and the standard this section is held to is that a wrong claim is worse
than no claim. The second sentence is the actionable one and is the reason this section exists.

**The Create modal** gains a preset row and a field picker, exactly as the search-index modal did
and reusing the same components — `Segmented` with `tabs`, and `MatchKeyPicker` over
`discoverLeafPaths`. Presets, each emitting `{indexName, keys, options}` into the editor which
remains the only thing submitted:

**The index name is its own input, not a JSON key** (2026-09-07). The editor holds only
`{keys, options}`, matching the search-index modal — the inconsistency was an artefact of the two
APIs (V2 puts the search-index name in the URL and 422s an `indexName` in the body, while
`createIndex` takes it as an argument), not a design choice. Three consequences:

- **Presets describe the definition only.** `IndexPreset` lost its `indexName`, and `suggestName`
  went with it. The name is **never auto-filled from a preset**, the same rule and the same reason
  as the search modal: a suggested name goes stale the moment the field selection changes, and a
  stale name is worse than an empty box.
- **Paste tolerance keeps saved snippets working.** A pasted `{indexName, keys, options}` — the
  shape this panel's own Copy emits, and the shape it used to submit — has its name lifted into the
  input rather than rejected, reusing the search modal's already-tested `splitPastedDefinition`.
  Copy still emits the full triple, so existing copy/paste round-trips unchanged.
- **The name guard runs before the keys guard**, so a submit with neither reports the missing name
  first.

**`Custom` is the first tab and the modal's default** (added 2026-09-01). It holds the minimal
template this panel shipped with — `{indexName: 'my_index', keys: {field: 1}, options: {}}` —
so the untouched Create path behaves exactly as it always did, and the generated presets are opt-in
rather than imposed. Selecting it hides the field picker (it generates nothing from fields) and,
critically, **must not trigger discovery**: Custom is the state the modal opens in, so treating it
like any other preset would fire an aggregate merely by opening the modal, which this panel has
never done.

| preset | keys | options | when |
|---|---|---|---|
| **Custom** | the shipped placeholder `{field: 1}` | `{}` | the default; hand-editing, no generated content |
| **Lookup key** | one field, `1` | none | offered unless a wildcard genuinely COVERS every field (`coveringWildcardIndex`) — a subpath, projection-restricted or hidden wildcard does not, and the preset stays useful there |
| **Matching cascade** | compound, picker order | none | the shape a matching query with several predicates needs |
| **Unique key** | one or more fields | `{unique: true}` | enforced, verified |
| **Expiring** | one date field, `1` | `{expireAfterSeconds: N}` | memorization-style collections that should not grow for ever |

**Presets only write into the editor**, carried over from the sibling work: the editor stays the
only thing submitted. The sibling's companion rule — no presets in Edit mode — has no counterpart
here, because **this panel has no Edit mode**: `IndexPanel` exposes only `openCreateModal`, and a
regular index cannot be altered in place. Stated so nobody adds a guard for a mode that does not
exist.

**Matching cascade orders its keys equality-first.** The picker preserves the order fields were
added, and the preset's help text says the order matters and why. It must not claim a measured
improvement — see §2's unverified list.

## 5. No Check action

Stated as a design decision rather than an omission. `$indexStats` is blocked and `explain` is
refused, so the two things a Check could honestly do are both unavailable. `$planCacheStats` is
readable but opportunistic — it holds only multi-candidate shapes, missed both probe queries, and
cannot be pointed at a query someone is about to ship.

A read-only "what the planner actually did" view is *possible* and is the one thing here worth
revisiting later. It is out of scope because it would be labelled Check, would be read as "this
index works", and would be silent precisely when a collection has no plan-cache entries at all —
which is the case for exactly the untouched, unindexed collections that most need attention.

## 6. Backward compatibility

- **No transport change.** `listIndexes`, `createIndex`, `dropIndex`, `collectionStats` untouched.
- **Anything creatable today stays creatable** — the editor remains the only submitted artifact.
- **`redundantIndexNames` only ever gains findings**, never loses them: the wildcard rule is
  additive to the existing prefix rule. An index flagged today is still flagged.
- **A new badge is a badge.** Nothing is auto-dropped, and Drop keeps its confirmation.
- **`IndexCard` is shared with the search-index panel.** Any prop added here defaults off, the way
  `onCheck` and `checkNeedsPath` did.
- **System indexes are recognised, not hidden.** `__dynamic_index` keeps its existing `wildcard`
  badge; the change is that the panel now explains it.

## 7. Tests

**`tests/mdh-index-def.test.ts`** — extend the existing pure tests:
- A single-field plain index is redundant when a plain wildcard index is present.
- A **compound** index is NOT redundant against a wildcard.
- A `unique` / TTL / `partialFilterExpression` / `sparse` / collated single-field index is NOT
  redundant against a wildcard — one case each, because each is a separate reason.
- A single-field index is NOT redundant when the wildcard is itself partial, sparse or hidden.
- An index carrying `sparse: false` IS treated as plain (the §2 correction), while one carrying
  `sparse: true` is not — the pair that proves the fix rather than just the happy case.
- `expireAfterSeconds: 0` still counts as a TTL constraint, so a falsiness test must not be
  applied to the value-carrying options.
- `_id_` is never flagged.
- The existing prefix-based findings are unchanged when no wildcard is present — the regression
  check that the rule is additive.
- `collectionIndexSummary` treats an unknown `__`-prefixed index as a user index, so a collection
  carrying only that one does NOT get the full-scan line — the safe direction, since claiming a
  scan that is not happening is worse than staying quiet.

**`tests/mdh-index-panel.test.tsx`** — the summary line renders the wildcard-present and
wildcard-absent copy from the index list; presets write into the editor and never POST; Edit mode
renders no presets; the Lookup key preset is withheld when a wildcard is present.

**Mutation-test the redundancy additions.** The rule's whole value is in its exclusions, and an
exclusion nobody has watched fail is not an exclusion. For each of the `unique`/TTL/partial/sparse
cases, remove the guard, confirm the test fails, restore.

## 7a. Two presets build a single-field index

`lookupKeyPreset` and `expiringPreset` use only the FIRST field picked and discard the rest —
`usable(fields).slice(0, 1)` and `ascending([field])` respectively. For **Expiring** that reflects a
real constraint (a TTL index cannot be compound; `expireAfterSeconds` is only valid on a
single-field index — asserted from MongoDB's own rules, **not** measured against this cluster). For
**Lookup key** it is the preset's definition: a lookup key is single-field by design.

**Closed 2026-09-07, structurally.** An explanatory note was built first and rejected by the
owner — *"it's nice to say it but users don't read"* — which is the right call: the note described
a state the UI still let you reach, and left the control inviting the very action it discards. Its
placeholder read **"Add another field…"**. So the fix makes the state unreachable instead:

- `MatchKeyPicker` takes a `single` prop. Picking a field REPLACES the selection rather than
  appending to it, so the chips can never show a field the index does not use. Its placeholders go
  singular (*"Pick one field…"* / *"Replace the field…"*), and the suggestion list stops filtering
  out the current selection, since re-picking it is a harmless no-op rather than an "add".
- `isSingleFieldPreset(preset)` in `indexPresets.ts` is the single answer to which presets that
  applies to (`lookup`, `expiring`), consumed by the panel — the same
  one-exported-answer shape as `coveringWildcardIndex`.
- `fieldRowLabel(preset)` replaces the fixed *"Fields, in query order"* heading with
  *"Date field to expire on"* / *"Field to index"*. A plural label over a one-field control is
  part of the same invitation.
- Switching from a multi-field preset to a single-field one **truncates the picked fields**, so
  the extra chips visibly disappear. The disappearance is the explanation, and it needs no reading.
- `singleFieldNote` and its tests are deleted.

This also keeps the earlier decision intact for free: nothing user-facing now claims *why* a TTL
index cannot be compound, since nothing user-facing explains anything. That claim is a MongoDB
rule this repo has never verified against the live cluster.

Every guard here was mutation-tested — the replace-not-append branch, the placeholder, the label,
the truncation on switch, the panel actually passing `single`, and the unfiltered suggestion list.
Each was reverted individually and confirmed to fail a test.

**Deliberately NOT changed: the TTL duration.** `expireAfterSeconds` defaults to `2592000` in the
Expiring preset. That was raised as a second silent-behaviour case and the owner correctly rejected
it — *"the 'expireAfterSeconds' is clearly visible in the config so users can change it"*. A
displayed, editable default is categorically different from the truncation, where three visible
chips contradicted the one field actually used.

## 7b. The modal holds its size (2026-09-07)

Both create modals jumped as the user worked. Measured in Chrome at 1440x1000 with
placeholder data, before any change:

| | card height | tab row moves | Create button moves |
|---|---|---|---|
| Regular index | 551 -> 661 px | **56 px** | 56 px |
| Search index | 591 -> 850 px | **129 px** | 129 px |

Two compounding causes, neither of them the tabs' fault:

- **The JSON editor grows with its document.** `.json-editor { flex: 1 }` never resolves
  because no ancestor has a definite height, so the editor is as tall as the JSON in it —
  measured 250 px on Custom, 398 on Fuzzy, 509 on Whole-word. The preset supplies the
  growth; the modal just follows.
- **The card is vertically centred** (`.overlay { align-items: center }`), so a card that
  grows by N moves its own top edge up by N/2. Everything ABOVE the growth — the name
  field, the tab row the user is aiming at — moves too. Hence "jumps around" rather than
  "grows".

The fix gives the card a stable height and lets the one flexible child absorb every
change, rather than reserving space per conditional block (which would have meant a
different reservation for each of the five tabs, plus empty space under Custom):

- `Modal.module.css` gains `.card:has(.stableBody) { height: min(85vh, 720px) }` and
  `.stableBody { flex: 1; min-height: 0 }` — opt-in via `<ModalBody stable>`, so the
  other consumers keep hugging their content. `min-height: 0` is load-bearing: without it
  the body cannot shrink below its content and the flexible child never resolves.
- `JsonEditor` gains `fill`, adding `json-editor-fill`, whose only rule is
  `.cm-editor { min-height: 0 }`. That lets the editor take the height it was GIVEN, and
  hands the overflow to CodeMirror's own `.cm-scroller`. It is an opt-in, not a change to
  the generic rule, because JsonEditor's stage-scroll code depends on the outer
  `.json-editor` being the scroller in the Stages layout.
- `<ModalActions footer>` moves the buttons OUT of the scrolling body and pins them as a
  card-level flex child (the render function's children are card children, so a
  body/actions fragment gives header - scrolling body - fixed footer). Without this the
  buttons still moved on short viewports, where the editor bottoms out at its floor and
  the body starts scrolling — and at 577 px they sat below the fold.
- The editor's floor drops from 250 px to 160 px in these two modals, so short viewports
  degrade by scrolling less.

After, at 1440x1000, 1440x700 and 1440x577, across 13 states (five presets, the field
picker filling, chips accumulating, the truncation on switch, an error hint appearing):
**card top, card height, tab row and both buttons are identical in every state at every
viewport.** The editor absorbs it all — 410/327/324/300 px across the regular modal's
tabs — and scrolls internally when a definition is longer than the space (measured 178,
302, 406 px of internal range on the search modal).

Not tested in jsdom, which has no layout. What the suite guards is the STRUCTURE that
produces the result: the body carries the stable class, the actions are a sibling of the
body rather than its child, the editor gets `fill`, and the three CSS rules those classes
name still exist. All nine of those guards were mutation-tested.

## 8. Out of scope

A read-only plan-cache view (§5). Creating wildcard indexes. Index hints. Anything that drops an
index automatically. Migrating `Segmented` into `src/ui/`, still recorded as an observation in the
sibling spec.
