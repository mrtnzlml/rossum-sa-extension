# MDH Preact Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Dataset Manager (MDH) standalone page from imperative vanilla JS to Preact with signals, replacing ~3,250 lines of manual DOM manipulation with declarative components.

**Architecture:** Full rewrite of `src/mdh/` UI. Global state moves from a custom event emitter to `@preact/signals`. The current 12 UI files become ~22 focused Preact components + 3 custom hooks. `api.js` and `cache.js` are unchanged. No changes outside `src/mdh/`.

**Tech Stack:** Preact, @preact/signals, CodeMirror 6 (existing), JSON5 (existing), esbuild (existing)

**Spec:** `docs/superpowers/specs/2026-04-10-mdh-preact-migration-design.md`

---

## File Map

### New files to create

| File | Responsibility |
|---|---|
| `src/mdh/store.js` | Global signals (domain, token, collections, selectedCollection, records, skip, limit, activePanel, loading, error, modalContent) |
| `src/mdh/index.jsx` | Boot: read chrome.storage, init API, render `<App>` |
| `src/mdh/components/App.jsx` | Layout shell: sidebar + resizer + main area with conditional panels |
| `src/mdh/components/Sidebar.jsx` | Collection list, create/rename/drop actions |
| `src/mdh/components/SidebarResizer.jsx` | Drag-to-resize sidebar, persists width |
| `src/mdh/components/ConnectionBar.jsx` | Connected/disconnected status line |
| `src/mdh/components/ErrorBanner.jsx` | Dismissable error display |
| `src/mdh/components/LoadingOverlay.jsx` | Spinner overlay |
| `src/mdh/components/TabBar.jsx` | Data / Indexes / Search Indexes tab switcher |
| `src/mdh/components/Modal.jsx` | Modal overlay + confirmModal/promptModal helpers |
| `src/mdh/components/JsonEditor.jsx` | Preact wrapper around CodeMirror 6 |
| `src/mdh/components/IndexCard.jsx` | Shared expandable card for index display |
| `src/mdh/components/IndexPanel.jsx` | Indexes tab: list + create + drop + status |
| `src/mdh/components/SearchIndexPanel.jsx` | Search indexes tab: list + create + drop + status |
| `src/mdh/components/DataPanel.jsx` | Split pane orchestrator: pipeline left, records right |
| `src/mdh/components/PipelineEditor.jsx` | Left pane: JsonEditor + save/history/beautify actions |
| `src/mdh/components/PlaceholderInputs.jsx` | Variable inputs extracted from pipeline text |
| `src/mdh/components/PipelineDebug.jsx` | Stage-by-stage aggregation debug with counts |
| `src/mdh/components/RecordList.jsx` | Record cards + empty state |
| `src/mdh/components/RecordCard.jsx` | Single expandable record with copy/edit/delete |
| `src/mdh/components/JsonTree.jsx` | Recursive interactive key/value tree |
| `src/mdh/components/DeleteMany.jsx` | Delete-many modal content |
| `src/mdh/components/RecordEditor.jsx` | Edit/replace single record modal |
| `src/mdh/components/DataOperations.jsx` | Insert/update/replace modals (manual + file) |
| `src/mdh/components/QueryHistory.jsx` | History + saved query dropdown panels |
| `src/mdh/hooks/usePipeline.js` | Pipeline text, sort/filter/placeholder state |
| `src/mdh/hooks/useQuery.js` | Query execution, caching, stale detection |
| `src/mdh/hooks/usePagination.js` | Skip/limit/page navigation, total count |

### Files to modify

| File | Change |
|---|---|
| `build.js` | Add JSX pragma, update MDH entry point path |
| `package.json` | Add preact, @preact/signals dependencies |
| `src/mdh/mdh.html` | Simplify to mount point |
| `src/mdh/mdh.css` | Remove `.hidden` usages, dead selectors |

### Files to delete (after migration complete)

| File | Replaced by |
|---|---|
| `src/mdh/index.js` | `src/mdh/index.jsx` |
| `src/mdh/state.js` | `src/mdh/store.js` |
| `src/mdh/ui/sidebar.js` | `components/Sidebar.jsx` |
| `src/mdh/ui/records.js` | `components/DataPanel.jsx` + children + hooks |
| `src/mdh/ui/record-editor.js` | `components/RecordEditor.jsx` + `DataOperations.jsx` |
| `src/mdh/ui/modal.js` | `components/Modal.jsx` |
| `src/mdh/ui/indexes.js` | `components/IndexPanel.jsx` |
| `src/mdh/ui/search-indexes.js` | `components/SearchIndexPanel.jsx` |
| `src/mdh/ui/index-card.js` | `components/IndexCard.jsx` |
| `src/mdh/ui/json-editor.js` | `components/JsonEditor.jsx` |
| `src/mdh/ui/delete-many.js` | `components/DeleteMany.jsx` |
| `src/mdh/ui/query-history.js` | `components/QueryHistory.jsx` |
| `src/mdh/ui/utils.js` | Inlined into panel components |

### Files unchanged

| File | Reason |
|---|---|
| `src/mdh/api.js` | Pure fetch wrapper, no DOM coupling |
| `src/mdh/cache.js` | In-memory LRU, no DOM coupling |

---

## Task 1: Install dependencies and configure build

**Files:**
- Modify: `package.json`
- Modify: `build.js`

- [ ] **Step 1: Install preact and signals**

```bash
npm install preact @preact/signals
```

- [ ] **Step 2: Update build.js with JSX pragma and new entry point**

In `build.js`, change the options object to add JSX settings and update the MDH entry point:

```js
const options = {
  entryPoints: {
    'scripts/rossum': 'src/rossum/index.js',
    'scripts/netsuite': 'src/netsuite/index.js',
    'scripts/coupa': 'src/coupa/index.js',
    'popup/popup': 'src/popup/popup.js',
    'mdh/mdh': 'src/mdh/index.jsx',
  },
  bundle: true,
  minify: true,
  outdir: 'dist',
  format: 'iife',
  logLevel: 'info',
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
};
```

- [ ] **Step 3: Verify build still works for non-MDH entry points**

```bash
npm run build
```

Expected: Build succeeds. MDH entry point will fail (file doesn't exist yet) — that's fine. The other 4 entry points (rossum, netsuite, coupa, popup) should bundle without errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json build.js
git commit -m "add preact and signals dependencies, configure JSX in esbuild"
```

---

## Task 2: Create store.js and simplify mdh.html

**Files:**
- Create: `src/mdh/store.js`
- Modify: `src/mdh/mdh.html`

- [ ] **Step 1: Create store.js with global signals**

```js
// src/mdh/store.js
import { signal } from '@preact/signals';

export const domain = signal('');
export const token = signal('');
export const collections = signal([]);
export const selectedCollection = signal(null);
export const records = signal([]);
export const skip = signal(0);
export const limit = signal(50);
export const activePanel = signal('data');
export const loading = signal(false);
export const error = signal(null);
export const modalContent = signal(null);
```

- [ ] **Step 2: Simplify mdh.html to a mount point**

Replace the entire contents of `src/mdh/mdh.html` with:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Data Storage — Rossum SA</title>
  <link href="mdh.css" rel="stylesheet" />
</head>
<body>
  <div id="app"></div>
  <script src="mdh.js"></script>
</body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add src/mdh/store.js src/mdh/mdh.html
git commit -m "add signal-based store and simplify MDH HTML to mount point"
```

---

## Task 3: Create Modal, JsonEditor, and IndexCard — shared leaf components

These three components have no dependencies on other new components and are used widely. Build them first.

**Files:**
- Create: `src/mdh/components/Modal.jsx`
- Create: `src/mdh/components/JsonEditor.jsx`
- Create: `src/mdh/components/IndexCard.jsx`

- [ ] **Step 1: Create Modal.jsx**

Port from `src/mdh/ui/modal.js`. The modal overlay is driven by the `modalContent` signal. Includes `closeModal()`, `confirmModal()`, and `promptModal()` helper exports.

```jsx
// src/mdh/components/Modal.jsx
import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { modalContent } from '../store.js';

export function closeModal() {
  modalContent.value = null;
}

export function confirmModal(title, message, onConfirm) {
  modalContent.value = {
    title,
    render: () => (
      <div class="modal-body">
        <p class="modal-message">{message}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" onClick={closeModal}>Cancel</button>
          <button class="btn btn-danger" onClick={() => { closeModal(); onConfirm(); }}>Confirm</button>
        </div>
      </div>
    ),
  };
}

export function promptModal(title, { placeholder, initialValue, submitLabel, submitClass }, onSubmit) {
  modalContent.value = {
    title,
    render: () => <PromptBody placeholder={placeholder} initialValue={initialValue} submitLabel={submitLabel} submitClass={submitClass} onSubmit={onSubmit} />,
  };
}

function PromptBody({ placeholder, initialValue, submitLabel, submitClass, onSubmit }) {
  const inputRef = useRef(null);
  const hintRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (initialValue) inputRef.current.select();
    }
  }, []);

  function doSubmit() {
    const val = inputRef.current.value.trim();
    if (!val || val === initialValue) { closeModal(); return; }
    onSubmit(val, hintRef.current);
  }

  return (
    <div class="modal-body">
      <input
        ref={inputRef}
        class="input"
        style="width:100%"
        placeholder={placeholder || ''}
        value={initialValue || ''}
        onKeyDown={(e) => { if (e.key === 'Enter') doSubmit(); }}
      />
      <div ref={hintRef} class="input-hint"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onClick={closeModal}>Cancel</button>
        <button class={`btn ${submitClass || 'btn-primary'}`} onClick={doSubmit}>{submitLabel || 'OK'}</button>
      </div>
    </div>
  );
}

export function openModal(title, renderFn) {
  modalContent.value = { title, render: renderFn };
}

export default function Modal() {
  const modal = modalContent.value;

  useEffect(() => {
    if (!modal) return;
    const onKey = (e) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modal]);

  if (!modal) return null;

  return (
    <div class="modal-overlay visible" onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
      <div class="modal-card">
        <div class="modal-header">
          <span class="modal-title">{modal.title}</span>
          <button class="modal-close" onClick={closeModal}>{'\u00d7'}</button>
        </div>
        {modal.render()}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create JsonEditor.jsx**

Port from `src/mdh/ui/json-editor.js`. This is a Preact wrapper around CodeMirror 6. The MongoDB autocompletion arrays, `extractFieldNames()`, and the `createEditorState` logic carry over from the current file.

```jsx
// src/mdh/components/JsonEditor.jsx
import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompletion } from '@codemirror/autocomplete';
import JSON5 from 'json5';

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

