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
