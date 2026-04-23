// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal chrome mock — store.js and ai.js both touch chrome.storage during import side-effects.
const storageData = {};
globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn(() => Promise.resolve({ ...storageData })),
      set: vi.fn((obj) => { Object.assign(storageData, obj); return Promise.resolve(); }),
      remove: vi.fn(() => Promise.resolve()),
    },
  },
};

globalThis.LanguageModel = {
  availability: vi.fn().mockResolvedValue('readily'),
  create: vi.fn(),
};

import { FEATURES } from '../src/mdh/featurePreview/registry.js';

describe('feature preview registry', () => {
  it('exports a non-empty FEATURES array', () => {
    expect(Array.isArray(FEATURES)).toBe(true);
    expect(FEATURES.length).toBeGreaterThanOrEqual(1);
  });

  it('every entry has required fields', () => {
    for (const f of FEATURES) {
      expect(typeof f.id).toBe('string');
      expect(typeof f.name).toBe('string');
      expect(typeof f.summary).toBe('string');
      expect(typeof f.description).toBe('string');
      expect(Array.isArray(f.requirements)).toBe(true);
      expect(typeof f.useState).toBe('function');
      expect(typeof f.onEnable).toBe('function');
      expect(typeof f.onDisable).toBe('function');
    }
  });

  it('includes an "ai" feature as the first entry', () => {
    expect(FEATURES[0].id).toBe('ai');
    expect(FEATURES[0].name).toBe('AI Features');
  });
});

import { h, render } from 'preact';
import * as store from '../src/mdh/store.js';
import FeatureCard from '../src/mdh/components/FeatureCard.jsx';

function mountCard(feature) {
  const root = document.createElement('div');
  render(h(FeatureCard, { feature }), root);
  return root;
}

function makeFeature(stateSnapshot, overrides = {}) {
  return {
    id: 'test',
    name: 'Test feature',
    summary: 'Summary text',
    description: 'Description paragraph',
    requirements: ['Req A', 'Req B'],
    badge: 'Experimental',
    confirmMessage: 'Test confirm ~4 GB message',
    useState: () => stateSnapshot,
    needsConfirmBeforeEnable: async () => false,
    onEnable: overrides.onEnable || (() => {}),
    onDisable: overrides.onDisable || (() => {}),
  };
}

describe('FeatureCard', () => {
  it('renders name, summary, description, and requirements', () => {
    const root = mountCard(makeFeature({ state: 'off', progress: 0, unavailableReason: null }));
    expect(root.textContent).toContain('Test feature');
    expect(root.textContent).toContain('Summary text');
    expect(root.textContent).toContain('Description paragraph');
    expect(root.textContent).toContain('Req A');
    expect(root.textContent).toContain('Req B');
    expect(root.textContent).toContain('Experimental');
  });

  it('shows "Off" status pill and "Enable" button when state is off', () => {
    const root = mountCard(makeFeature({ state: 'off', progress: 0, unavailableReason: null }));
    const pill = root.querySelector('.feature-card-status');
    expect(pill.textContent.trim()).toBe('Off');
    const btn = root.querySelector('.feature-card-action');
    expect(btn.textContent.trim()).toBe('Enable');
    expect(btn.disabled).toBe(false);
  });

  it('shows "On" status pill and "Disable" button when state is on', () => {
    const root = mountCard(makeFeature({ state: 'on', progress: 1, unavailableReason: null }));
    expect(root.querySelector('.feature-card-status').textContent.trim()).toBe('On');
    expect(root.querySelector('.feature-card-action').textContent.trim()).toBe('Disable');
  });

  it('shows "Downloading NN%" pill and disabled button while downloading', () => {
    const root = mountCard(makeFeature({ state: 'downloading', progress: 0.37, unavailableReason: null }));
    expect(root.querySelector('.feature-card-status').textContent.trim()).toBe('Downloading 37%');
    expect(root.querySelector('.feature-card-action').disabled).toBe(true);
    const fill = root.querySelector('.feature-card-progress-fill');
    expect(fill.getAttribute('style')).toContain('width: 37%');
  });

  it('shows "Unavailable" pill and disabled button with reason title when unavailable', () => {
    const root = mountCard(makeFeature({
      state: 'unavailable',
      progress: 0,
      unavailableReason: 'Not supported here.',
    }));
    expect(root.querySelector('.feature-card-status').textContent.trim()).toBe('Unavailable');
    const btn = root.querySelector('.feature-card-action');
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('title')).toBe('Not supported here.');
  });

  it('clicks Enable directly when no confirmation is required', async () => {
    const onEnable = vi.fn();
    const feature = makeFeature(
      { state: 'off', progress: 0, unavailableReason: null },
      { onEnable },
    );
    feature.needsConfirmBeforeEnable = async () => false;
    const root = mountCard(feature);
    root.querySelector('.feature-card-action').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onEnable).toHaveBeenCalled();
  });

  it('shows inline confirm panel when enable requires confirmation', async () => {
    const onEnable = vi.fn();
    const feature = makeFeature(
      { state: 'off', progress: 0, unavailableReason: null },
      { onEnable },
    );
    feature.needsConfirmBeforeEnable = async () => true;
    const root = mountCard(feature);
    root.querySelector('.feature-card-action').click();
    await new Promise((r) => setTimeout(r, 0));

    const confirm = root.querySelector('.feature-card-confirm');
    expect(confirm).not.toBeNull();
    expect(confirm.textContent).toContain('~4 GB');
    expect(onEnable).not.toHaveBeenCalled();

    const confirmBtn = confirm.querySelector('.feature-card-confirm-btn');
    confirmBtn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onEnable).toHaveBeenCalled();
  });

  it('dismisses confirm panel on Cancel without calling onEnable', async () => {
    const onEnable = vi.fn();
    const feature = makeFeature(
      { state: 'off', progress: 0, unavailableReason: null },
      { onEnable },
    );
    feature.needsConfirmBeforeEnable = async () => true;
    const root = mountCard(feature);
    root.querySelector('.feature-card-action').click();
    await new Promise((r) => setTimeout(r, 0));

    root.querySelector('.feature-card-confirm-cancel').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onEnable).not.toHaveBeenCalled();
    expect(root.querySelector('.feature-card-confirm')).toBeNull();
  });

  it('calls onDisable when Disable is clicked', async () => {
    const onDisable = vi.fn();
    const feature = makeFeature(
      { state: 'on', progress: 1, unavailableReason: null },
      { onDisable },
    );
    mountCard(feature).querySelector('.feature-card-action').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(onDisable).toHaveBeenCalled();
  });
});