const baseTheme = EditorView.theme({
  '&': { fontSize: '12px', flex: '1' },
  '.cm-scroller': { fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace", overflow: 'auto' },
  '.cm-gutters': { border: 'none' },
});

const compactTheme = EditorView.theme({
  '&': { fontSize: '12px', flex: '1' },
  '.cm-scroller': { fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace", overflow: 'auto' },
  '.cm-gutters': { display: 'none' },
  '.cm-content': { padding: '4px 0' },
  '&.cm-focused': { outline: 'none' },
});

// MongoDB operators — same arrays as current json-editor.js
const QUERY_OPERATORS = [
  { label: '$eq', type: 'keyword', detail: 'Matches values equal to a value' },
  { label: '$ne', type: 'keyword', detail: 'Matches values not equal' },
  { label: '$gt', type: 'keyword', detail: 'Greater than' },
  { label: '$gte', type: 'keyword', detail: 'Greater than or equal' },
  { label: '$lt', type: 'keyword', detail: 'Less than' },
  { label: '$lte', type: 'keyword', detail: 'Less than or equal' },
  { label: '$in', type: 'keyword', detail: 'Matches any value in array' },
  { label: '$nin', type: 'keyword', detail: 'Matches none in array' },
  { label: '$and', type: 'keyword', detail: 'Logical AND' },
  { label: '$or', type: 'keyword', detail: 'Logical OR' },
  { label: '$not', type: 'keyword', detail: 'Logical NOT' },
  { label: '$nor', type: 'keyword', detail: 'Logical NOR' },
  { label: '$exists', type: 'keyword', detail: 'Field exists check' },
  { label: '$type', type: 'keyword', detail: 'BSON type check' },
  { label: '$regex', type: 'keyword', detail: 'Regular expression match' },
  { label: '$elemMatch', type: 'keyword', detail: 'Array element match' },
  { label: '$all', type: 'keyword', detail: 'All elements match' },
  { label: '$size', type: 'keyword', detail: 'Array size match' },
];

const UPDATE_OPERATORS = [
  { label: '$set', type: 'keyword', detail: 'Set field value' },
  { label: '$unset', type: 'keyword', detail: 'Remove field' },
  { label: '$inc', type: 'keyword', detail: 'Increment value' },
  { label: '$push', type: 'keyword', detail: 'Append to array' },
  { label: '$pull', type: 'keyword', detail: 'Remove from array' },
  { label: '$addToSet', type: 'keyword', detail: 'Add unique to array' },
  { label: '$rename', type: 'keyword', detail: 'Rename field' },
  { label: '$min', type: 'keyword', detail: 'Update if less than' },
  { label: '$max', type: 'keyword', detail: 'Update if greater than' },
  { label: '$mul', type: 'keyword', detail: 'Multiply value' },
];

const AGGREGATION_STAGES = [
  { label: '$match', type: 'keyword', detail: 'Filter documents' },
  { label: '$group', type: 'keyword', detail: 'Group by expression' },
  { label: '$project', type: 'keyword', detail: 'Reshape documents' },
  { label: '$sort', type: 'keyword', detail: 'Sort documents' },
  { label: '$limit', type: 'keyword', detail: 'Limit results' },
  { label: '$skip', type: 'keyword', detail: 'Skip documents' },
  { label: '$unwind', type: 'keyword', detail: 'Deconstruct array' },
  { label: '$lookup', type: 'keyword', detail: 'Left outer join' },
  { label: '$addFields', type: 'keyword', detail: 'Add new fields' },
  { label: '$replaceRoot', type: 'keyword', detail: 'Replace root document' },
  { label: '$count', type: 'keyword', detail: 'Count documents' },
  { label: '$out', type: 'keyword', detail: 'Write to collection' },
  { label: '$merge', type: 'keyword', detail: 'Merge into collection' },
  { label: '$facet', type: 'keyword', detail: 'Multi-pipeline processing' },
  { label: '$bucket', type: 'keyword', detail: 'Categorize into buckets' },
  { label: '$search', type: 'keyword', detail: 'Atlas Search query' },
];

const EXPRESSION_OPERATORS = [
  { label: '$sum', type: 'keyword', detail: 'Sum values' },
  { label: '$avg', type: 'keyword', detail: 'Average value' },
  { label: '$first', type: 'keyword', detail: 'First value in group' },
  { label: '$last', type: 'keyword', detail: 'Last value in group' },
  { label: '$min', type: 'keyword', detail: 'Minimum value' },
  { label: '$max', type: 'keyword', detail: 'Maximum value' },
  { label: '$concat', type: 'keyword', detail: 'Concatenate strings' },
  { label: '$substr', type: 'keyword', detail: 'Substring' },
  { label: '$toLower', type: 'keyword', detail: 'To lowercase' },
  { label: '$toUpper', type: 'keyword', detail: 'To uppercase' },
  { label: '$cond', type: 'keyword', detail: 'Conditional expression' },
  { label: '$ifNull', type: 'keyword', detail: 'Null coalesce' },
  { label: '$arrayElemAt', type: 'keyword', detail: 'Array element at index' },
  { label: '$filter', type: 'keyword', detail: 'Filter array elements' },
  { label: '$map', type: 'keyword', detail: 'Map over array' },
  { label: '$reduce', type: 'keyword', detail: 'Reduce array' },
];

function mongoCompletions(operatorSets, fieldsFn) {
  const allOps = operatorSets.flat();
  return (context) => {
    const quoted = context.matchBefore(/"\$[\w]*/);
    if (quoted) {
      const prefix = quoted.text.replace(/^"/, '');
      return { from: quoted.from + 1, options: allOps.filter((op) => op.label.startsWith(prefix)) };
    }
    const unquoted = context.matchBefore(/\$[\w]*/);
    if (unquoted) {
      return { from: unquoted.from, options: allOps.filter((op) => op.label.startsWith(unquoted.text)) };
    }
    const fieldQuoted = context.matchBefore(/"[\w.]*/);
    if (fieldQuoted && fieldsFn) {
      const prefix = fieldQuoted.text.replace(/^"/, '');
      const fields = fieldsFn();
      if (fields.length === 0) return null;
      const fieldOptions = fields
        .filter((f) => f.startsWith(prefix) && !f.startsWith('$'))
        .map((f) => ({ label: f, type: 'property', detail: 'field' }));
      if (fieldOptions.length === 0) return null;
      return { from: fieldQuoted.from + 1, options: fieldOptions };
    }
    return null;
  };
}

export function extractFieldNames(records) {
  const fields = new Set();
  for (const record of records) {
    collectKeys(record, '', fields);
  }
  return [...fields].sort();
}

function collectKeys(obj, prefix, fields) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    fields.add(path);
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      collectKeys(obj[key], path, fields);
    }
  }
}

function getCompletionSets(mode) {
  if (mode === 'aggregate') return [AGGREGATION_STAGES, EXPRESSION_OPERATORS, QUERY_OPERATORS];
  if (mode === 'update') return [UPDATE_OPERATORS, QUERY_OPERATORS];
  if (mode === 'query') return [QUERY_OPERATORS];
  if (mode === 'sort') return [];
  return [QUERY_OPERATORS, UPDATE_OPERATORS, AGGREGATION_STAGES, EXPRESSION_OPERATORS];
}

export default function JsonEditor({ value = '', onChange, onValidChange, mode = 'default', fields, compact = false, readOnly = false, onSubmit, editorRef, minHeight = '200px' }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  // Store callbacks in refs so CodeMirror listeners always call the latest version
  const onChangeRef = useRef(onChange);
  const onValidChangeRef = useRef(onValidChange);
  const onSubmitRef = useRef(onSubmit);
  onChangeRef.current = onChange;
  onValidChangeRef.current = onValidChange;
  onSubmitRef.current = onSubmit;

  useEffect(() => {
    const completionSets = getCompletionSets(mode);
    const fieldsFn = typeof fields === 'function' ? fields : null;

    const keymaps = [indentWithTab];
    if (onSubmitRef.current) {
      keymaps.unshift(
        { key: 'Enter', run: () => { onSubmitRef.current(); return true; } },
        { key: 'Shift-Enter', run: (view) => { view.dispatch(view.state.replaceSelection('\n')); return true; } },
      );
    }

    let validChangeTimer = null;

    const extensions = [
      basicSetup,
      keymap.of(keymaps),
      json(),
      compact ? compactTheme : baseTheme,
      EditorView.lineWrapping,
      autocompletion({ override: [mongoCompletions(completionSets, fieldsFn)] }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          if (onChangeRef.current) onChangeRef.current();
          // Validate and fire onValidChange with debounce
          const text = update.state.doc.toString().trim();
          const errorEl = containerRef.current?.querySelector('.json-editor-error');
          if (!text) {
            if (errorEl) { errorEl.textContent = ''; containerRef.current.classList.remove('json-editor-invalid'); }
          } else {
            try {
              JSON5.parse(text);
              if (errorEl) { errorEl.textContent = ''; containerRef.current.classList.remove('json-editor-invalid'); }
              if (onValidChangeRef.current) {
                clearTimeout(validChangeTimer);
                validChangeTimer = setTimeout(onValidChangeRef.current, 500);
              }
            } catch (e) {
              if (errorEl) { errorEl.textContent = e.message; containerRef.current.classList.add('json-editor-invalid'); }
            }
          }
        }
      }),
    ];

    if (readOnly) extensions.push(EditorState.readOnly.of(true));
    if (darkQuery.matches) extensions.push(oneDark);

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    // Initial validation
    const text = value.trim();
    if (text) {
      const errorEl = containerRef.current?.querySelector('.json-editor-error');
      try { JSON5.parse(text); }
      catch (e) { if (errorEl) { errorEl.textContent = e.message; containerRef.current.classList.add('json-editor-invalid'); } }
    }

    return () => {
      clearTimeout(validChangeTimer);
      view.destroy();
    };
  }, []);

  // Expose imperative API
  useEffect(() => {
    if (editorRef) {
      editorRef.current = {
        getValue: () => viewRef.current.state.doc.toString(),
        setValue: (v) => viewRef.current.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: v } }),
        isValid: () => { const t = viewRef.current.state.doc.toString().trim(); if (!t) return false; try { JSON5.parse(t); return true; } catch { return false; } },
        getParsed: () => JSON5.parse(viewRef.current.state.doc.toString()),
        getError: () => containerRef.current?.querySelector('.json-editor-error')?.textContent || '',
        focus: () => viewRef.current.focus(),
        refresh: () => viewRef.current.requestMeasure(),
      };
    }
  }, [editorRef]);

  const cls = compact ? 'json-editor json-editor-compact' : 'json-editor';
  const style = compact ? {} : { minHeight };

  return (
    <div class={cls} style={style} ref={containerRef}>
      <div class="json-editor-error"></div>
    </div>
  );
}
```

- [ ] **Step 3: Create IndexCard.jsx**

Port from `src/mdh/ui/index-card.js`. Used by both IndexPanel and SearchIndexPanel.

```jsx
// src/mdh/components/IndexCard.jsx
import { h } from 'preact';
import { useState, useRef } from 'preact/hooks';
import { confirmModal } from './Modal.jsx';
import JsonEditor from './JsonEditor.jsx';

