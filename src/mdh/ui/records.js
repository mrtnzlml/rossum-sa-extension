import * as api from '../api.js';
import * as state from '../state.js';
import { confirmModal } from './modal.js';
import { openRecordEditor } from './record-editor.js';
import { openUpdateMany } from './update-many.js';
import { openDeleteMany } from './delete-many.js';

const panelEl = () => document.getElementById('panel-records');

export function initRecords() {
  renderToolbar();
  state.on('selectedCollectionChanged', onCollectionChange);
  state.on('recordsChanged', renderRecords);
}

function onCollectionChange(collection) {
  if (collection) {
    state.set({ filter: '{}', sort: '{}', projection: '', skip: 0 });
    doFind();
  }
}

function renderToolbar() {
  const el = panelEl();
  el.innerHTML = `
    <div class="toolbar">
      <span class="toolbar-label">Filter:</span>
      <input id="recordFilter" class="input" style="flex:1" value="{}" />
      <button id="recordFindBtn" class="btn btn-primary btn-sm">Find</button>
      <button id="recordInsertBtn" class="btn btn-success btn-sm">+ Insert</button>
      <button id="recordUpdateManyBtn" class="btn btn-sm">Update Many</button>
      <button id="recordDeleteManyBtn" class="btn btn-danger btn-sm">Delete Many</button>
    </div>
    <div class="toolbar">
      <span class="toolbar-label">Sort:</span>
      <input id="recordSort" class="input" style="flex:1" value="{}" />
      <span class="toolbar-label" style="width:70px">Projection:</span>
      <input id="recordProjection" class="input" style="flex:1" placeholder="(all fields)" />
    </div>
    <div id="recordList" class="record-list"></div>
    <div id="recordPagination" class="pagination">
      <span id="recordCount"></span>
      <div class="pagination-controls">
        <button id="recordPrev" disabled>&larr; Prev</button>
        <span id="recordPage">Page 1</span>
        <button id="recordNext">Next &rarr;</button>
      </div>
    </div>
  `;

  el.querySelector('#recordFindBtn').addEventListener('click', () => {
    state.set({ skip: 0 });
    doFind();
  });

  el.querySelector('#recordFilter').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      state.set({ skip: 0 });
      doFind();
    }
  });

  el.querySelector('#recordInsertBtn').addEventListener('click', () => {
    openRecordEditor('insert', null, () => doFind());
  });

  el.querySelector('#recordUpdateManyBtn').addEventListener('click', () => {
    openUpdateMany(() => doFind());
  });

  el.querySelector('#recordDeleteManyBtn').addEventListener('click', () => {
    openDeleteMany(() => doFind());
  });

  el.querySelector('#recordPrev').addEventListener('click', () => {
    const skip = Math.max(0, state.get('skip') - state.get('limit'));
    state.set({ skip });
    doFind();
  });

  el.querySelector('#recordNext').addEventListener('click', () => {
    state.set({ skip: state.get('skip') + state.get('limit') });
    doFind();
  });
}

async function doFind() {
  const collection = state.get('selectedCollection');
  if (!collection) return;

  const filterInput = document.getElementById('recordFilter');
  const sortInput = document.getElementById('recordSort');
  const projInput = document.getElementById('recordProjection');

  let query, sort, projection;
  try {
    query = JSON.parse(filterInput.value || '{}');
    filterInput.classList.remove('input-error');
  } catch {
    filterInput.classList.add('input-error');
    return;
  }
  try {
    sort = JSON.parse(sortInput.value || '{}');
    sortInput.classList.remove('input-error');
  } catch {
    sortInput.classList.add('input-error');
    return;
  }
  try {
    projection = projInput.value.trim() ? JSON.parse(projInput.value) : null;
    projInput.classList.remove('input-error');
  } catch {
    projInput.classList.add('input-error');
    return;
  }

  const skip = state.get('skip');
  const limit = state.get('limit');

  try {
    state.set({ loading: true, error: null });
    const res = await api.find(collection, { query, projection, skip, limit, sort });
    state.set({ records: res.result || [], loading: false });
  } catch (err) {
    state.set({ error: { message: err.message }, loading: false });
  }
}

function renderRecords(records) {
  const listEl = document.getElementById('recordList');
  if (!listEl) return;
  listEl.innerHTML = '';

  for (const record of records) {
    const idStr = record._id?.$oid || record._id || '?';
    const preview = JSON.stringify(record);

    const row = document.createElement('div');
    row.className = 'record-row';
    row.innerHTML = `
      <span class="record-id" title="${idStr}">${idStr}</span>
      <span class="record-preview">${escapeHtml(preview)}</span>
      <span class="record-actions">
        <button class="action-expand">Expand</button>
        <button class="action-edit">Edit</button>
        <button class="action-replace">Replace</button>
        <button class="action-delete">Del</button>
      </span>
    `;

    row.querySelector('.action-expand').addEventListener('click', () => toggleExpand(row, record));
    row.querySelector('.action-edit').addEventListener('click', () => {
      openRecordEditor('edit', record, () => doFind());
    });
    row.querySelector('.action-replace').addEventListener('click', () => {
      openRecordEditor('replace', record, () => doFind());
    });
    row.querySelector('.action-delete').addEventListener('click', () => {
      confirmModal(
        'Delete record?',
        `Delete record with _id "${idStr}"? This cannot be undone.`,
        async () => {
          try {
            state.set({ loading: true, error: null });
            await api.deleteOne(state.get('selectedCollection'), { _id: record._id });
            await doFind();
          } catch (err) {
            state.set({ error: { message: err.message }, loading: false });
          }
        },
      );
    });

    listEl.appendChild(row);
  }

  const skip = state.get('skip');
  const limit = state.get('limit');
  const count = records.length;
  document.getElementById('recordCount').textContent = count > 0
    ? `Showing ${skip + 1}\u2013${skip + count}`
    : 'No records';
  document.getElementById('recordPage').textContent = `Page ${Math.floor(skip / limit) + 1}`;
  document.getElementById('recordPrev').disabled = skip === 0;
  document.getElementById('recordNext').disabled = count < limit;
}

function toggleExpand(row, record) {
  const existing = row.nextElementSibling;
  if (existing?.classList.contains('record-expanded')) {
    existing.remove();
    return;
  }
  const expanded = document.createElement('div');
  expanded.className = 'record-expanded';
  const idStr = record._id?.$oid || record._id || '?';
  expanded.innerHTML = `<div class="record-expanded-header">_id: ${escapeHtml(idStr)}</div><pre>${escapeHtml(JSON.stringify(record, null, 2))}</pre>`;
  row.after(expanded);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