import FeaturePreviewModal from '../src/mdh/components/FeaturePreviewModal.jsx';

describe('FeaturePreviewModal', () => {
  it('renders one card per feature in the registry', () => {
    const root = document.createElement('div');
    render(h(FeaturePreviewModal, null), root);
    const cards = root.querySelectorAll('.feature-card');
    // Registry currently has one feature (AI); update this assertion when more are added.
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain('AI Features');
  });
});

import Sidebar from '../src/mdh/components/Sidebar.jsx';

describe('Sidebar Feature preview entry', () => {
  beforeEach(() => {
    store.collections.value = [];
    store.selectedCollection.value = null;
    store.activeView.value = 'collection';
    store.modalContent.value = null;
    store.aiEnabled.value = false;
    store.aiStatus.value = 'idle';
    store.aiDownloadProgress.value = 0;
  });

  it('no longer renders the old sidebar-ai-section', () => {
    const root = document.createElement('div');
    render(h(Sidebar, null), root);
    expect(root.querySelector('.sidebar-ai-section')).toBeNull();
    expect(root.querySelector('.sidebar-ai-toggle')).toBeNull();
  });

  it('renders a Feature preview nav entry in the footer', () => {
    const root = document.createElement('div');
    render(h(Sidebar, null), root);
    const entry = root.querySelector('[data-testid="feature-preview-entry"]');
    expect(entry).not.toBeNull();
    expect(entry.textContent).toContain('Feature preview');
  });

  it('opens the Feature preview modal when the entry is clicked', () => {
    const root = document.createElement('div');
    render(h(Sidebar, null), root);
    const entry = root.querySelector('[data-testid="feature-preview-entry"]');
    entry.click();
    expect(store.modalContent.value).not.toBeNull();
    expect(store.modalContent.value.title).toBe('Feature preview');
  });

  it('shows a count badge when at least one feature is enabled', () => {
    store.aiEnabled.value = true;
    store.aiStatus.value = 'ready';
    const root = document.createElement('div');
    render(h(Sidebar, null), root);
    const badge = root.querySelector('.feature-preview-count');
    expect(badge).not.toBeNull();
    expect(badge.textContent.trim()).toBe('1');
  });

  it('hides the count badge when no features are enabled', () => {
    const root = document.createElement('div');
    render(h(Sidebar, null), root);
    expect(root.querySelector('.feature-preview-count')).toBeNull();
  });
});