export default function IndexCard({ name, badges = [], definition, canDrop, onDrop }) {
  const [expanded, setExpanded] = useState(true);

  function handleCopy(e) {
    const btn = e.currentTarget;
    navigator.clipboard.writeText(JSON.stringify(definition, null, 2)).then(() => {
      btn.textContent = '\u2713 Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1000);
    });
  }

  function handleDrop() {
    confirmModal(
      `Drop ${name}?`,
      `This will permanently drop "${name}". This cannot be undone.`,
      onDrop,
    );
  }

  return (
    <div class={'record-card' + (expanded ? ' record-card-expanded' : '')}>
      <div
        class="record-card-header"
        style="cursor:pointer"
        onClick={(e) => { if (!e.target.closest('.record-actions')) setExpanded(!expanded); }}
      >
        <span class="record-chevron">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span class="record-summary">
          <strong>{name}</strong>
          {badges.map(({ text, cls }) => (
            <span class={'index-badge' + (cls ? ' ' + cls : '')} style="margin-left:6px">{text}</span>
          ))}
        </span>
        <span class="record-actions">
          {definition && <button class="action-copy" onClick={handleCopy}>Copy</button>}
          {canDrop && onDrop && <button class="action-delete" onClick={handleDrop}>Del</button>}
        </span>
      </div>
      {expanded && definition && (
        <div class="record-card-body">
          <JsonEditor value={JSON.stringify(definition, null, 2)} compact readOnly minHeight="0" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create the components directory**

```bash
mkdir -p src/mdh/components src/mdh/hooks
```

- [ ] **Step 5: Commit**

```bash
git add src/mdh/components/Modal.jsx src/mdh/components/JsonEditor.jsx src/mdh/components/IndexCard.jsx
git commit -m "add Modal, JsonEditor, and IndexCard Preact components"
```

---

## Task 4: Create simple shell components

Small, self-contained components that read global signals.

**Files:**
- Create: `src/mdh/components/ConnectionBar.jsx`
- Create: `src/mdh/components/ErrorBanner.jsx`
- Create: `src/mdh/components/LoadingOverlay.jsx`
- Create: `src/mdh/components/TabBar.jsx`
- Create: `src/mdh/components/SidebarResizer.jsx`

- [ ] **Step 1: Create ConnectionBar.jsx**

```jsx
// src/mdh/components/ConnectionBar.jsx
import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { domain, selectedCollection } from '../store.js';
import * as cache from '../cache.js';

export default function ConnectionBar({ connected }) {
  const [cacheText, setCacheText] = useState('cache: empty');

  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => {
      const col = selectedCollection.value;
      const s = cache.stats(col);
      if (s.fieldCount === 0) {
        setCacheText('cache: empty');
      } else if (s.age !== null) {
        const secs = Math.round(s.age / 1000);
        setCacheText(`cache: ${s.fieldCount} objects \u00b7 ${secs < 2 ? 'fresh' : secs + 's ago'}`);
      } else {
        setCacheText(`cache: ${s.fieldCount} objects`);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [connected]);

  if (!connected) {
    return (
      <div class="connection-bar">
        <span class="connection-dot error"></span> Not connected — open a Rossum page and click Data Storage in the extension popup
      </div>
    );
  }

  return (
    <div class="connection-bar">
      <span class="connection-dot"></span> Connected to {domain.value}
      <span class="cache-indicator">{cacheText}</span>
    </div>
  );
}
```

- [ ] **Step 2: Create ErrorBanner.jsx**

```jsx
// src/mdh/components/ErrorBanner.jsx
import { h } from 'preact';
import { error } from '../store.js';

export default function ErrorBanner() {
  const err = error.value;
  if (!err) return null;

  return (
    <div class="error-banner">
      <span>{err.message}</span>
      <button class="dismiss" onClick={() => { error.value = null; }}>{'\u00d7'}</button>
    </div>
  );
}
```

- [ ] **Step 3: Create LoadingOverlay.jsx**

```jsx
// src/mdh/components/LoadingOverlay.jsx
import { h } from 'preact';
import { loading } from '../store.js';

export default function LoadingOverlay() {
  if (!loading.value) return null;
  return <div class="loading-overlay"><div class="spinner"></div></div>;
}
```

- [ ] **Step 4: Create TabBar.jsx**

```jsx
// src/mdh/components/TabBar.jsx
import { h } from 'preact';
import { activePanel } from '../store.js';

const TABS = [
  { id: 'data', label: 'Data' },
  { id: 'indexes', label: 'Indexes' },
  { id: 'search-indexes', label: 'Search Indexes' },
];

export default function TabBar() {
  return (
    <div class="tab-bar">
      {TABS.map(({ id, label }) => (
        <button
          class={'tab' + (activePanel.value === id ? ' active' : '')}
          onClick={() => { activePanel.value = id; }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create SidebarResizer.jsx**

```jsx
// src/mdh/components/SidebarResizer.jsx
import { h } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export default function SidebarResizer() {
  const resizerRef = useRef(null);

  useEffect(() => {
    const resizer = resizerRef.current;
    const sidebar = document.getElementById('sidebar');
    if (!resizer || !sidebar) return;

    // Restore saved width
    chrome.storage.local.get(['mdhSidebarWidth'], ({ mdhSidebarWidth }) => {
      if (mdhSidebarWidth) {
        sidebar.style.width = mdhSidebarWidth + 'px';
        sidebar.style.minWidth = mdhSidebarWidth + 'px';
      }
    });

    function onMouseDown(e) {
      const startX = e.clientX;
      const startWidth = sidebar.getBoundingClientRect().width;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      function onMove(e) {
        const newWidth = Math.max(160, Math.min(600, startWidth + e.clientX - startX));
        sidebar.style.width = newWidth + 'px';
        sidebar.style.minWidth = newWidth + 'px';
      }

      function onUp() {
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        chrome.storage.local.set({ mdhSidebarWidth: sidebar.getBoundingClientRect().width });
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    resizer.addEventListener('mousedown', onMouseDown);
    return () => resizer.removeEventListener('mousedown', onMouseDown);
  }, []);

  return <div ref={resizerRef} class="sidebar-resizer"></div>;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/mdh/components/ConnectionBar.jsx src/mdh/components/ErrorBanner.jsx src/mdh/components/LoadingOverlay.jsx src/mdh/components/TabBar.jsx src/mdh/components/SidebarResizer.jsx
git commit -m "add shell components: ConnectionBar, ErrorBanner, LoadingOverlay, TabBar, SidebarResizer"
```

---

## Task 5: Create Sidebar component

**Files:**
- Create: `src/mdh/components/Sidebar.jsx`

Port from `src/mdh/ui/sidebar.js`. Collection list, create/rename/drop. Reads `collections` and `selectedCollection` signals.

- [ ] **Step 1: Create Sidebar.jsx**

```jsx
// src/mdh/components/Sidebar.jsx
import { h } from 'preact';
import { useEffect } from 'preact/hooks';
import { collections, selectedCollection, loading, error } from '../store.js';
import { confirmModal, promptModal, closeModal } from './Modal.jsx';
import * as api from '../api.js';
import * as cache from '../cache.js';

async function loadCollections() {
  try {
    loading.value = true;
    error.value = null;
    const res = await api.listCollections(null, true);
    const sorted = (res.result || []).sort((a, b) => a.localeCompare(b));
    collections.value = sorted;
    loading.value = false;
    if (!selectedCollection.value && sorted.length > 0) {
      selectedCollection.value = sorted[0];
    }
  } catch (err) {
    error.value = { message: err.message };
    loading.value = false;
  }
}

function selectCollection(name) {
  if (selectedCollection.value === name) return;
  // Reset sub-state when switching collections — DataPanel listens to selectedCollection
  selectedCollection.value = name;
}

function showCreateModal() {
  promptModal('New Collection', {
    placeholder: 'Collection name...',
    submitLabel: 'Create',
    submitClass: 'btn-success',
  }, async (name, hint) => {
    try {
      loading.value = true;
      error.value = null;
      await api.createCollection(name);
      cache.invalidateAll();
      closeModal();
      await loadCollections();
      selectCollection(name);
    } catch (err) {
      loading.value = false;
      hint.textContent = err.message;
    }
  });
}

function showRenameModal(oldName) {
  promptModal('Rename Collection', {
    placeholder: 'New name...',
    initialValue: oldName,
    submitLabel: 'Rename',
  }, async (newName, hint) => {
    try {
      loading.value = true;
      error.value = null;
      await api.renameCollection(oldName, newName);
      cache.invalidateAll();
      closeModal();
      if (selectedCollection.value === oldName) {
        selectedCollection.value = newName;
      }
      await loadCollections();
    } catch (err) {
      loading.value = false;
      hint.textContent = err.message;
    }
  });
}

function confirmDrop(name) {
  confirmModal(
    'Drop collection?',
    `This will permanently delete "${name}" and all its data. This action cannot be undone.`,
    async () => {
      try {
        loading.value = true;
        error.value = null;
        await api.dropCollection(name);
        cache.invalidateAll();
        if (selectedCollection.value === name) {
          selectedCollection.value = null;
        }
        await loadCollections();
      } catch (err) {
        error.value = { message: err.message };
      } finally {
        loading.value = false;
      }
    },
  );
}

export { loadCollections };

export default function Sidebar() {
  useEffect(() => { loadCollections(); }, []);

  const cols = collections.value;
  const selected = selectedCollection.value;

  return (
    <aside id="sidebar" class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-title-group">
          <span class="sidebar-title">Collections</span>
          <span class="sidebar-count">({cols.length})</span>
        </div>
        <div class="sidebar-header-actions">
          <button class="icon-btn" title="New collection" onClick={showCreateModal}>+</button>
          <button class="icon-btn" title="Refresh" onClick={() => { cache.invalidateAll(); loadCollections(); }}>{'\u21bb'}</button>
        </div>
      </div>
      <div class="collection-list">
        {cols.map((name) => (
          <div
            class={'collection-item' + (name === selected ? ' active' : '')}
            onClick={() => selectCollection(name)}
          >
            <span class="collection-item-name" title={name}>{name}</span>
            <span class="collection-item-actions">
              <button
                class="collection-action-btn"
                title="Rename collection"
                onClick={(e) => { e.stopPropagation(); showRenameModal(name); }}
                dangerouslySetInnerHTML={{ __html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>' }}
              />
              <button
                class="collection-action-btn collection-action-danger"
                title="Drop collection"
                onClick={(e) => { e.stopPropagation(); confirmDrop(name); }}
                dangerouslySetInnerHTML={{ __html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' }}
              />
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mdh/components/Sidebar.jsx
git commit -m "add Sidebar component with collection CRUD"
```

---

## Task 6: Create IndexPanel and SearchIndexPanel

**Files:**
- Create: `src/mdh/components/IndexPanel.jsx`
- Create: `src/mdh/components/SearchIndexPanel.jsx`

- [ ] **Step 1: Create IndexPanel.jsx**

Port from `src/mdh/ui/indexes.js`. Uses IndexCard, JsonEditor, Modal, and the global signals.

```jsx
// src/mdh/components/IndexPanel.jsx
import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { selectedCollection, activePanel, loading, error } from '../store.js';
import { openModal, closeModal } from './Modal.jsx';
import JsonEditor from './JsonEditor.jsx';
import IndexCard from './IndexCard.jsx';
import * as api from '../api.js';
import * as cache from '../cache.js';

function defaultTemplate() {
  return JSON.stringify({ indexName: 'my_index', keys: { field: 1 }, options: {} }, null, 2);
}

function parseOperationId(message) {
  return message ? message.match(/[a-f0-9]{24}/i)?.[0] : null;
}

export default function IndexPanel() {
  const [indexes, setIndexes] = useState([]);
  const [opStatus, setOpStatus] = useState(null); // { operationId, status, errorMessage }

  async function loadIndexes() {
    const collection = selectedCollection.value;
    if (!collection) return;

    const cached = cache.get(collection, 'indexes');
    if (cached !== null) { setIndexes(cached); return; }

    const isVisible = activePanel.value === 'indexes';
    try {
      if (isVisible) { loading.value = true; error.value = null; }
      const res = await api.listIndexes(collection, false);
      const result = res.result || [];
      cache.set(collection, 'indexes', result);
      if (isVisible) loading.value = false;
      setIndexes(result);
    } catch (err) {
      if (isVisible) { error.value = { message: err.message }; loading.value = false; }
    }
  }

  useEffect(() => { loadIndexes(); }, [selectedCollection.value, activePanel.value]);

  function openCreateModal() {
    const editorRef = { current: null };

    openModal('Create Index', () => {
      const hintRef = useRef(null);

      async function handleCreate() {
        if (!editorRef.current?.isValid()) {
          if (hintRef.current) hintRef.current.textContent = 'Invalid JSON';
          return;
        }
        const parsed = editorRef.current.getParsed();
        const { indexName, keys, options: opts } = parsed;
        if (!indexName || !keys) {
          if (hintRef.current) hintRef.current.textContent = 'indexName and keys are required';
          return;
        }

        try {
          loading.value = true;
          error.value = null;
          const res = await api.createIndex(selectedCollection.value, indexName, keys, opts || {});
          cache.invalidate(selectedCollection.value, 'indexes');
          loading.value = false;
          closeModal();
          const opId = parseOperationId(res.message);
          if (opId) setOpStatus({ operationId: opId, status: 'RUNNING', errorMessage: null });
          await loadIndexes();
        } catch (err) {
          loading.value = false;
          if (hintRef.current) hintRef.current.textContent = err.message;
        }
      }

      return (
        <div class="modal-body">
          <div class="modal-field-label">collectionName is set automatically from the selected collection</div>
          <JsonEditor value={defaultTemplate()} minHeight="250px" editorRef={editorRef} />
          <div ref={hintRef} class="input-hint"></div>
          <div class="modal-actions">
            <button class="btn btn-secondary" onClick={closeModal}>Cancel</button>
            <button class="btn btn-primary" onClick={handleCreate}>Create Index</button>
          </div>
        </div>
      );
    });
  }

  async function doDropIndex(indexName) {
    try {
      loading.value = true;
      error.value = null;
      const res = await api.dropIndex(selectedCollection.value, indexName);
      cache.invalidate(selectedCollection.value, 'indexes');
      loading.value = false;
      const opId = parseOperationId(res.message);
      if (opId) setOpStatus({ operationId: opId, status: 'RUNNING', errorMessage: null });
      await loadIndexes();
    } catch (err) {
      error.value = { message: err.message };
      loading.value = false;
    }
  }

  async function checkStatus() {
    if (!opStatus) return;
    try {
      const res = await api.checkOperationStatus(opStatus.operationId);
      const op = res.result || {};
      setOpStatus({ operationId: opStatus.operationId, status: op.status || 'UNKNOWN', errorMessage: op.error_message });
    } catch (err) {
      setOpStatus({ ...opStatus, status: 'ERROR', errorMessage: err.message });
    }
  }

  return (
    <div class="panel">
      <div class="toolbar">
        <span style="flex:1;font-weight:500">Indexes</span>
        <button class="btn btn-success btn-sm" onClick={openCreateModal}>+ Create</button>
        <button class="icon-btn" title="Refresh" onClick={() => { cache.invalidate(selectedCollection.value, 'indexes'); loadIndexes(); }}>{'\u21bb'}</button>
      </div>
      <div class="index-list">
        {indexes.length === 0 ? (
          <div style="padding:16px;color:var(--text-secondary);font-size:12px">No indexes</div>
        ) : indexes.map((idx) => {
          const isObj = typeof idx === 'object' && idx !== null;
          const name = isObj ? (idx.name || '(unnamed)') : String(idx);
          const isDefault = name === '_id_';
          const badges = [];
          if (isDefault) badges.push({ text: 'default', cls: 'index-badge-default' });
          if (isObj && idx.unique) badges.push({ text: 'unique', cls: 'index-badge-unique' });
          if (isObj && idx.sparse) badges.push({ text: 'sparse' });
          if (isObj && idx.expireAfterSeconds != null) badges.push({ text: `TTL: ${idx.expireAfterSeconds}s` });
          return <IndexCard name={name} badges={badges} definition={isObj ? idx : null} canDrop={!isDefault} onDrop={() => doDropIndex(name)} />;
        })}
      </div>
      {opStatus && (
        <div style="padding:8px 16px">
          <div class="op-status">
            <span class={`op-status-badge ${opStatus.status === 'FINISHED' ? 'finished' : opStatus.status === 'FAILED' ? 'failed' : 'running'}`}>
              {opStatus.status.toLowerCase()}
            </span>
            <span>Operation: {opStatus.operationId}</span>
            {opStatus.status !== 'FINISHED' && opStatus.status !== 'FAILED' && (
              <button class="btn btn-sm op-check-btn" style="margin-left:auto" onClick={checkStatus}>Check Status</button>
            )}
            {opStatus.errorMessage && <span style="color:var(--danger);margin-left:8px">{opStatus.errorMessage}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create SearchIndexPanel.jsx**

Port from `src/mdh/ui/search-indexes.js`. Same pattern as IndexPanel but with search-index-specific badge logic and create template.

```jsx
// src/mdh/components/SearchIndexPanel.jsx
import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { selectedCollection, activePanel, loading, error } from '../store.js';
import { openModal, closeModal } from './Modal.jsx';
import JsonEditor from './JsonEditor.jsx';
import IndexCard from './IndexCard.jsx';
import * as api from '../api.js';
import * as cache from '../cache.js';

function defaultTemplate() {
  return JSON.stringify({ indexName: 'my_search_index', mappings: { dynamic: true } }, null, 2);
}

function parseOperationId(message) {
  return message ? message.match(/[a-f0-9]{24}/i)?.[0] : null;
}

export default function SearchIndexPanel() {
  const [indexes, setIndexes] = useState([]);
  const [opStatus, setOpStatus] = useState(null);

  async function loadSearchIndexes() {
    const collection = selectedCollection.value;
    if (!collection) return;

    const cached = cache.get(collection, 'searchIndexes');
    if (cached !== null) { setIndexes(cached); return; }

    const isVisible = activePanel.value === 'search-indexes';
    try {
      if (isVisible) { loading.value = true; error.value = null; }
      const res = await api.listSearchIndexes(collection, false);
      const result = res.result || [];
      cache.set(collection, 'searchIndexes', result);
      if (isVisible) loading.value = false;
      setIndexes(result);
    } catch (err) {
      if (isVisible) { error.value = { message: err.message }; loading.value = false; }
    }
  }

  useEffect(() => { loadSearchIndexes(); }, [selectedCollection.value, activePanel.value]);

  function openCreateModal() {
    const editorRef = { current: null };

    openModal('Create Search Index', () => {
      const hintRef = useRef(null);

      async function handleCreate() {
        if (!editorRef.current?.isValid()) {
          if (hintRef.current) hintRef.current.textContent = 'Invalid JSON';
          return;
        }
        const parsed = editorRef.current.getParsed();
        const { indexName, mappings, analyzer, analyzers, searchAnalyzer, synonyms } = parsed;
        if (!indexName || !mappings) {
          if (hintRef.current) hintRef.current.textContent = 'indexName and mappings are required';
          return;
        }

        const opts = { indexName, mappings };
        if (analyzer) opts.analyzer = analyzer;
        if (analyzers) opts.analyzers = analyzers;
        if (searchAnalyzer) opts.searchAnalyzer = searchAnalyzer;
        if (synonyms) opts.synonyms = synonyms;

        try {
          loading.value = true;
          error.value = null;
          const res = await api.createSearchIndex(selectedCollection.value, opts);
          cache.invalidate(selectedCollection.value, 'searchIndexes');
          loading.value = false;
          closeModal();
          const opId = parseOperationId(res.message);
          if (opId) setOpStatus({ operationId: opId, status: 'RUNNING', errorMessage: null });
          await loadSearchIndexes();
        } catch (err) {
          loading.value = false;
          if (hintRef.current) hintRef.current.textContent = err.message;
        }
      }

      return (
        <div class="modal-body">
          <div class="modal-field-label">collectionName is set automatically from the selected collection</div>
          <JsonEditor value={defaultTemplate()} minHeight="250px" editorRef={editorRef} />
          <div ref={hintRef} class="input-hint"></div>
          <div class="modal-actions">
            <button class="btn btn-secondary" onClick={closeModal}>Cancel</button>
            <button class="btn btn-primary" onClick={handleCreate}>Create Search Index</button>
          </div>
        </div>
      );
    });
  }

  async function doDropSearchIndex(indexName) {
    try {
      loading.value = true;
      error.value = null;
      const res = await api.dropSearchIndex(selectedCollection.value, indexName);
      cache.invalidate(selectedCollection.value, 'searchIndexes');
      loading.value = false;
      const opId = parseOperationId(res.message);
      if (opId) setOpStatus({ operationId: opId, status: 'RUNNING', errorMessage: null });
      await loadSearchIndexes();
    } catch (err) {
      error.value = { message: err.message };
      loading.value = false;
    }
  }

  async function checkStatus() {
    if (!opStatus) return;
    try {
      const res = await api.checkOperationStatus(opStatus.operationId);
      const op = res.result || {};
      setOpStatus({ operationId: opStatus.operationId, status: op.status || 'UNKNOWN', errorMessage: op.error_message });
    } catch (err) {
      setOpStatus({ ...opStatus, status: 'ERROR', errorMessage: err.message });
    }
  }

  return (
    <div class="panel">
      <div class="toolbar">
        <span style="flex:1;font-weight:500">Search Indexes (Atlas Search)</span>
        <button class="btn btn-success btn-sm" onClick={openCreateModal}>+ Create</button>
        <button class="icon-btn" title="Refresh" onClick={() => { cache.invalidate(selectedCollection.value, 'searchIndexes'); loadSearchIndexes(); }}>{'\u21bb'}</button>
      </div>
      <div class="index-list">
        {indexes.length === 0 ? (
          <div style="padding:16px;color:var(--text-secondary);font-size:12px">No search indexes</div>
        ) : indexes.map((idx) => {
          const isObj = typeof idx === 'object' && idx !== null;
          const name = isObj ? (idx.name || '(unnamed)') : String(idx);
          const badges = [];
          if (isObj && idx.status) {
            const cls = idx.status === 'READY' ? 'index-badge-ready'
              : (idx.status === 'PENDING' || idx.status === 'BUILDING') ? 'index-badge-pending' : '';
            badges.push({ text: idx.status.toLowerCase(), cls });
          }
          if (isObj && idx.type) badges.push({ text: idx.type });
          return <IndexCard name={name} badges={badges} definition={isObj ? idx : null} canDrop onDrop={() => doDropSearchIndex(name)} />;
        })}
      </div>
      {opStatus && (
        <div style="padding:8px 16px">
          <div class="op-status">
            <span class={`op-status-badge ${opStatus.status === 'FINISHED' ? 'finished' : opStatus.status === 'FAILED' ? 'failed' : 'running'}`}>
              {opStatus.status.toLowerCase()}
            </span>
            <span>Operation: {opStatus.operationId}</span>
            {opStatus.status !== 'FINISHED' && opStatus.status !== 'FAILED' && (
              <button class="btn btn-sm op-check-btn" style="margin-left:auto" onClick={checkStatus}>Check Status</button>
            )}
            {opStatus.errorMessage && <span style="color:var(--danger);margin-left:8px">{opStatus.errorMessage}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/mdh/components/IndexPanel.jsx src/mdh/components/SearchIndexPanel.jsx
git commit -m "add IndexPanel and SearchIndexPanel components"
```

---

## Task 7: Create custom hooks (usePipeline, useQuery, usePagination)

These extract the business logic from `records.js` into reusable hooks. They're pure logic — no JSX.

**Files:**
- Create: `src/mdh/hooks/usePipeline.js`
- Create: `src/mdh/hooks/useQuery.js`
- Create: `src/mdh/hooks/usePagination.js`

- [ ] **Step 1: Create usePipeline.js**

Manages pipeline text, sort/filter state, placeholder values, and the sync between UI controls and the pipeline editor.

```js
// src/mdh/hooks/usePipeline.js
import { useRef, useCallback } from 'preact/hooks';
import { signal } from '@preact/signals';
import { skip } from '../store.js';

const PLACEHOLDER_RE = /\{(\w+)\}/g;

export function usePipeline() {
  // Use refs to hold signals so they persist across renders but are local to this hook instance
  const stateRef = useRef(null);
  if (!stateRef.current) {
    stateRef.current = {
      sortState: signal({}),
      filterState: signal({}),
      placeholderValues: signal({}),
      suppressSync: signal(false),
    };
  }
  const { sortState, filterState, placeholderValues, suppressSync } = stateRef.current;

  function buildPipelineFromUI() {
    const pipeline = [];
    const filters = filterState.value;
    const match = Object.keys(filters).length > 0 ? { ...filters } : {};
    pipeline.push({ $match: match });
    const sorts = sortState.value;
    if (Object.keys(sorts).length > 0) pipeline.push({ $sort: { ...sorts } });
    pipeline.push({ $skip: skip.value });
    // limit is added by useQuery
    return pipeline;
  }

  function toggleSort(field) {
    const current = { ...sortState.value };
    if (!current[field]) current[field] = 1;
    else if (current[field] === 1) current[field] = -1;
    else delete current[field];
    sortState.value = current;
    skip.value = 0;
  }

  function toggleFilter(field, value) {
    const current = { ...filterState.value };
    if (field in current) delete current[field];
    else current[field] = value;
    filterState.value = current;
    skip.value = 0;
  }

  function isFiltered(field) {
    return field in filterState.value;
  }

  function sortIndicator(field) {
    const s = sortState.value[field];
    if (s === 1) return ' \u2191';
    if (s === -1) return ' \u2193';
    return '';
  }

  function extractPlaceholders(text) {
    const names = new Set();
    for (const match of text.matchAll(PLACEHOLDER_RE)) {
      names.add(match[1]);
    }
    return [...names];
  }

  function substitutePlaceholders(text) {
    return text.replace(PLACEHOLDER_RE, (match, name) => {
      if (!(name in placeholderValues.value)) return match;
      const val = placeholderValues.value[name];
      if (val === 'true' || val === 'false' || val === 'null') return val;
      if (val !== '' && !isNaN(Number(val))) return val;
      return val;
    });
  }

  function setPlaceholder(name, value) {
    placeholderValues.value = { ...placeholderValues.value, [name]: value };
  }

  function reset() {
    sortState.value = {};
    filterState.value = {};
    placeholderValues.value = {};
    skip.value = 0;
  }

  return {
    sortState,
    filterState,
    placeholderValues,
    suppressSync,
    buildPipelineFromUI,
    toggleSort,
    toggleFilter,
    isFiltered,
    sortIndicator,
    extractPlaceholders,
    substitutePlaceholders,
    setPlaceholder,
    reset,
  };
}
```

- [ ] **Step 2: Create useQuery.js**

Manages query execution with stale detection (queryId), caching integration, and timing.

```js
// src/mdh/hooks/useQuery.js
import { useRef, useCallback } from 'preact/hooks';
import { signal } from '@preact/signals';
import { records as recordsSignal, loading, error, limit } from '../store.js';
import * as api from '../api.js';
import * as cache from '../cache.js';
import JSON5 from 'json5';

export function useQuery() {
  const stateRef = useRef(null);
  if (!stateRef.current) {
    stateRef.current = {
      queryId: 0,
      lastQueryMs: signal(0),
      cacheNextQuery: false,
    };
  }
  const state = stateRef.current;

  async function runQuery(collection, rawText, substituteFn) {
    if (!collection || !rawText) return;

    const resolvedText = substituteFn ? substituteFn(rawText) : rawText;

    // Bail if unresolved placeholders remain
    if (/\{\w+\}/.test(resolvedText)) return;

    let pipeline;
    try {
      pipeline = JSON5.parse(resolvedText);
      if (!Array.isArray(pipeline)) return;
    } catch { return; }

    const thisQueryId = ++state.queryId;

    try {
      loading.value = true;
      error.value = null;
      const start = performance.now();
      const res = await api.aggregate(collection, pipeline);
      if (thisQueryId !== state.queryId) return; // stale
      const elapsed = Math.round(performance.now() - start);
      state.lastQueryMs.value = elapsed;
      const result = res.result || [];
      if (state.cacheNextQuery) {
        cache.set(collection, 'records', result);
        state.cacheNextQuery = false;
      }
      recordsSignal.value = result;
      loading.value = false;
      return { records: result, elapsed };
    } catch (err) {
      if (thisQueryId !== state.queryId) return;
      state.cacheNextQuery = false;
      error.value = { message: err.message };
      loading.value = false;
    }
  }

  function setCacheNextQuery(val) {
    state.cacheNextQuery = val;
  }

  return {
    lastQueryMs: state.lastQueryMs,
    runQuery,
    setCacheNextQuery,
  };
}
```

- [ ] **Step 3: Create usePagination.js**

Manages skip/limit and total count fetching.

```js
// src/mdh/hooks/usePagination.js
import { useRef } from 'preact/hooks';
import { signal } from '@preact/signals';
import { skip, limit } from '../store.js';
import * as api from '../api.js';
import * as cache from '../cache.js';

export function usePagination() {
  const totalCount = useRef(signal(null)).current;

  async function fetchTotalCount(collection) {
    const cached = cache.get(collection, 'totalCount');
    if (cached !== null) {
      totalCount.value = cached;
      return cached;
    }
    try {
      const res = await api.aggregate(collection, [{ $count: 'total' }]);
      const count = res.result?.[0]?.total ?? 0;
      totalCount.value = count;
      cache.set(collection, 'totalCount', count);
      return count;
    } catch {
      return null;
    }
  }

  function page() {
    return Math.floor(skip.value / limit.value) + 1;
  }

  function hasPrev() {
    return skip.value > 0;
  }

  function hasNext(recordCount) {
    return recordCount >= limit.value;
  }

  function goNext() {
    skip.value = skip.value + limit.value;
  }

  function goPrev() {
    skip.value = Math.max(0, skip.value - limit.value);
  }

  function resetPage() {
    skip.value = 0;
    totalCount.value = null;
  }

  function invalidateTotalCount(collection) {
    cache.invalidate(collection, 'totalCount');
    totalCount.value = null;
  }

  return {
    totalCount,
    fetchTotalCount,
    page,
    hasPrev,
    hasNext,
    goNext,
    goPrev,
    resetPage,
    invalidateTotalCount,
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/mdh/hooks/usePipeline.js src/mdh/hooks/useQuery.js src/mdh/hooks/usePagination.js
git commit -m "add custom hooks: usePipeline, useQuery, usePagination"
```

---

## Task 8: Create JsonTree and RecordCard components

These are the record display components. JsonTree is recursive, RecordCard wraps it.

**Files:**
- Create: `src/mdh/components/JsonTree.jsx`
- Create: `src/mdh/components/RecordCard.jsx`

- [ ] **Step 1: Create JsonTree.jsx**

Port the `renderInteractiveJson()` function from `records.js:1268-1400` into a recursive Preact component. Handles objects, arrays, EJSON types, and primitives.

```jsx
// src/mdh/components/JsonTree.jsx
import { h } from 'preact';
import { useState } from 'preact/hooks';

// EJSON type detection — same as current records.js
const EJSON_TYPES = {
  $oid: { label: 'ObjectId', css: 'json-tree-value-oid' },
  $date: { label: 'Date', css: 'json-tree-value-date' },
  $numberLong: { label: 'Long', css: 'json-tree-value-number' },
  $numberInt: { label: 'Int', css: 'json-tree-value-number' },
  $numberDouble: { label: 'Double', css: 'json-tree-value-number' },
  $numberDecimal: { label: 'Decimal', css: 'json-tree-value-number' },
  $binary: { label: 'Binary', css: 'json-tree-value-null' },
  $regex: { label: 'Regex', css: 'json-tree-value-string' },
  $timestamp: { label: 'Timestamp', css: 'json-tree-value-date' },
};

function getEjsonType(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] in EJSON_TYPES) return keys[0];
  if (keys.length === 2 && keys.includes('$date')) return '$date';
  return null;
}

function formatEjsonValue(value, typeKey) {
  const inner = value[typeKey];
  if (typeKey === '$oid') return String(inner);
  if (typeKey === '$date') {
    const d = typeof inner === 'string' ? inner : inner?.$numberLong || String(inner);
    try { return new Date(typeof d === 'string' && /^\d+$/.test(d) ? Number(d) : d).toISOString(); }
    catch { return String(d); }
  }
  if (typeKey === '$regex') return `/${inner}/${value.$options || ''}`;
  return String(inner);
}

export function displayValue(v) {
  if (v === null) return 'null';
  const ejson = getEjsonType(v);
  if (ejson) {
    const formatted = formatEjsonValue(v, ejson);
    return formatted.length > 24 ? formatted.slice(0, 24) + '...' : formatted;
  }
  if (typeof v === 'string') return v.length > 20 ? `"${v.slice(0, 20)}..."` : `"${v}"`;
  if (typeof v === 'object') return Array.isArray(v) ? `[${v.length}]` : '{...}';
  return String(v);
}

export default function JsonTree({ data, prefix = '', sortState, filterState, onSort, onFilter }) {
  return (
    <div class="json-tree">
      {Object.entries(data).map(([key, value]) => (
        <JsonTreeRow
          key={key}
          fieldKey={key}
          value={value}
          fullPath={prefix ? `${prefix}.${key}` : key}
          sortState={sortState}
          filterState={filterState}
          onSort={onSort}
          onFilter={onFilter}
        />
      ))}
    </div>
  );
}

function JsonTreeRow({ fieldKey, value, fullPath, sortState, filterState, onSort, onFilter }) {
  const ejsonType = getEjsonType(value);
  const isObj = value !== null && typeof value === 'object' && !Array.isArray(value) && !ejsonType;
  const isArr = Array.isArray(value);
  const [collapsed, setCollapsed] = useState(false);

  const sortDir = sortState[fullPath];
  const sortInd = sortDir === 1 ? ' \u2191' : sortDir === -1 ? ' \u2193' : '';
  const keyCls = 'json-tree-key' + (sortDir === 1 ? ' json-tree-key-asc' : sortDir === -1 ? ' json-tree-key-desc' : '');
  const keyTitle = sortDir === 1 ? 'Sorted ascending \u2014 click to sort descending'
    : sortDir === -1 ? 'Sorted descending \u2014 click to remove sort'
    : `Click to sort by ${fullPath}`;
  const filtered = fullPath in filterState;

  if (ejsonType) {
    const formatted = formatEjsonValue(value, ejsonType);
    const info = EJSON_TYPES[ejsonType];
    return (
      <div class="json-tree-row">
        <button class={keyCls} title={keyTitle} onClick={(e) => { e.stopPropagation(); onSort(fullPath); }}>{fieldKey}{sortInd}</button>
        <span class="json-tree-sep">: </span>
        <span class="json-tree-badge">{info.label}</span>
        <button
          class={'json-tree-value json-tree-value-clickable ' + info.css + (filtered ? ' json-tree-value-filtered' : '')}
          title={filtered ? `Filtering by ${fullPath} \u2014 click to remove filter` : `Click to filter: ${fullPath} = ${formatted}`}
          onClick={(e) => { e.stopPropagation(); onFilter(fullPath, value); }}
        >{formatted}</button>
      </div>
    );
  }

  if (isObj) {
    return (
      <div>
        <div class="json-tree-row">
          <button class={keyCls} title={keyTitle} onClick={(e) => { e.stopPropagation(); onSort(fullPath); }}>{fieldKey}{sortInd}</button>
          <span class="json-tree-sep">: </span>
          <span class="json-tree-toggle" style="cursor:pointer" onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}>
            {collapsed ? '\u25B6 {...}' : '\u25BC'}
          </span>
        </div>
        {!collapsed && (
          <div class="json-tree-nested">
            <JsonTree data={value} prefix={fullPath} sortState={sortState} filterState={filterState} onSort={onSort} onFilter={onFilter} />
          </div>
        )}
      </div>
    );
  }

  if (isArr) {
    return (
      <div>
        <div class="json-tree-row">
          <button class={keyCls} title={keyTitle} onClick={(e) => { e.stopPropagation(); onSort(fullPath); }}>{fieldKey}{sortInd}</button>
          <span class="json-tree-sep">: </span>
          <span class="json-tree-toggle" style="cursor:pointer" onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}>
            {collapsed ? `\u25B6 [${value.length}]` : `\u25BC [${value.length}]`}
          </span>
        </div>
        {!collapsed && (
          <div class="json-tree-nested">
            {value.map((item, ai) => {
              const itemPath = `${fullPath}.${ai}`;
              if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
                return (
                  <div class="json-tree-array-item">
                    <span class="json-tree-array-index">[{ai}]</span>
                    <JsonTree data={item} prefix={itemPath} sortState={sortState} filterState={filterState} onSort={onSort} onFilter={onFilter} />
                  </div>
                );
              }
              return (
                <div class="json-tree-row">
                  <span class="json-tree-array-index">[{ai}]</span>
                  <span class="json-tree-value">{JSON.stringify(item)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Primitive value
  let valCls = 'json-tree-value json-tree-value-clickable';
  if (typeof value === 'string') valCls += ' json-tree-value-string';
  else if (typeof value === 'number') valCls += ' json-tree-value-number';
  else if (typeof value === 'boolean') valCls += ' json-tree-value-bool';
  else if (value === null) valCls += ' json-tree-value-null';
  if (filtered) valCls += ' json-tree-value-filtered';

  const display = value === null ? 'null' : typeof value === 'string' ? `"${value}"` : String(value);

  return (
    <div class="json-tree-row">
      <button class={keyCls} title={keyTitle} onClick={(e) => { e.stopPropagation(); onSort(fullPath); }}>{fieldKey}{sortInd}</button>
      <span class="json-tree-sep">: </span>
      <button
        class={valCls}
        title={filtered ? `Filtering by ${fullPath} \u2014 click to remove filter` : `Click to filter: ${fullPath} = ${JSON.stringify(value)}`}
        onClick={(e) => { e.stopPropagation(); onFilter(fullPath, value); }}
      >{display}</button>
    </div>
  );
}
```

- [ ] **Step 2: Create RecordCard.jsx**

A single expandable record card with copy/edit/delete actions.

```jsx
// src/mdh/components/RecordCard.jsx
import { h } from 'preact';
import JsonTree, { displayValue } from './JsonTree.jsx';

function recordSummary(record) {
  const keys = Object.keys(record);
  const parts = keys.slice(0, 4).map((k) => `${k}: ${displayValue(record[k])}`);
  if (keys.length > 4) parts.push(`+${keys.length - 4} more`);
  return parts.join(' \u00b7 ');
}

export default function RecordCard({ record, index, expanded, onToggle, onCopy, onEdit, onDelete, sortState, filterState, onSort, onFilter }) {
  function handleCopy(e) {
    const btn = e.currentTarget;
    navigator.clipboard.writeText(JSON.stringify(record, null, 2)).then(() => {
      btn.textContent = '\u2713 Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1000);
    });
  }

  return (
    <div class={'record-card' + (expanded ? ' record-card-expanded' : '')}>
      <div class="record-card-header" onClick={(e) => { if (!e.target.closest('.record-actions')) onToggle(index); }}>
        <span class="record-chevron">{expanded ? '\u25BC' : '\u25B6'}</span>
        <span class="record-summary">{recordSummary(record)}</span>
        <span class="record-actions">
          <button class="action-copy" title="Copy record as JSON" onClick={handleCopy}>Copy</button>
          <button class="action-edit" title="Edit with update expression" onClick={() => onEdit(record)}>Edit</button>
          <button class="action-delete" title="Delete this record" onClick={() => onDelete(record, index)}>Del</button>
        </span>
      </div>
      {expanded && (
        <div class="record-card-body">
          <JsonTree data={record} sortState={sortState} filterState={filterState} onSort={onSort} onFilter={onFilter} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/mdh/components/JsonTree.jsx src/mdh/components/RecordCard.jsx
git commit -m "add JsonTree and RecordCard components"
```

---

## Task 9: Create QueryHistory, RecordEditor, DataOperations, DeleteMany components

Modal content components for data operations.

**Files:**
- Create: `src/mdh/components/QueryHistory.jsx`
- Create: `src/mdh/components/RecordEditor.jsx`
- Create: `src/mdh/components/DataOperations.jsx`
- Create: `src/mdh/components/DeleteMany.jsx`

- [ ] **Step 1: Create QueryHistory.jsx**

Port from `src/mdh/ui/query-history.js`. The chrome.storage.sync read/write logic stays the same. Renders history and saved query panels as dropdown lists.

The component exports the storage functions (`addToHistory`, `saveQuery`, `unsaveQuery`, `isSaved`) for use by DataPanel, plus two panel components (`HistoryPanel`, `SavedPanel`).

```jsx
// src/mdh/components/QueryHistory.jsx
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { selectedCollection } from '../store.js';

const MAX_HISTORY = 30;

export async function addToHistory(collection, pipeline, variables) {
  const { queryHistory = [] } = await chrome.storage.sync.get('queryHistory');
  const key = collection + '::' + pipeline;
  const filtered = queryHistory.filter((e) => e.collection + '::' + e.pipeline !== key);
  const entry = { collection, pipeline, ts: Date.now() };
  if (variables && Object.keys(variables).length > 0) entry.variables = variables;
  filtered.unshift(entry);
  await chrome.storage.sync.set({ queryHistory: filtered.slice(0, MAX_HISTORY) });
}

export async function saveQuery(collection, pipeline, name, variables) {
  const { savedQueries = [] } = await chrome.storage.sync.get('savedQueries');
  const entry = { collection, pipeline, name, ts: Date.now() };
  if (variables && Object.keys(variables).length > 0) entry.variables = variables;
  savedQueries.push(entry);
  await chrome.storage.sync.set({ savedQueries });
}

export async function unsaveQuery(collection, pipeline) {
  const { savedQueries = [] } = await chrome.storage.sync.get('savedQueries');
  const key = collection + '::' + pipeline;
  await chrome.storage.sync.set({ savedQueries: savedQueries.filter((q) => q.collection + '::' + q.pipeline !== key) });
}

export async function isSaved(collection, pipeline) {
  const { savedQueries = [] } = await chrome.storage.sync.get('savedQueries');
  return savedQueries.some((q) => q.collection + '::' + q.pipeline === collection + '::' + pipeline);
}

function formatTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function QueryRow({ item, currentCollection, savedName, onLoad, onDismiss, showUnsave, onUnsave }) {
  return (
    <div class={'query-history-item' + (item.collection === currentCollection ? ' query-history-item-current' : '')}>
      <div class="query-history-item-info" onClick={() => { onLoad(item.pipeline, item.collection, item.variables); onDismiss(); }}>
        <span class="query-history-collection">{item.collection}</span>
        {savedName && <span class="query-history-name">{savedName}</span>}
        <span class="query-history-time">{formatTime(item.ts)}</span>
        <div class="query-history-preview">
          {item.pipeline && item.pipeline.length > 150 ? item.pipeline.slice(0, 150) + '...' : item.pipeline}
        </div>
        {item.variables && Object.keys(item.variables).length > 0 && (
          <div class="query-history-variables">
            {Object.entries(item.variables).filter(([, v]) => v !== '').map(([k, v]) => `{${k}}=${v}`).join(', ')}
          </div>
        )}
      </div>
      {showUnsave && (
        <button class="query-history-unsave-btn" title="Remove from saved" onClick={(e) => { e.stopPropagation(); onUnsave(item); }}>{'\u2605'}</button>
      )}
    </div>
  );
}

export function HistoryPanel({ onLoad, onDismiss }) {
  const [items, setItems] = useState([]);
  const currentCollection = selectedCollection.value;

  useEffect(() => {
    chrome.storage.sync.get('queryHistory').then(({ queryHistory = [] }) => setItems(queryHistory));
  }, []);

  if (items.length === 0) {
    return <div class="query-history-panel"><div class="query-history-list"><div class="query-history-empty">No query history yet</div></div></div>;
  }

  return (
    <div class="query-history-panel">
      <div class="query-history-list">
        {items.map((item) => (
          <QueryRow item={item} currentCollection={currentCollection} onLoad={onLoad} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  );
}

export function SavedPanel({ onLoad, onDismiss }) {
  const [items, setItems] = useState([]);
  const currentCollection = selectedCollection.value;

  async function refresh() {
    const { savedQueries = [] } = await chrome.storage.sync.get('savedQueries');
    setItems(savedQueries);
  }

  useEffect(() => { refresh(); }, []);

  async function handleUnsave(item) {
    await unsaveQuery(item.collection, item.pipeline);
    refresh();
  }

  if (items.length === 0) {
    return <div class="query-history-panel"><div class="query-history-list"><div class="query-history-empty">No saved queries</div></div></div>;
  }

  return (
    <div class="query-history-panel">
      <div class="query-history-list">
        {items.map((item) => (
          <QueryRow item={item} currentCollection={currentCollection} savedName={item.name} onLoad={onLoad} onDismiss={onDismiss} showUnsave onUnsave={handleUnsave} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create RecordEditor.jsx**

Port from `src/mdh/ui/record-editor.js:37-86` (the `openRecordEditor` function). Opens a modal to edit or replace a single record.

```jsx
// src/mdh/components/RecordEditor.jsx
import { h } from 'preact';
import { useRef } from 'preact/hooks';
import { selectedCollection, loading, error } from '../store.js';
import { openModal, closeModal } from './Modal.jsx';
import JsonEditor from './JsonEditor.jsx';
import * as api from '../api.js';

export function openRecordEditor(mode, record, onSuccess, fieldsFn) {
  const editorRef = { current: null };

  let initialValue = '{\n  \n}';
  let label;
  if (mode === 'edit') {
    label = 'Update expression (MongoDB update syntax):';
    const copy = { ...record }; delete copy._id;
    initialValue = JSON.stringify({ $set: copy }, null, 2);
  } else {
    label = 'Replacement document (full document, excluding _id):';
    const copy = { ...record }; delete copy._id;
    initialValue = JSON.stringify(copy, null, 2);
  }

  openModal(mode === 'edit' ? 'Edit Record' : 'Replace Record', () => {
    const hintRef = useRef(null);

    async function handleSubmit() {
      if (!editorRef.current?.isValid()) {
        if (hintRef.current) hintRef.current.textContent = 'Invalid JSON: ' + (editorRef.current?.getError() || '');
        return;
      }
      const parsed = editorRef.current.getParsed();
      const collection = selectedCollection.value;
      try {
        loading.value = true;
        error.value = null;
        if (mode === 'edit') await api.updateOne(collection, { _id: record._id }, parsed);
        else await api.replaceOne(collection, { _id: record._id }, parsed);
        loading.value = false;
        closeModal();
        if (onSuccess) onSuccess();
      } catch (err) {
        loading.value = false;
        if (hintRef.current) hintRef.current.textContent = err.message;
      }
    }

    return (
      <div class="modal-body">
        <div class="modal-field-label">{label}</div>
        <JsonEditor value={initialValue} minHeight="200px" fields={fieldsFn} editorRef={editorRef} />
        <div ref={hintRef} class="input-hint"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onClick={closeModal}>Cancel</button>
          <button class="btn btn-primary" onClick={handleSubmit}>{mode === 'edit' ? 'Update' : 'Replace'}</button>
        </div>
      </div>
    );
  });
}
```

- [ ] **Step 3: Create DataOperations.jsx**

Port from `src/mdh/ui/record-editor.js:90-450`. The insert/update/replace modals (manual + file upload). This is the largest modal component.

```jsx
// src/mdh/components/DataOperations.jsx
import { h } from 'preact';
import { useState, useRef } from 'preact/hooks';
import { selectedCollection, loading, error } from '../store.js';
import { openModal, closeModal } from './Modal.jsx';
import JsonEditor from './JsonEditor.jsx';
import * as api from '../api.js';

function FileInput({ onParsed }) {
  const [fileName, setFileName] = useState(null);
  const [docCount, setDocCount] = useState(0);
  const parsedRef = useRef(null);

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then((text) => {
      let parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) parsed = [parsed];
      parsedRef.current = parsed;
      setFileName(file.name);
      setDocCount(parsed.length);
      if (onParsed) onParsed(parsed);
    }).catch((err) => {
      setFileName('Error: ' + err.message);
      parsedRef.current = null;
    });
  }

  return (
    <div class="file-input-area">
      <input type="file" accept=".json" style="display:none" onChange={handleFileChange} ref={(el) => { if (el) el._fileInput = el; }} />
      <div class="file-input-label" onClick={(e) => { e.currentTarget.previousSibling.click(); }}>
        {fileName || 'Click to select a JSON file'}
      </div>
      {fileName && docCount > 0 && <div class="file-input-info">{docCount} document{docCount !== 1 ? 's' : ''}</div>}
    </div>
  );
}

function MatchFields({ docs, matchFieldsRef }) {
  if (!docs || docs.length === 0) return null;
  const fields = Object.keys(docs[0]);

  return (
    <div ref={matchFieldsRef} class="match-fields">
      {fields.map((field) => (
        <label class="match-field-option">
          <input type="checkbox" value={field} checked={field === '_id'} />
          <span>{field}</span>
        </label>
      ))}
    </div>
  );
}

function getSelectedMatchFields(container) {
  if (!container) return [];
  return [...container.querySelectorAll('input[type="checkbox"]:checked')].map((cb) => cb.value);
}

export function openDataOperations(mode, onSuccess, fieldsFn) {
  const isFile = mode.endsWith('-file');
  const op = mode.replace('-file', '');
  const title = op.charAt(0).toUpperCase() + op.slice(1) + (isFile ? ' from File' : '');

  openModal(title, () => {
    if (op === 'insert') return <InsertPanel isFile={isFile} onSuccess={onSuccess} fieldsFn={fieldsFn} />;
    if (op === 'update') return <UpdatePanel isFile={isFile} onSuccess={onSuccess} fieldsFn={fieldsFn} />;
    if (op === 'replace') return <ReplacePanel isFile={isFile} onSuccess={onSuccess} fieldsFn={fieldsFn} />;
    return null;
  });
}

function InsertPanel({ isFile, onSuccess, fieldsFn }) {
  const editorRef = useRef(null);
  const hintRef = useRef(null);
  const [fileDocs, setFileDocs] = useState(null);

  async function handleSubmit() {
    const collection = selectedCollection.value;
    let docs;
    try {
      if (isFile) {
        if (!fileDocs) { hintRef.current.textContent = 'No file selected'; return; }
        docs = fileDocs;
      } else {
        if (!editorRef.current?.isValid()) { hintRef.current.textContent = 'Invalid JSON'; return; }
        docs = editorRef.current.getParsed();
      }
    } catch (e) { hintRef.current.textContent = e.message; return; }

    if (!Array.isArray(docs)) docs = [docs];
    if (docs.length === 0) { hintRef.current.textContent = 'No documents'; return; }

    try {
      loading.value = true;
      error.value = null;
      if (docs.length === 1) await api.insertOne(collection, docs[0]);
      else await api.insertMany(collection, docs);
      loading.value = false;
      hintRef.current.style.color = 'var(--success)';
      hintRef.current.textContent = `Inserted ${docs.length} document${docs.length !== 1 ? 's' : ''}`;
      setTimeout(() => { closeModal(); if (onSuccess) onSuccess(); }, 500);
    } catch (err) {
      loading.value = false;
      hintRef.current.style.color = '';
      hintRef.current.textContent = err.message;
    }
  }

  return (
    <div class="modal-body">
      {isFile ? (
        <div>
          <div class="modal-field-label">Select a JSON file with documents to insert:</div>
          <FileInput onParsed={setFileDocs} />
        </div>
      ) : (
        <div>
          <div class="modal-field-label">Document or array of documents:</div>
          <JsonEditor value={'{\n  \n}'} minHeight="200px" fields={fieldsFn} editorRef={editorRef} />
        </div>
      )}
      <div ref={hintRef} class="input-hint"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onClick={closeModal}>Cancel</button>
        <button class="btn btn-success" onClick={handleSubmit}>Insert</button>
      </div>
    </div>
  );
}

function UpdatePanel({ isFile, onSuccess, fieldsFn }) {
  const filterRef = useRef(null);
  const updateRef = useRef(null);
  const hintRef = useRef(null);
  const matchFieldsRef = useRef(null);
  const [fileDocs, setFileDocs] = useState(null);

  async function handleSubmit() {
    const collection = selectedCollection.value;
    hintRef.current.style.color = '';

    if (isFile) {
      if (!fileDocs) { hintRef.current.textContent = 'No file selected'; return; }
      const keys = getSelectedMatchFields(matchFieldsRef.current);
      if (keys.length === 0) { hintRef.current.textContent = 'Select at least one match field'; return; }
      try {
        loading.value = true;
        error.value = null;
        let updated = 0;
        for (const doc of fileDocs) {
          const filter = {};
          for (const k of keys) filter[k] = doc[k];
          const upd = { ...doc };
          for (const k of keys) delete upd[k];
          await api.updateOne(collection, filter, { $set: upd });
          updated++;
          hintRef.current.textContent = `Updating... ${updated}/${fileDocs.length}`;
        }
        loading.value = false;
        hintRef.current.style.color = 'var(--success)';
        hintRef.current.textContent = `Updated ${updated} document${updated !== 1 ? 's' : ''}`;
        setTimeout(() => { closeModal(); if (onSuccess) onSuccess(); }, 500);
      } catch (err) {
        loading.value = false;
        hintRef.current.textContent = err.message;
      }
    } else {
      if (!filterRef.current?.isValid()) { hintRef.current.textContent = 'Invalid filter'; return; }
      if (!updateRef.current?.isValid()) { hintRef.current.textContent = 'Invalid update expression'; return; }
      try {
        loading.value = true;
        error.value = null;
        const res = await api.updateMany(collection, filterRef.current.getParsed(), updateRef.current.getParsed());
        loading.value = false;
        const matched = res.result?.matched_count ?? 0;
        const modified = res.result?.modified_count ?? 0;
        hintRef.current.style.color = 'var(--success)';
        hintRef.current.textContent = `${matched} matched, ${modified} modified`;
        setTimeout(() => { closeModal(); if (onSuccess) onSuccess(); }, 500);
      } catch (err) {
        loading.value = false;
        hintRef.current.textContent = err.message;
      }
    }
  }

  return (
    <div class="modal-body">
      {isFile ? (
        <div>
          <div class="modal-field-label">1. Select a JSON file with documents:</div>
          <FileInput onParsed={setFileDocs} />
          {fileDocs && (
            <div>
              <div class="modal-field-label" style="margin-top:10px">2. Select field(s) to match existing documents:</div>
              <div class="modal-message" style="font-size:11px">Each record will be matched by these fields. Remaining fields will be updated with $set.</div>
              <MatchFields docs={fileDocs} matchFieldsRef={matchFieldsRef} />
            </div>
          )}
        </div>
      ) : (
        <div>
          <div class="modal-field-label">Filter:</div>
          <JsonEditor value="{}" minHeight="80px" mode="query" fields={fieldsFn} editorRef={filterRef} />
          <div class="modal-field-label" style="margin-top:8px">Update expression:</div>
          <JsonEditor value={'{\n  "$set": {\n    \n  }\n}'} minHeight="120px" mode="update" fields={fieldsFn} editorRef={updateRef} />
        </div>
      )}
      <div ref={hintRef} class="input-hint"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onClick={closeModal}>Cancel</button>
        <button class="btn btn-primary" onClick={handleSubmit}>Update</button>
      </div>
    </div>
  );
}

function ReplacePanel({ isFile, onSuccess, fieldsFn }) {
  const filterRef = useRef(null);
  const replaceRef = useRef(null);
  const hintRef = useRef(null);
  const matchFieldsRef = useRef(null);
  const [fileDocs, setFileDocs] = useState(null);

  async function handleSubmit() {
    const collection = selectedCollection.value;
    hintRef.current.style.color = '';

    if (isFile) {
      if (!fileDocs) { hintRef.current.textContent = 'No file selected'; return; }
      const keys = getSelectedMatchFields(matchFieldsRef.current);
      if (keys.length === 0) { hintRef.current.textContent = 'Select at least one match field'; return; }
      try {
        loading.value = true;
        error.value = null;
        let replaced = 0;
        for (const doc of fileDocs) {
          const filter = {};
          for (const k of keys) filter[k] = doc[k];
          const replacement = { ...doc };
          delete replacement._id;
          await api.replaceOne(collection, filter, replacement);
          replaced++;
          hintRef.current.textContent = `Replacing... ${replaced}/${fileDocs.length}`;
        }
        loading.value = false;
        hintRef.current.style.color = 'var(--success)';
        hintRef.current.textContent = `Replaced ${replaced} document${replaced !== 1 ? 's' : ''}`;
        setTimeout(() => { closeModal(); if (onSuccess) onSuccess(); }, 500);
      } catch (err) {
        loading.value = false;
        hintRef.current.textContent = err.message;
      }
    } else {
      if (!filterRef.current?.isValid()) { hintRef.current.textContent = 'Invalid filter'; return; }
      if (!replaceRef.current?.isValid()) { hintRef.current.textContent = 'Invalid replacement document'; return; }
      try {
        loading.value = true;
        error.value = null;
        await api.replaceOne(collection, filterRef.current.getParsed(), replaceRef.current.getParsed());
        loading.value = false;
        hintRef.current.style.color = 'var(--success)';
        hintRef.current.textContent = 'Document replaced';
        setTimeout(() => { closeModal(); if (onSuccess) onSuccess(); }, 500);
      } catch (err) {
        loading.value = false;
        hintRef.current.textContent = err.message;
      }
    }
  }

  return (
    <div class="modal-body">
      {isFile ? (
        <div>
          <div class="modal-field-label">1. Select a JSON file with documents:</div>
          <FileInput onParsed={setFileDocs} />
          {fileDocs && (
            <div>
              <div class="modal-field-label" style="margin-top:10px">2. Select field(s) to match existing documents:</div>
              <div class="modal-message" style="font-size:11px">Each record will be matched by these fields and the entire document will be replaced.</div>
              <MatchFields docs={fileDocs} matchFieldsRef={matchFieldsRef} />
            </div>
          )}
        </div>
      ) : (
        <div>
          <div class="modal-field-label">Filter (match one document):</div>
          <JsonEditor value="{}" minHeight="80px" mode="query" fields={fieldsFn} editorRef={filterRef} />
          <div class="modal-field-label" style="margin-top:8px">Replacement document:</div>
          <JsonEditor value={'{\n  \n}'} minHeight="140px" fields={fieldsFn} editorRef={replaceRef} />
        </div>
      )}
      <div ref={hintRef} class="input-hint"></div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onClick={closeModal}>Cancel</button>
        <button class="btn btn-primary" onClick={handleSubmit}>Replace</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create DeleteMany.jsx**

Port from `src/mdh/ui/delete-many.js`.

```jsx
// src/mdh/components/DeleteMany.jsx
import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { selectedCollection, loading, error } from '../store.js';
import { openModal, closeModal } from './Modal.jsx';
import JsonEditor from './JsonEditor.jsx';
import * as api from '../api.js';

export function openDeleteMany(onSuccess, fieldsFn) {
  openModal('Delete Many', () => <DeleteManyBody onSuccess={onSuccess} fieldsFn={fieldsFn} />);
}

function DeleteManyBody({ onSuccess, fieldsFn }) {
  const editorRef = useRef(null);
  const hintRef = useRef(null);
  const [matchCount, setMatchCount] = useState(null);

  async function refreshCount() {
    if (!editorRef.current?.isValid()) { setMatchCount(null); return; }
    try {
      const res = await api.aggregate(selectedCollection.value, [
        { $match: editorRef.current.getParsed() },
        { $count: 'total' },
      ]);
      setMatchCount(res.result?.[0]?.total ?? 0);
    } catch {
      setMatchCount(null);
    }
  }

  useEffect(() => { refreshCount(); }, []);

  async function handleDelete() {
    if (!editorRef.current?.isValid()) { hintRef.current.textContent = 'Invalid JSON'; return; }
    try {
      loading.value = true;
      error.value = null;
      const res = await api.deleteMany(selectedCollection.value, editorRef.current.getParsed());
      loading.value = false;
      const count = res.result?.deleted_count ?? 0;
      hintRef.current.style.color = 'var(--success)';
      hintRef.current.textContent = `Deleted ${count} document${count !== 1 ? 's' : ''}`;
      setTimeout(() => { closeModal(); if (onSuccess) onSuccess(); }, 1200);
    } catch (err) {
      loading.value = false;
      hintRef.current.style.color = '';
      hintRef.current.textContent = err.message;
    }
  }

  return (
    <div class="modal-body">
      <p class="modal-message" style="color:var(--danger)">
        This will delete ALL documents matching the filter. This action cannot be undone.
      </p>
      <div class="modal-field-label">Filter:</div>
      <JsonEditor value="{}" minHeight="100px" mode="query" fields={fieldsFn} editorRef={editorRef} onValidChange={refreshCount} />
      <div ref={hintRef} class="input-hint"></div>
      {matchCount !== null && (
        <div class="modal-count-info">{matchCount} document{matchCount !== 1 ? 's' : ''} will be deleted</div>
      )}
      <div class="modal-actions">
        <button class="btn btn-secondary" onClick={closeModal}>Cancel</button>
        <button class="btn btn-danger" onClick={handleDelete}>Delete</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/mdh/components/QueryHistory.jsx src/mdh/components/RecordEditor.jsx src/mdh/components/DataOperations.jsx src/mdh/components/DeleteMany.jsx
git commit -m "add QueryHistory, RecordEditor, DataOperations, DeleteMany components"
```

---

## Task 10: Create PlaceholderInputs, PipelineDebug, RecordList, PipelineEditor

The remaining DataPanel children.

**Files:**
- Create: `src/mdh/components/PlaceholderInputs.jsx`
- Create: `src/mdh/components/PipelineDebug.jsx`
- Create: `src/mdh/components/RecordList.jsx`
- Create: `src/mdh/components/PipelineEditor.jsx`

- [ ] **Step 1: Create PlaceholderInputs.jsx**

Port from `records.js:279-390`. Variable inputs extracted from pipeline text, including the "Fill from Annotation" feature.

```jsx
// src/mdh/components/PlaceholderInputs.jsx
import { h } from 'preact';
import { useState, useRef } from 'preact/hooks';
import { domain, token } from '../store.js';

function parseAnnotationId(input) {
  if (/^\d+$/.test(input)) return input;
  const urlMatch = input.match(/annotations\/(\d+)/);
  return urlMatch ? urlMatch[1] : null;
}

async function fetchAnnotationFields(annotId) {
  const res = await fetch(`${domain.value}/api/v1/annotations/${annotId}/content`, {
    headers: { Authorization: `Bearer ${token.value}` },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const fields = {};
  extractDatapoints(data.results || data.content || [], fields);
  return fields;
}

function extractDatapoints(nodes, fields) {
  for (const node of nodes) {
    if (node.schema_id && node.content && node.content.value != null && node.content.value !== '') {
      fields[node.schema_id] = String(node.content.value);
    }
    if (node.children) extractDatapoints(node.children, fields);
  }
}

export default function PlaceholderInputs({ names, values, onSetValue, onRunQuery }) {
  const [annotRow, setAnnotRow] = useState(false);
  const [annotStatus, setAnnotStatus] = useState('');

  if (names.length === 0) return null;

  async function loadAnnotation(val) {
    const annotId = parseAnnotationId(val);
    if (!annotId) { setAnnotStatus('Invalid ID'); return; }
    setAnnotStatus('Loading\u2026');
    try {
      const fields = await fetchAnnotationFields(annotId);
      let filled = 0;
      for (const name of names) {
        if (name in fields) { onSetValue(name, fields[name]); filled++; }
      }
      setAnnotStatus(filled > 0 ? `${filled} filled` : 'No matches');
      if (filled > 0) onRunQuery();
    } catch (err) {
      setAnnotStatus(err.message.length > 30 ? err.message.slice(0, 30) + '\u2026' : err.message);
    }
  }

  return (
    <div class="placeholder-container">
      <div class="placeholder-header">
        <div class="placeholder-label">Variables:</div>
        <button class="placeholder-annotation-btn" onClick={() => setAnnotRow(!annotRow)}>Fill from Annotation</button>
      </div>
      {annotRow && (
        <div class="placeholder-annotation-row">
          <input
            class="input"
            placeholder="Annotation ID or URL\u2026"
            style="flex:1"
            onKeyDown={(e) => { if (e.key === 'Enter') loadAnnotation(e.target.value.trim()); }}
            onPaste={(e) => { setTimeout(() => loadAnnotation(e.target.value.trim()), 0); }}
          />
          <span class="placeholder-annotation-status">{annotStatus}</span>
        </div>
      )}
      {names.map((name) => (
        <div class="placeholder-row" key={name}>
          <span class="placeholder-name">{`{${name}}`}</span>
          <input
            class="input placeholder-input"
            value={values[name] || ''}
            onInput={(e) => {
              onSetValue(name, e.target.value);
              // Debounced run handled by parent
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') onRunQuery(); }}
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create PipelineDebug.jsx**

Port from `records.js:440-634`. Stage-by-stage aggregation debug panel showing document counts at each stage.

```jsx
// src/mdh/components/PipelineDebug.jsx
import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { selectedCollection } from '../store.js';
import { openModal } from './Modal.jsx';
import * as api from '../api.js';

const DEBUG_PREVIEW_LIMIT = 5;

function StageTooltip({ stage, children }) {
  const [show, setShow] = useState(false);
  const rowRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function onEnter() {
    const rect = rowRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.top, left: rect.right + 8 });
    setShow(true);
  }

  return (
    <div ref={rowRef} onMouseEnter={onEnter} onMouseLeave={() => setShow(false)} style="position:relative">
      {children}
      {show && (
        <div class="pipeline-debug-tooltip" style={`position:fixed;top:${pos.top}px;left:${pos.left}px`}>
          <pre>{JSON.stringify(stage, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default function PipelineDebug({ pipeline, totalCount, onTotalCountNeeded }) {
  const [stageCounts, setStageCounts] = useState({});
  const collection = selectedCollection.value;

  useEffect(() => {
    if (!collection || !pipeline || pipeline.length === 0) return;
    setStageCounts({});

    // Request total count if needed
    if (totalCount === null && onTotalCountNeeded) onTotalCountNeeded();

    // Fetch counts in parallel
    pipeline.forEach((_, i) => {
      const prefix = pipeline.slice(0, i + 1);
      api.aggregate(collection, [...prefix, { $count: 'n' }])
        .then((res) => {
          const n = res.result?.[0]?.n ?? 0;
          setStageCounts((prev) => ({ ...prev, [i]: { count: n } }));
        })
        .catch((err) => {
          setStageCounts((prev) => ({ ...prev, [i]: { error: err.message } }));
        });
    });
  }, [collection, JSON.stringify(pipeline)]);

  if (!pipeline || pipeline.length === 0) return null;

  function inspectStage(stageIndex, stageKey) {
    const prefix = pipeline.slice(0, stageIndex + 1);
    openModal(`Stage ${stageIndex + 1}: ${stageKey}`, () => <StageInspector collection={collection} prefix={prefix} stageIndex={stageIndex} stageKey={stageKey} />);
  }

  return (
    <div class="pipeline-debug">
      <div class="placeholder-label">Aggregation Pipeline Debug</div>
      <div class="pipeline-debug-row pipeline-debug-total">
        <span class="pipeline-debug-stage">collection</span>
        <span class="pipeline-debug-arrow">{'\u2192'}</span>
        <span class="pipeline-debug-count">{totalCount !== null ? `${totalCount.toLocaleString()} docs` : '\u2026'}</span>
      </div>
      {pipeline.map((stage, i) => {
        const stageKey = Object.keys(stage)[0] || '?';
        const stageStr = JSON.stringify(stage);
        const preview = stageStr.length > 50 ? stageStr.slice(0, 50) + '\u2026' : stageStr;
        const info = stageCounts[i];
        let countText = '\u2026';
        let countCls = 'pipeline-debug-count';
        if (info) {
          if (info.error) { countText = 'error'; countCls += ' pipeline-debug-error'; }
          else { countText = `${info.count.toLocaleString()} docs`; if (info.count === 0) countCls += ' pipeline-debug-zero'; }
        }

        return (
          <StageTooltip stage={stage}>
            <div class="pipeline-debug-row" onClick={() => inspectStage(i, stageKey)}>
              <span class="pipeline-debug-num">{i + 1}.</span>
              <span class="pipeline-debug-stage">{stageKey}</span>
              <span class="pipeline-debug-preview">{preview}</span>
              <span class="pipeline-debug-arrow">{'\u2192'}</span>
              <span class={countCls} title={info?.error || ''}>{countText}</span>
            </div>
          </StageTooltip>
        );
      })}
    </div>
  );
}

function StageInspector({ collection, prefix, stageIndex, stageKey }) {
  const [docs, setDocs] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.aggregate(collection, [...prefix, { $limit: DEBUG_PREVIEW_LIMIT }])
      .then((res) => setDocs(res.result || []))
      .catch((e) => setErr(e.message));
  }, []);

  return (
    <div class="modal-body">
      <div class="pipeline-inspect-info">Showing first {DEBUG_PREVIEW_LIMIT} documents after stage {stageIndex + 1} ({stageKey})</div>
      <div class="pipeline-inspect-content">
        {err && <span style="color:var(--danger)">Error: {err}</span>}
        {docs && docs.length === 0 && <span style="color:var(--text-secondary)">No documents at this stage</span>}
        {docs && docs.map((doc, i) => (
          <div class="pipeline-inspect-card">
            <div class="pipeline-inspect-card-header">Document {i + 1}</div>
            <pre class="pipeline-inspect-json">{JSON.stringify(doc, null, 2)}</pre>
          </div>
        ))}
        {!docs && !err && 'Loading\u2026'}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create RecordList.jsx**

Wraps RecordCard instances with empty state and pagination.

```jsx
// src/mdh/components/RecordList.jsx
import { h } from 'preact';
import { useState } from 'preact/hooks';
import { skip, limit } from '../store.js';
import RecordCard from './RecordCard.jsx';
import JSON5 from 'json5';

export default function RecordList({ records, pipelineText, filterState, sortState, lastQueryMs, totalCount, pagination, onSort, onFilter, onEdit, onDelete, onRefresh }) {
  const [expandedSet, setExpandedSet] = useState(new Set([0]));
  const [expandAll, setExpandAll] = useState(false);

  function toggleExpand(idx) {
    const next = new Set(expandedSet);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setExpandedSet(next);
    setExpandAll(false);
  }

  function toggleExpandAll() {
    if (expandAll || expandedSet.size >= records.length) {
      setExpandedSet(new Set());
      setExpandAll(false);
    } else {
      setExpandAll(true);
      setExpandedSet(new Set());
    }
  }

  const allExpanded = expandAll || (records.length > 0 && expandedSet.size >= records.length);

  // Empty state logic
  let emptyContent = null;
  if (records.length === 0) {
    let hasNonTrivialPipeline = Object.keys(filterState).length > 0 || Object.keys(sortState).length > 0;
    if (!hasNonTrivialPipeline && pipelineText) {
      try {
        const pipeline = JSON5.parse(pipelineText);
        if (Array.isArray(pipeline)) {
          hasNonTrivialPipeline = pipeline.some((stage) => {
            if (stage.$match && Object.keys(stage.$match).length > 0) return true;
            if (stage.$project || stage.$group || stage.$unwind || stage.$lookup) return true;
            return false;
          });
        }
      } catch { /* ignore */ }
    }

    if (skip.value > 0) {
      emptyContent = <div class="record-list-empty"><p>No more records on this page</p><p class="record-list-empty-hint">Try going back to the previous page</p></div>;
    } else if (hasNonTrivialPipeline) {
      emptyContent = <div class="record-list-empty"><p>0 records match the current query</p><p class="record-list-empty-hint">Try modifying the pipeline or click Reset</p></div>;
    } else {
      emptyContent = <div class="record-list-empty"><p>No records</p></div>;
    }
  }

  // Count text
  const s = skip.value;
  const l = limit.value;
  let countText = records.length > 0 ? `Showing ${s + 1}\u2013${s + records.length}` : 'No records';
  if (totalCount !== null) countText += ` (out of ${totalCount})`;
  if (lastQueryMs) countText += ` \u00b7 ${lastQueryMs}ms`;

  return (
    <div>
      <div class="toolbar">
        <div class="toolbar-group">
          <button class="btn btn-sm" onClick={() => onRefresh('reset')}>Reset</button>
          <button class="btn btn-sm" onClick={toggleExpandAll}>{allExpanded ? 'Collapse All' : 'Expand All'}</button>
        </div>
        <div style="flex:1"></div>
        <div class="toolbar-group">
          <button class="btn btn-sm" title="Download entire collection as JSON" onClick={() => onRefresh('download')}>Download all</button>
          <SplitButton label="Insert" cls="btn-success" onMain={() => onRefresh('insert')} onFile={() => onRefresh('insert-file')} />
        </div>
      </div>
      <div class="record-list">
        {emptyContent}
        {records.map((record, i) => (
          <RecordCard
            key={i}
            record={record}
            index={i}
            expanded={expandAll || expandedSet.has(i)}
            onToggle={toggleExpand}
            onCopy={() => {}}
            onEdit={onEdit}
            onDelete={onDelete}
            sortState={sortState}
            filterState={filterState}
            onSort={onSort}
            onFilter={onFilter}
          />
        ))}
      </div>
      <div class="pagination">
        <span class={'record-count' + (lastQueryMs > 1000 ? ' record-count-slow' : '')}>{countText}</span>
        <span class="pagination-hint">Click key to sort {'\u00b7'} Click value to filter</span>
        <div class="pagination-controls">
          <button disabled={!pagination.hasPrev()} onClick={pagination.goPrev}>{'\u2190'} Prev</button>
          <span>Page {pagination.page()}</span>
          <button disabled={!pagination.hasNext(records.length)} onClick={pagination.goNext}>Next {'\u2192'}</button>
        </div>
      </div>
    </div>
  );
}

function SplitButton({ label, cls, onMain, onFile }) {
  const [open, setOpen] = useState(false);

  return (
    <div class="split-btn">
      <button class={`btn btn-sm ${cls}`} onClick={onMain}>{label}</button>
      <button class={`btn btn-sm split-btn-drop ${cls}`} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>{'\u25BE'}</button>
      {open && (
        <div class="toolbar-more-menu">
          <button class="toolbar-menu-item" onClick={() => { setOpen(false); onFile(); }}>{label} from JSON file</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create PipelineEditor.jsx**

The left pane: pipeline JsonEditor + query action buttons (save, saved queries, history, beautify).

```jsx
// src/mdh/components/PipelineEditor.jsx
import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import { selectedCollection, records } from '../store.js';
import { extractFieldNames } from './JsonEditor.jsx';
import JsonEditor from './JsonEditor.jsx';
import { HistoryPanel, SavedPanel, saveQuery, unsaveQuery, isSaved } from './QueryHistory.jsx';
import JSON5 from 'json5';

export default function PipelineEditor({ editorRef, initialValue, onChange, onValidChange, onLoadPipeline }) {
  const [savedState, setSavedState] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const saveInputRef = useRef(null);

  const fieldsFn = () => extractFieldNames(records.value);

  async function updateSaveBtn() {
    const col = selectedCollection.value;
    if (!col || !editorRef.current) return;
    const saved = await isSaved(col, editorRef.current.getValue());
    setSavedState(saved);
  }

  useEffect(() => { updateSaveBtn(); }, [selectedCollection.value]);

  function beautify() {
    if (!editorRef.current) return;
    try {
      const parsed = JSON5.parse(editorRef.current.getValue());
      editorRef.current.setValue(JSON.stringify(parsed, null, 2));
    } catch { /* invalid JSON, ignore */ }
  }

  async function handleSave() {
    const collection = selectedCollection.value;
    if (!collection || !editorRef.current) return;
    if (savedState) {
      await unsaveQuery(collection, editorRef.current.getValue());
      updateSaveBtn();
      return;
    }
    setShowSaveInput(true);
    setTimeout(() => saveInputRef.current?.focus(), 0);
  }

  async function doSave() {
    const name = saveInputRef.current?.value.trim();
    const collection = selectedCollection.value;
    await saveQuery(collection, editorRef.current.getValue(), name || null, {});
    setShowSaveInput(false);
    updateSaveBtn();
  }

  function loadFromPanel(pipeline, collection, variables) {
    setShowHistory(false);
    setShowSaved(false);
    onLoadPipeline(pipeline, collection, variables);
  }

  return (
    <div>
      <div class="pipeline-header">
        <span class="split-pane-label">Aggregate Pipeline</span>
        <div class="pipeline-header-actions">
          <button
            class={'pipeline-save-btn' + (savedState ? ' pipeline-save-btn-active' : '')}
            title="Save current query"
            onClick={handleSave}
          >
            {savedState ? '\u2605' : '\u2606'}
          </button>
          <button class="pipeline-action-btn" onClick={() => { setShowSaved(!showSaved); setShowHistory(false); }}>Saved Queries</button>
          <button class="pipeline-action-btn" onClick={() => { setShowHistory(!showHistory); setShowSaved(false); }}>Query History</button>
          <button class="pipeline-action-btn" onClick={beautify}>Beautify</button>
        </div>
      </div>
      {showSaveInput && (
        <div class="pipeline-save-inline">
          <input ref={saveInputRef} class="input" placeholder="Query name\u2026" onKeyDown={(e) => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') setShowSaveInput(false); }} />
          <button class="btn btn-sm btn-primary" onClick={doSave}>Save</button>
        </div>
      )}
      {showHistory && <HistoryPanel onLoad={loadFromPanel} onDismiss={() => setShowHistory(false)} />}
      {showSaved && <SavedPanel onLoad={loadFromPanel} onDismiss={() => setShowSaved(false)} />}
      <JsonEditor
        value={initialValue}
        mode="aggregate"
        fields={fieldsFn}
        editorRef={editorRef}
        onChange={onChange}
        onValidChange={() => { onValidChange(); updateSaveBtn(); }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/mdh/components/PlaceholderInputs.jsx src/mdh/components/PipelineDebug.jsx src/mdh/components/RecordList.jsx src/mdh/components/PipelineEditor.jsx
git commit -m "add PlaceholderInputs, PipelineDebug, RecordList, PipelineEditor components"
```

---

## Task 11: Create DataPanel — the main orchestrator

Wires together the pipeline editor, hooks, and record display.

**Files:**
- Create: `src/mdh/components/DataPanel.jsx`

- [ ] **Step 1: Create DataPanel.jsx**

This is the central component that replaces `records.js`. It uses the three custom hooks and composes the sub-components.

```jsx
// src/mdh/components/DataPanel.jsx
import { h } from 'preact';
import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { selectedCollection, records, skip, limit, loading, error } from '../store.js';
import { usePipeline } from '../hooks/usePipeline.js';
import { useQuery } from '../hooks/useQuery.js';
import { usePagination } from '../hooks/usePagination.js';
import { extractFieldNames } from './JsonEditor.jsx';
import PipelineEditor from './PipelineEditor.jsx';
import PlaceholderInputs from './PlaceholderInputs.jsx';
import PipelineDebug from './PipelineDebug.jsx';
import RecordList from './RecordList.jsx';
import { openRecordEditor } from './RecordEditor.jsx';
import { openDataOperations } from './DataOperations.jsx';
import { openDeleteMany } from './DeleteMany.jsx';
import { confirmModal } from './Modal.jsx';
import { addToHistory } from './QueryHistory.jsx';
import * as api from '../api.js';
import * as cache from '../cache.js';
import JSON5 from 'json5';

export default function DataPanel() {
  const editorRef = useRef(null);
  const pipeline = usePipeline();
  const query = useQuery();
  const pagination = usePagination();
  const leftRef = useRef(null);

  const collection = selectedCollection.value;

  // Build the current pipeline text for the editor
  function buildInitialPipeline() {
    const p = pipeline.buildPipelineFromUI();
    p.push({ $limit: limit.value });
    return JSON.stringify(p, null, 2);
  }

  // Sync editor to UI state
  function syncPipeline() {
    if (!editorRef.current) return;
    const p = pipeline.buildPipelineFromUI();
    p.push({ $limit: limit.value });
    pipeline.suppressSync.value = true;
    editorRef.current.setValue(JSON.stringify(p, null, 2));
    setTimeout(() => { pipeline.suppressSync.value = false; }, 600);
  }

  function syncPipelineAndRun() {
    syncPipeline();
    runQuery();
  }

  async function runQuery() {
    if (!collection || !editorRef.current) return;
    const rawText = editorRef.current.getValue();
    const result = await query.runQuery(collection, rawText, pipeline.substitutePlaceholders);
    if (result) {
      addToHistory(collection, rawText, { ...pipeline.placeholderValues.value });
    }
  }

  // On collection change, reset state and load
  useEffect(() => {
    if (!collection) return;
    skip.value = 0;
    pipeline.reset();

    const cachedCount = cache.get(collection, 'totalCount');
    if (cachedCount !== null) pagination.totalCount.value = cachedCount;
    else { pagination.totalCount.value = null; pagination.fetchTotalCount(collection); }

    const cachedRecords = cache.get(collection, 'records');
    if (cachedRecords !== null) {
      records.value = cachedRecords;
      // Sync editor after mount
      setTimeout(() => syncPipeline(), 50);
    } else {
      query.setCacheNextQuery(true);
      setTimeout(() => syncPipelineAndRun(), 50);
    }
  }, [collection]);

  // Invalidate and re-run
  function invalidateAndRun() {
    cache.invalidate(collection, 'records');
    cache.invalidate(collection, 'totalCount');
    pagination.totalCount.value = null;
    pagination.fetchTotalCount(collection);
    runQuery();
  }

  function currentFields() {
    return extractFieldNames(records.value);
  }

  // Pipeline editor callbacks
  function handleEditorChange() {
    if (!pipeline.suppressSync.value) {
      // User edited pipeline directly — clear UI sort/filter
      pipeline.sortState.value = {};
      pipeline.filterState.value = {};
    }
  }

  function handleValidChange() {
    if (!pipeline.suppressSync.value) runQuery();
  }

  function handleLoadPipeline(pipelineText, col, variables) {
    if (variables) pipeline.placeholderValues.value = { ...variables };
    if (col && col !== collection) {
      selectedCollection.value = col;
      setTimeout(() => {
        if (editorRef.current) {
          pipeline.suppressSync.value = true;
          editorRef.current.setValue(pipelineText);
          setTimeout(() => { pipeline.suppressSync.value = false; runQuery(); }, 100);
        }
      }, 50);
    } else if (editorRef.current) {
      pipeline.suppressSync.value = true;
      editorRef.current.setValue(pipelineText);
      setTimeout(() => { pipeline.suppressSync.value = false; runQuery(); }, 100);
    }
  }

  // Sort/filter from JsonTree
  function handleSort(field) {
    pipeline.toggleSort(field);
    syncPipelineAndRun();
  }

  function handleFilter(field, value) {
    pipeline.toggleFilter(field, value);
    syncPipelineAndRun();
  }

  // Toolbar actions
  function handleToolbarAction(action) {
    if (action === 'reset') {
      pipeline.reset();
      syncPipelineAndRun();
    } else if (action === 'download') {
      downloadCollection();
    } else if (action === 'insert') {
      openDataOperations('insert', invalidateAndRun, currentFields);
    } else if (action === 'insert-file') {
      openDataOperations('insert-file', invalidateAndRun, currentFields);
    }
  }

  // Placeholder handling
  const pipelineText = editorRef.current ? editorRef.current.getValue() : '';
  const placeholderNames = pipeline.extractPlaceholders(pipelineText);

  function handleSetPlaceholder(name, value) {
    pipeline.setPlaceholder(name, value);
    // Debounced — parent runs query after 400ms
    clearTimeout(handleSetPlaceholder._timer);
    handleSetPlaceholder._timer = setTimeout(runQuery, 400);
  }

  // Download
  async function downloadCollection() {
    const tc = pagination.totalCount.value;
    if (tc !== null && tc > 10_000) {
      const proceed = await new Promise((resolve) => {
        confirmModal(
          'Large collection',
          `This collection has ${tc.toLocaleString()} documents. Downloading may take a while and use significant memory. Continue?`,
          () => resolve(true),
        );
        // If closed without confirming
        const check = setInterval(() => {
          if (!document.querySelector('.modal-overlay.visible')) { clearInterval(check); resolve(false); }
        }, 200);
      });
      if (!proceed) return;
    }

    const BATCH = 1000;
    const allDocs = [];
    let s = 0;
    try {
      error.value = null;
      while (true) {
        const res = await api.aggregate(collection, [{ $match: {} }, { $skip: s }, { $limit: BATCH }]);
        const batch = res.result || [];
        allDocs.push(...batch);
        if (batch.length < BATCH) break;
        s += BATCH;
      }
      const json = JSON.stringify(allDocs, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${collection}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      error.value = { message: `Download failed: ${err.message}` };
    }
  }

  // Parse pipeline for debug display
  let parsedPipeline = null;
  try {
    const text = editorRef.current ? pipeline.substitutePlaceholders(editorRef.current.getValue()) : '';
    parsedPipeline = JSON5.parse(text);
    if (!Array.isArray(parsedPipeline)) parsedPipeline = null;
  } catch { parsedPipeline = null; }

  // Panel resize
  useEffect(() => {
    const leftPane = leftRef.current;
    if (!leftPane) return;
    chrome.storage.local.get(['mdhPipelineWidth'], ({ mdhPipelineWidth }) => {
      if (mdhPipelineWidth) {
        leftPane.style.width = mdhPipelineWidth + 'px';
        leftPane.style.flexBasis = mdhPipelineWidth + 'px';
      }
    });
  }, []);

  function initPanelResize(e) {
    const leftPane = leftRef.current;
    if (!leftPane) return;
    const startX = e.clientX;
    const startWidth = leftPane.getBoundingClientRect().width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMove(e) {
      const w = Math.max(200, Math.min(800, startWidth + e.clientX - startX));
      leftPane.style.width = w + 'px';
      leftPane.style.flexBasis = w + 'px';
    }
    function onUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (editorRef.current) editorRef.current.refresh();
      chrome.storage.local.set({ mdhPipelineWidth: leftPane.getBoundingClientRect().width });
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <div class="panel" style="display:flex;flex-direction:row">
      <div class="data-panel-left" ref={leftRef}>
        <PipelineEditor
          editorRef={editorRef}
          initialValue={buildInitialPipeline()}
          onChange={handleEditorChange}
          onValidChange={handleValidChange}
          onLoadPipeline={handleLoadPipeline}
        />
        <PlaceholderInputs
          names={placeholderNames}
          values={pipeline.placeholderValues.value}
          onSetValue={handleSetPlaceholder}
          onRunQuery={runQuery}
        />
        <PipelineDebug
          pipeline={parsedPipeline}
          totalCount={pagination.totalCount.value}
          onTotalCountNeeded={() => pagination.fetchTotalCount(collection)}
        />
      </div>
      <div class="data-panel-resizer" onMouseDown={initPanelResize}></div>
      <div class="data-panel-right">
        <RecordList
          records={records.value}
          pipelineText={pipelineText}
          filterState={pipeline.filterState.value}
          sortState={pipeline.sortState.value}
          lastQueryMs={query.lastQueryMs.value}
          totalCount={pagination.totalCount.value}
          pagination={pagination}
          onSort={handleSort}
          onFilter={handleFilter}
          onEdit={(record) => openRecordEditor('edit', record, invalidateAndRun, currentFields)}
          onDelete={(record, idx) => {
            const deleteId = record._id?.$oid || record._id || '?';
            confirmModal('Delete record?', `Delete record with _id "${deleteId}"? This cannot be undone.`, async () => {
              try {
                loading.value = true;
                error.value = null;
                await api.deleteOne(collection, { _id: record._id });
                invalidateAndRun();
              } catch (err) {
                error.value = { message: err.message };
                loading.value = false;
              }
            });
          }}
          onRefresh={handleToolbarAction}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/mdh/components/DataPanel.jsx
git commit -m "add DataPanel orchestrator component"
```

---

## Task 12: Create App.jsx and index.jsx — wire it all together

**Files:**
- Create: `src/mdh/components/App.jsx`
- Create: `src/mdh/index.jsx`

- [ ] **Step 1: Create App.jsx**

```jsx
// src/mdh/components/App.jsx
import { h } from 'preact';
import { selectedCollection, activePanel } from '../store.js';
import Sidebar from './Sidebar.jsx';
import SidebarResizer from './SidebarResizer.jsx';
import ConnectionBar from './ConnectionBar.jsx';
import ErrorBanner from './ErrorBanner.jsx';
import LoadingOverlay from './LoadingOverlay.jsx';
import TabBar from './TabBar.jsx';
import Modal from './Modal.jsx';
import DataPanel from './DataPanel.jsx';
import IndexPanel from './IndexPanel.jsx';
import SearchIndexPanel from './SearchIndexPanel.jsx';

export default function App({ connected }) {
  return (
    <div id="app">
      <Sidebar />
      <SidebarResizer />
      <main class="main">
        <ConnectionBar connected={connected} />
        <ErrorBanner />
        <LoadingOverlay />
        <Modal />
        {selectedCollection.value ? (
          <div class="main-content">
            <TabBar />
            {activePanel.value === 'data' && <DataPanel />}
            {activePanel.value === 'indexes' && <IndexPanel />}
            {activePanel.value === 'search-indexes' && <SearchIndexPanel />}
          </div>
        ) : (
          <div class="empty-state"><p>Select a collection to get started</p></div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create index.jsx**

```jsx
// src/mdh/index.jsx
import { h, render } from 'preact';
import { effect } from '@preact/signals';
import * as api from './api.js';
import * as store from './store.js';
import * as cache from './cache.js';
import App from './components/App.jsx';

async function boot() {
  const { mdhToken, mdhDomain } = await chrome.storage.local.get(['mdhToken', 'mdhDomain']);

  if (!mdhToken || !mdhDomain) {
    render(<App connected={false} />, document.getElementById('app'));
    return;
  }

  store.domain.value = mdhDomain;
  store.token.value = mdhToken;
  api.init(mdhDomain, mdhToken);

  let connected = false;
  try {
    await api.healthz();
    connected = true;
  } catch {
    connected = false;
  }

  render(<App connected={connected} />, document.getElementById('app'));

  // Background prefetch when collection changes
  let prefetchController = null;

  effect(() => {
    const selected = store.selectedCollection.value;
    const collections = store.collections.value;
    if (!selected || collections.length === 0) return;

    if (prefetchController) prefetchController.abort();
    prefetchController = new AbortController();
    const signal = prefetchController.signal;

    const others = collections.filter((c) => c !== selected);
    prefetchBatches(others, signal);
  });
}

async function prefetchBatches(collections, signal) {
  const BATCH = 5;
  const DELAY = 200;
  for (let i = 0; i < collections.length; i += BATCH) {
    if (signal.aborted) return;
    const batch = collections.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map((col) =>
        Promise.allSettled([
          prefetchRecords(col),
          prefetchTotalCount(col),
        ]),
      ),
    );
    if (i + BATCH < collections.length && !signal.aborted) {
      await new Promise((r) => setTimeout(r, DELAY));
    }
  }
}

async function prefetchRecords(collection) {
  if (cache.get(collection, 'records') !== null) return;
  try {
    const res = await api.aggregate(collection, [{ $match: {} }, { $skip: 0 }, { $limit: store.limit.value }]);
    cache.set(collection, 'records', res.result || []);
  } catch { /* silent */ }
}

async function prefetchTotalCount(collection) {
  if (cache.get(collection, 'totalCount') !== null) return;
  try {
    const res = await api.aggregate(collection, [{ $count: 'total' }]);
    cache.set(collection, 'totalCount', res.result?.[0]?.total ?? 0);
  } catch { /* silent */ }
}

boot();
```

- [ ] **Step 3: Commit**

```bash
git add src/mdh/components/App.jsx src/mdh/index.jsx
git commit -m "add App component and index.jsx boot entry point"
```

---

## Task 13: Delete old files and update CSS

**Files:**
- Delete: `src/mdh/index.js`, `src/mdh/state.js`, `src/mdh/ui/` (all files)
- Modify: `src/mdh/mdh.css`

- [ ] **Step 1: Delete old files**

```bash
rm src/mdh/index.js src/mdh/state.js
rm -r src/mdh/ui
```

- [ ] **Step 2: Remove `.hidden` class and dead selectors from mdh.css**

In `mdh.css`, the `.hidden` utility class is used extensively for show/hide toggling. Remove the `.hidden` rule since Preact conditionally renders instead. Keep everything else.

Find and remove this CSS rule:

```css
.hidden { display: none !important; }
```

If the `.hidden` class appears in any other selectors (like `.error-banner.hidden`), those combination selectors should also be removed since the elements are no longer toggled via class — they're conditionally rendered.

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Expected: Build succeeds. All 5 entry points compile. Check `dist/mdh/mdh.js` exists and is a valid bundle.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "remove old vanilla JS files, clean up CSS for Preact migration"
```

---

## Task 14: Manual verification

Load the extension in Chrome and verify all features work.

- [ ] **Step 1: Load extension**

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable Developer mode
4. Load unpacked from the `dist/` directory

- [ ] **Step 2: Verify connection flow**

1. Open a Rossum page, click the extension popup, click "Data Storage"
2. Verify the MDH page opens
3. Verify it shows "Connected to {domain}"

- [ ] **Step 3: Verify core functionality**

1. Collections load in sidebar
2. Click a collection — records appear
3. Pipeline editor has syntax highlighting and MongoDB autocompletion
4. Click a key in a record — sorts (arrow indicator appears)
5. Click a value — filters (value highlights, pipeline updates)
6. Pagination works (next/prev)
7. Expand/collapse records works
8. Reset button clears sort/filter/pipeline

- [ ] **Step 4: Verify modals**

1. Create collection (sidebar + button)
2. Rename collection
3. Drop collection (with confirmation)
4. Insert document (manual)
5. Edit record
6. Delete record
7. Delete many

- [ ] **Step 5: Verify tabs**

1. Indexes tab loads and displays indexes
2. Create index modal works
3. Search Indexes tab loads
4. Create search index modal works

- [ ] **Step 6: Verify pipeline features**

1. Pipeline debug shows stage counts
2. Click a stage — inspect modal shows documents
3. Beautify button formats JSON
4. Query history panel opens and loads a past query
5. Save a query, verify it appears in Saved Queries

- [ ] **Step 7: Verify dark mode**

1. Switch OS to dark mode (or use prefers-color-scheme override in DevTools)
2. Verify colors update correctly

- [ ] **Step 8: Commit any fixes found during verification**

```bash
git add -A
git commit -m "fix issues found during manual verification"
```
