# Coupa Field Names Feature — Design Spec

## Goal

Display Coupa API field names as small overlays next to form labels on all Coupa pages (invoices, POs, requisitions, suppliers, etc.), matching the existing NetSuite field names feature. This helps SAs identify the correct API field names when building Rossum-Coupa integrations.

## Two DOM patterns in Coupa

Coupa has two page rendering patterns:

### 1. React pages (invoices, possibly newer modules)

- Embed `<script id="initial_full_react_data">` containing JSON with field metadata
- Each field entry has `label` (display name) and `name` (API field name)
- Labels live in `<dt class="label_readonly">` or `<dt class="group_label">` inside `<dl>` elements
- Metadata covers `header_section`, `lines_section`, and `summary_section`

Example JSON structure:
```json
{
  "metadata": {
    "header_section": {
      "supplier": { "name": "supplier", "label": "Supplier" },
      "invoice_number": { "name": "invoice_number", "label": "Invoice #" },
      "currency": { "name": "currency_id", "label": "Currency" }
    },
    "lines_section": {
      "lines": [{
        "description": { "name": "description", "label": "Description" },
        "price": { "name": "price", "label": "Price" }
      }]
    }
  }
}
```

### 2. Rails server-rendered pages (POs, older modules)

- No JSON metadata
- Labels live in `<span class="group_label label_readonly">` or `<label class="group_label">` inside `<div class="form_element">`
- Field identifiers available via:
  - `id` attributes: `order_header_readable_status`, `order_line_92548_uom`
  - `s-` CSS classes on data elements: `s-readable_status`, `s-local_version_created_at`
  - Semantic CSS classes: `orderLineQuantity`, `orderLinePrice`, `orderLineItem`

## Extraction strategy (ordered by priority)

1. **JSON metadata** — parse `#initial_full_react_data`, build label-to-API-name map, annotate `<dt>` elements
2. **Element IDs** — strip `order_header_` or `order_line_NNNNN_` prefix from `id` attributes on data elements
3. **CSS classes** — extract `s-` prefixed classes or semantic classes like `orderLineQuantity` from form elements, convert camelCase to snake_case

## Files to create/modify

| File | Action | Purpose |
|------|--------|---------|
| `src/coupa/index.js` | Create | Content script with extraction logic |
| `manifest.json` | Modify | Add content script for `*.coupacloud.com/*` |
| `build.js` | Modify | Add `scripts/coupa` entry point |
| `src/popup/popup.html` | Modify | Add Coupa card with toggle, marked as "beta" |
| `src/popup/popup.js` | Modify | Add `coupaFieldNamesEnabled` to `STORAGE_TOGGLES`, add Coupa context dimming |
| `src/popup/popup.css` | Modify | Add `.beta-badge` style |

## Content script design (`src/coupa/index.js`)

```
chrome.storage.local.get → check coupaFieldNamesEnabled
  → injectStyles()
  → tryJsonMetadata()     // returns Map<label, apiName> or null
  → annotateJsonLabels()  // if map exists, annotate <dt> elements
  → annotateRailsLabels() // always run: find .form_element, extract from id/class
```

### JSON extraction

Parse `#initial_full_react_data`. Walk `metadata.header_section`, `metadata.lines_section.lines[0]`, and `metadata.summary_section.tax_lines`. For each field object with both `label` and `name`, add to a `Map<string, string>`.

Custom fields have a different shape (contain `field_name`, `col_name`, `label`, `key` properties) but still have `name` — same extraction works.

### Rails fallback extraction

For each `.form_element` container:
1. Find the label element (`span.group_label` or `label.group_label`)
2. Try to extract a field name from:
   - Child element `id` matching `/^(?:order_header|order_line)_(?:\d+_)?(.+)$/`
   - `s-` CSS classes on the container or children (filtering out generic UI classes)
   - Semantic classes like `orderLineQuantity` → `quantity`
3. Convert camelCase to snake_case
4. Skip if already annotated (avoid duplicates)

### Generic class exclusion list

Classes to ignore when scanning `s-` prefixes: `header`, `data`, `hidden`, `sectionContent`, `expandableArrow`, `expandableSection`, `coupaSimpleTooltip`, `readOnlyContent`, `label_readonly`, `mainContent`, `primaryNavBar`, etc.

### Display

Append a `<span>` with the field name, using the same visual treatment as NetSuite:
```css
.rossum-sa-extension-coupa-field-name {
  color: red;
  font-size: 10px;
  opacity: .7;
  text-transform: lowercase;
}
```

Style is injected only when the feature is enabled (same pattern as NetSuite).

## Popup UI

Add a new `<section class="card" data-context="coupa">` between NetSuite and the footer. Contains one toggle: "Field names" with hint "Show API field names on form labels". Section title: "Coupa" with a beta badge.

Beta badge style: small inline label, light background, muted text.

Context dimming: dim the Coupa card when not on a `*.coupacloud.com` page, and dim non-Coupa cards when on Coupa.

## Manifest

Add new content script entry:
```json
{
  "js": ["scripts/coupa.js"],
  "matches": ["https://*.coupacloud.com/*"]
}
```

## Build

Add entry point to `build.js`:
```javascript
'scripts/coupa': 'src/coupa/index.js'
```

## Version

No version bump needed — this is a new feature in development.
