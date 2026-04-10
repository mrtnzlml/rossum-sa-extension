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
