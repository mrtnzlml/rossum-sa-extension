import { h, Fragment } from 'preact';
import { useEffect, useState, useRef } from 'preact/hooks';
import { collections, selectedCollection, activeView } from '../store.js';
import * as api from '../api.js';
import * as cache from '../cache.js';
import { buildStoragePipeline, buildBatchStoragePipeline } from '../statsPipelines.js';

const BATCH_SIZE = 50;
const BATCH_CONCURRENCY = 3;

function formatBytes(n) {
  if (n == null) return '\u2014';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MiB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

async function runWithConcurrency(items, concurrency, signal, worker) {
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!signal.aborted) {
      const i = idx++;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  });
  await Promise.all(workers);
}

function extractStats(row) {
  const s = row?.storageStats || {};
  return {
    count: s.count,
    size: s.size,
    storageSize: s.storageSize,
    avgObjSize: s.avgObjSize,
    nindexes: s.nindexes,
    totalIndexSize: s.totalIndexSize,
  };
}

export default function OverviewPanel() {
  const cols = collections.value;
  const [data, setData] = useState({});
  const [loadingSet, setLoadingSet] = useState(new Set());
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [reloadKey, setReloadKey] = useState(0);
  const abortRef = useRef(null);

  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setData({});
    setLoadingSet(new Set(cols));

    // Batch setState calls with a microtask so N concurrent arrivals don't
    // trigger N renders in flight when the collection list is large.
    const pending = {};
    let flushScheduled = false;
    function scheduleFlush() {
      if (flushScheduled) return;
      flushScheduled = true;
      queueMicrotask(() => {
        flushScheduled = false;
        if (controller.signal.aborted) return;
        const batch = pending.batch;
        const done = pending.done;
        pending.batch = null;
        pending.done = null;
        if (batch) setData((d) => ({ ...d, ...batch }));
        if (done) {
          setLoadingSet((prev) => {
            const next = new Set(prev);
            for (const n of done) next.delete(n);
            return next;
          });
        }
      });
    }

    function publish(name, value) {
      (pending.batch ||= {})[name] = value;
      (pending.done ||= []).push(name);
      scheduleFlush();
    }

    function cacheAndRecord(name, res) {
      cache.set(name, 'stats_storage', res);
      const s = res.result?.[0]?.storageStats;
      if (typeof s?.count === 'number' && cache.get(name, 'totalCount') === null) {
        cache.set(name, 'totalCount', s.count);
      }
      publish(name, extractStats(res.result?.[0]));
    }

    // Per-collection fallback — used when a batched call fails.
    async function fetchOne(name) {
      try {
        const res = await api.aggregate(name, buildStoragePipeline(), { signal: controller.signal });
        if (controller.signal.aborted) return;
        cacheAndRecord(name, res);
      } catch (err) {
        if (err.name === 'AbortError') return;
        publish(name, { error: err.message });
      }
    }

    async function fetchBatch(names) {
      if (names.length === 0) return;
      if (names.length === 1) { await fetchOne(names[0]); return; }
      try {
        const res = await api.aggregate(names[0], buildBatchStoragePipeline(names), { signal: controller.signal });
        if (controller.signal.aborted) return;
        const byName = new Map();
        for (const row of res.result || []) {
          if (row?._coll) byName.set(row._coll, row);
        }
        for (const name of names) {
          const row = byName.get(name);
          if (!row) {
            publish(name, { error: 'Missing from batch response' });
            continue;
          }
          // Store as the same shape the StatsPanel expects:
          // { result: [{ storageStats, _coll }] }
          cacheAndRecord(name, { result: [row] });
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        // Fall back to per-collection calls for just this batch.
        await runWithConcurrency(names, BATCH_CONCURRENCY, controller.signal, fetchOne);
      }
    }

    (async () => {
      // 1. Cache-first pass — populate anything we already have, zero API calls.
      const toFetch = [];
      for (const name of cols) {
        const cached = cache.get(name, 'stats_storage');
        if (cached) {
          const s = cached.result?.[0]?.storageStats;
          if (typeof s?.count === 'number' && cache.get(name, 'totalCount') === null) {
            cache.set(name, 'totalCount', s.count);
          }
          publish(name, extractStats(cached.result?.[0]));
        } else {
          toFetch.push(name);
        }
      }

      // 2. Batched fetch for the rest.
      const batches = [];
      for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
        batches.push(toFetch.slice(i, i + BATCH_SIZE));
      }
      await runWithConcurrency(batches, BATCH_CONCURRENCY, controller.signal, fetchBatch);
    })();

    return () => controller.abort();
  }, [cols, reloadKey]);

  function onSort(key) {
    if (sortKey === key) setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function sortIndicator(key) {
    if (sortKey !== key) return null;
    return <span class="stats-sort-arrow">{sortDir === 'desc' ? '\u25be' : '\u25b4'}</span>;
  }

  const rows = cols.map((name) => ({ name, ...(data[name] || {}) }));
  rows.sort((a, b) => {
    if (sortKey === 'name') {
      const cmp = a.name.localeCompare(b.name);
      return sortDir === 'desc' ? -cmp : cmp;
    }
    const av = a[sortKey];
    const bv = b[sortKey];
    const an = av == null ? -1 : av;
    const bn = bv == null ? -1 : bv;
    if (an === bn) return a.name.localeCompare(b.name);
    return sortDir === 'desc' ? bn - an : an - bn;
  });

  const totals = rows.reduce((acc, r) => {
    acc.count += r.count || 0;
    acc.storageSize += r.storageSize || 0;
    acc.size += r.size || 0;
    acc.totalIndexSize += r.totalIndexSize || 0;
    acc.nindexes += r.nindexes || 0;
    return acc;
  }, { count: 0, storageSize: 0, size: 0, totalIndexSize: 0, nindexes: 0 });

  // Size-bar normalization. Bars are proportional to the largest value in
  // each column so the dominant collection fills the bar and smaller ones
  // scale visibly against it (share-of-total would hide variance when one
  // collection dwarfs the others).
  const maxStorageSize = rows.reduce((m, r) => Math.max(m, r.storageSize || 0), 0);
  const maxCount = rows.reduce((m, r) => Math.max(m, r.count || 0), 0);
  const maxIndexSize = rows.reduce((m, r) => Math.max(m, r.totalIndexSize || 0), 0);
  function barPct(value, max) {
    if (!value || !max) return 0;
    return Math.max((value / max) * 100, 1);
  }

  const loadingCount = loadingSet.size;
  const totalCount = cols.length;
  const doneCount = totalCount - loadingCount;

  function openCollection(name) {
    selectedCollection.value = name;
    activeView.value = 'collection';
  }

  function refresh() {
    for (const name of cols) cache.invalidate(name, 'stats_storage');
    setReloadKey((k) => k + 1);
  }

  return (
    <div class="panel stats-panel">
      <div class="toolbar">
        <span style="flex:1;font-weight:500">All Collections</span>
        {loadingCount > 0 && (
          <span class="stats-progress">
            <span class="stats-progress-spinner" />
            {doneCount} / {totalCount}
          </span>
        )}
        <button class="icon-btn" title="Refresh" onClick={refresh}>{'\u21bb'}</button>
      </div>

      {loadingCount > 0 && totalCount > 0 && (
        <div class="stats-progress-track">
          <div class="stats-progress-fill" style={{ width: `${Math.round((doneCount / totalCount) * 100)}%` }} />
        </div>
      )}

      <div class="stats-scroll">
        {totalCount === 0 ? (
          <div class="stats-empty">No collections</div>
        ) : (
          <table class="stats-table stats-overview-table">
            <colgroup>
              <col />
              <col style="width:120px" />
              <col style="width:100px" />
              <col style="width:100px" />
              <col style="width:90px" />
              <col style="width:80px" />
              <col style="width:100px" />
            </colgroup>
            <thead>
              <tr>
                <th class="stats-sortable" onClick={() => onSort('name')}>Collection{sortIndicator('name')}</th>
                <th class="stats-sortable stats-num" onClick={() => onSort('count')}>Documents{sortIndicator('count')}</th>
                <th class="stats-sortable stats-num" onClick={() => onSort('storageSize')}>On disk{sortIndicator('storageSize')}</th>
                <th class="stats-sortable stats-num" onClick={() => onSort('size')}>Logical{sortIndicator('size')}</th>
                <th class="stats-sortable stats-num" onClick={() => onSort('avgObjSize')}>Avg doc{sortIndicator('avgObjSize')}</th>
                <th class="stats-sortable stats-num" onClick={() => onSort('nindexes')}>Indexes{sortIndicator('nindexes')}</th>
                <th class="stats-sortable stats-num" onClick={() => onSort('totalIndexSize')}>Index size{sortIndicator('totalIndexSize')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isLoading = loadingSet.has(r.name);
                const err = r.error;
                return (
                  <tr
                    class="stats-clickable"
                    onClick={() => openCollection(r.name)}
                    title={`Open "${r.name}"`}
                  >
                    <td>{r.name}</td>
                    {err ? (
                      <td colspan="6" class="stats-row-error">{err}</td>
                    ) : isLoading ? (
                      <Fragment>
                        <td class="stats-num"><span class="stats-skeleton" style="width:90px" /></td>
                        <td class="stats-num"><span class="stats-skeleton" style="width:72px" /></td>
                        <td class="stats-num"><span class="stats-skeleton" style="width:72px" /></td>
                        <td class="stats-num"><span class="stats-skeleton" style="width:60px" /></td>
                        <td class="stats-num"><span class="stats-skeleton" style="width:32px" /></td>
                        <td class="stats-num"><span class="stats-skeleton" style="width:70px" /></td>
                      </Fragment>
                    ) : (
                      <Fragment>
                        <td class="stats-mono stats-num stats-coverage-cell">
                          <div class="stats-coverage-bar" style={{ width: `${barPct(r.count, maxCount)}%` }} />
                          <span class="stats-coverage-text">{r.count != null ? r.count.toLocaleString() : '\u2014'}</span>
                        </td>
                        <td class="stats-mono stats-num stats-coverage-cell">
                          <div class="stats-coverage-bar" style={{ width: `${barPct(r.storageSize, maxStorageSize)}%` }} />
                          <span class="stats-coverage-text">{formatBytes(r.storageSize)}</span>
                        </td>
                        <td class="stats-mono stats-num">{formatBytes(r.size)}</td>
                        <td class="stats-mono stats-num">{formatBytes(r.avgObjSize)}</td>
                        <td class="stats-mono stats-num">{r.nindexes ?? '\u2014'}</td>
                        <td class="stats-mono stats-num stats-coverage-cell">
                          <div class="stats-coverage-bar" style={{ width: `${barPct(r.totalIndexSize, maxIndexSize)}%` }} />
                          <span class="stats-coverage-text">{formatBytes(r.totalIndexSize)}</span>
                        </td>
                      </Fragment>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {doneCount > 0 && (
              <tfoot>
                <tr class="stats-totals-row">
                  <td><strong>Total ({totalCount})</strong></td>
                  <td class="stats-mono stats-num"><strong>{totals.count.toLocaleString()}</strong></td>
                  <td class="stats-mono stats-num"><strong>{formatBytes(totals.storageSize)}</strong></td>
                  <td class="stats-mono stats-num"><strong>{formatBytes(totals.size)}</strong></td>
                  <td class="stats-mono stats-num">{'\u2014'}</td>
                  <td class="stats-mono stats-num"><strong>{totals.nindexes.toLocaleString()}</strong></td>
                  <td class="stats-mono stats-num"><strong>{formatBytes(totals.totalIndexSize)}</strong></td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
