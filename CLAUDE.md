# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3) that enhances Rossum UI, NetSuite UI, and Coupa UI for solution architects during onboarding. Published to Chrome Web Store. Community-supported, not an official Rossum product.

## Build System

Uses **esbuild** to bundle ES modules from `src/` into `dist/`. No other build tools or transpilation.

- `npm run build` — clean build into `dist/`
- `npm run dev` — watch mode (JS only; re-run build for CSS/HTML changes)
- `dist/` is the loadable Chrome extension (gitignored)
- `build.js` at project root orchestrates bundling + static asset copying

## Architecture

Five esbuild entry points produce the extension:

1. **`src/rossum/index.js`** → content script for Rossum pages
2. **`src/netsuite/index.js`** → content script for NetSuite pages
3. **`src/coupa/index.js`** → content script for Coupa pages
4. **`src/popup/popup.js`** → extension popup UI
5. **`src/mdh/index.js`** → Dataset Management standalone page (opened via `chrome.tabs.create`)

### Rossum content script

- `src/rossum/index.js` — reads chrome.storage.local settings, builds a handler array from enabled features, creates a single MutationObserver that walks added subtrees
- `src/rossum/api.js` — `fetchRossumApi()` with token auth and error-aware caching
- `src/rossum/features/` — one module per feature, each exports a `handleNode(node)` function called by the central MutationObserver for every added DOM element:
  - `schema-ids.js` — schema ID overlays on annotation fields
  - `resource-ids.js` — resource ID overlays with click-to-copy (workspaces, queues, annotations, extensions, labels, rules, users)
  - `expand-formulas.js` — auto-click "Show source code" buttons
  - `expand-reasoning.js` — auto-click "Show options" on reasoning fields
  - `scroll-lock.js` — prevents sidebar auto-scroll via `scrollTop` property descriptor patching
  - `dev-flags.js` — message handlers for devFeaturesEnabled/devDebugEnabled toggles

### Coupa content script

- `src/coupa/index.js` — uses two strategies: JSON metadata extraction from `#initial_full_react_data` (React pages like invoices) and DOM attribute extraction (Rails pages like POs). Maintains an `IGNORE_S_CLASSES` set to filter out UI framework classes.

### Dataset Management (MDH)

A standalone page (`src/mdh/`) with its own MVC-like structure:
- `api.js` — REST client wrapping Rossum's Data Storage API (collections, CRUD, indexes, search indexes)
- `state.js` — centralized state with event emitter pattern (`state.set()`, `state.on()`)
- `ui/` — UI modules: `sidebar.js`, `records.js`, `indexes.js`, `search-indexes.js`, `record-editor.js`, `json-editor.js` (CodeMirror), `modal.js`, `delete-many.js`
- Auth flows through the popup: captures token/domain from the active Rossum tab via `chrome.tabs.sendMessage('get-auth-info')`, stores in chrome.storage.local, then opens `mdh.html`

### Popup

- `src/popup/popup.js` — detects current site (Rossum/NetSuite/Coupa) and dims irrelevant sections; manages two toggle types: storage-backed (persist in chrome.storage.local, reload tab on change) and message-backed (devFeatures/devDebug, communicated via chrome.tabs.sendMessage)

## Key Patterns

- All features are gated behind chrome.storage.local toggles controlled via the popup
- The Rossum entry point builds a handlers array from enabled settings — disabled features add zero overhead
- Feature modules that need CSS inject styles dynamically via `init()` — styles only exist in the DOM when the feature is enabled
- NetSuite and Coupa content scripts are self-contained single files (no MutationObserver pattern)

## Release Process

1. Bump version in three places: `manifest.json`, `package.json`, `src/popup/popup.html`
2. `npm run build`
3. ZIP the `dist/` folder
4. Upload via https://chrome.google.com/webstore/devconsole
