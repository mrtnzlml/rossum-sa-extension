# Modal header and field rhythm — design

**Date:** 2026-09-07
**Status:** shipped (uncommitted)
**Scope:** `src/ui/Modal.*` (all modal consumers) plus grouped fields in the two index
modals and the import and export wizards.

## 1. Why

The owner: the modal header has *"too big vertical spaces, not very clearly readable
design"*. Measured in Chrome against the built component, 800 px card, light theme,
placeholder data:

| | measured | |
|---|---|---|
| Card top → first real choice | 177 px | on a title, one 26 px input and two 17 px labels |
| Header | 50 px | padding `14px 18px` |
| Title | 14 px / 600 | two points above body text — a heading only technically |
| Field label contrast | **4.21 : 1** | 11 px `--text-secondary` on `--bg-card`; the 4.5:1 floor applies at this size |
| Close button | **20 × 20 px** | a bare glyph, no padded hit area, furthest corner |
| Label → its own control | **16 px** | the body's 12 px section gap plus the label's 4 px margin |

That last row is the finding that mattered. A label and its control are separate children
of `.body`, so the body's *section* gap lands between them: the label sits as far from the
input it names as from the section above it. Several call sites then pinned a
`style="margin-top:8px"` or `10px` on the next label to claw back the grouping by hand.

## 2. What was offered

Three options, reproduced at the component's own measured values and published for the
owner to choose from (artifact "Index Header Specimens"):

- **A · Tightened** — same anatomy, corrected metrics and grouped fields. −45 px.
- **B · Labels beside their controls** — horizontal form rows, collection named in the
  header. −84 px.
- **C · Header as the control bar** — title plus the Name field in the bar. −120 px.

**The owner chose A**, and asked for the same principle in the import and export modals.

Two of the six findings are defects rather than taste (label contrast, close target), so
all three options fixed them and they were never part of the choice.

## 3. What shipped

**Shared, in `src/ui/Modal.module.css` and `Modal.tsx`** — so every modal consumer gets it,
which is what "the same principle everywhere" means:

- `.header` padding `14px 18px` → `8px 12px 8px 18px`. Asymmetric on purpose: 18 px left to
  line up with the body, 12 px right so the close button's 28 px box still reads as an 18 px
  inset. Header 50 → **45 px**.
- `.title` 14 → **15 px**, `letter-spacing: -0.008em`.
- `.close` → a **28 × 28** grid-centred target with `--radius`, a `--bg-hover` hover surface
  and a 17 px glyph. This is now the tallest thing in the bar, so **it, not the padding,
  sets the 45 px header height** — a readable dismiss target is why the header stops
  shrinking where it does.
- `.fieldLabel` → `--text-primary` at 600 weight with `0.015em` tracking (4.21 → **17.25 : 1**);
  margin-bottom 4 → 3 px. Weight and tracking now carry the "this is a label" job the
  lighter colour was doing.
- `.body` padding `16px 18px` → `12px 18px 16px`; gap 12 → **10 px**.
- **New `ModalField`** (`.field`, plus `.fieldGrow` for `grow`) — a label and its control as
  one element, so the body's gap cannot land between them. `grow` is for the one field whose
  control absorbs the card's spare height under `<ModalBody stable>`; without its
  `min-height: 0` the group cannot shrink and the editor inside grows the card instead.
- `.import-wizard { gap: 14px }` deleted from `console.css` — the last outlier against the
  shared rhythm.

**Per modal**, converted to `ModalField` and stripped of hand-placed label margins: the two
index create modals, `ImportWizard`, `ExportWizard`. The export wizard's "no filter is
active" note also moved *inside* the Scope field — it explains why that field's "Current
filter" option is disabled, so between two fields it belonged to neither.

## 4. Measured result

Same conditions as §1. Every modal: header **45 px**, close **28 × 28**, title 15/600,
labels **17.25 : 1**, label → control **16 → 3 px**.

| Modal | before | after | |
|---|---|---|---|
| Create Index | top → tabs 177 px | **133 px** | card stays 720 (stable height) |
| Create Search Index | top → tabs 178 px | **133 px** | card stays 720 |
| Export | card 595 px | **530 px** | first control 100 → 78 px |
| Import (pick stage) | card 252 px | **235 px** | first control 67 → 58 px |

The stable-height contract from `2026-09-01-mdh-regular-index-guidance-design.md` §7b still
holds with the editor inside a `ModalField grow`: across every preset tab, both index modals
measure card top 140, height 720, tab row 273 and submit button 818 — single values, no shift.

## 5. Deliberately not done

**Five modal consumers keep ungrouped labels**: `BulkUpdate`, `BulkDelete`, `ImportConfirm`,
`RecordEditor`, `PdfDialog`. They are shaped differently — PdfDialog's label heads five
sibling radio rows — so grouping them is a structural edit outside what was asked for. They
still get every shared improvement, and the tighter gap means their label → control distance
is 13 px rather than today's 16, so nothing is left worse. Converting them is the obvious
follow-up.

## 6. What the tests can and cannot see

jsdom has no layout, so the suite guards the *structure* and the *rules*, and the geometry
above was measured in Chrome through a `file://` harness that mounts the real components
against the real stylesheet:

- `ModalField` groups label and control in one element, omits the label node when unlabelled,
  applies `grow` only where asked, and keeps a caller's class.
- The four converted modals each keep their labels grouped with the named control, and the
  search modal's Definition field — and only it — carries `grow`.
- The rules the classes depend on still exist: `.field` column direction, `.fieldGrow`
  `min-height: 0`, `.fieldLabel` on `--text-primary`, `.close` at 28 × 28.
- No `ModalFieldLabel` in the four converted files carries a hand-placed `margin-top`.

All ten guards were mutation-tested: each was reverted individually and confirmed to fail.
Two of the ten initially failed to fail — one because the mutation never applied (a regex
that missed a Prettier-wrapped prop) and one because nothing asserted the `grow` opt-in at
all. Both were fixed and re-verified.
