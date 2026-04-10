import * as api from '../api.js';
import * as state from '../state.js';

const TEMPLATE = `[
  {"insertOne": {"document": {"key": "value"}}},
  {"updateOne": {"filter": {"_id": "..."}, "update": {"$set": {"key": "value"}}}},
  {"deleteOne": {"filter": {"_id": "..."}}}
]`;

export function initBulkWrite() {
  const panelEl = document.getElementById('panel-bulk-write');

  panelEl.innerHTML = `
    <div style="flex:1;display:flex;flex-direction:column;padding:12px 16px;overflow:hidden">
      <div class="split-pane-label">Operations (JSON array):</div>
      <textarea id="bulkOps" class="input textarea-fill">${escapeHtml(TEMPLATE)}</textarea>
      <div id="bulkHint" class="input-hint"></div>
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
        <button id="bulkRunBtn" class="btn btn-primary">Run Bulk Write</button>
      </div>
      <div id="bulkStatus" class="hidden" style="margin-top:12px"></div>
    </div>
  `;

  panelEl.querySelector('#bulkRunBtn').addEventListener('click', runBulkWrite);
}

async function runBulkWrite() {
  const opsInput = document.getElementById('bulkOps');
  const hint = document.getElementById('bulkHint');
  const statusEl = document.getElementById('bulkStatus');

  let operations;
  try {
    operations = JSON.parse(opsInput.value);
    if (!Array.isArray(operations)) throw new Error('Operations must be a JSON array');
    opsInput.classList.remove('input-error');
    hint.textContent = '';
  } catch (e) {
    opsInput.classList.add('input-error');
    hint.textContent = e.message;
    return;
  }

  const collection = state.get('selectedCollection');
  try {
    state.set({ loading: true, error: null });
    const res = await api.bulkWrite(collection, operations);
    state.set({ loading: false });

    const operationId = extractOperationId(res.message);
    if (operationId) {
      showOperationStatus(statusEl, operationId);
    } else {
      statusEl.innerHTML = '<div class="op-status"><span class="op-status-badge finished">accepted</span> Operation submitted</div>';
      statusEl.classList.remove('hidden');
    }
  } catch (err) {
    state.set({ loading: false });
    hint.textContent = err.message;
  }
}

function extractOperationId(message) {
  if (!message) return null;
  const match = message.match(/[a-f0-9]{24}/i);
  return match ? match[0] : null;
}

async function showOperationStatus(statusEl, operationId) {
  statusEl.classList.remove('hidden');

  function render(status, errorMessage) {
    const badgeClass = status === 'FINISHED' ? 'finished' : status === 'FAILED' ? 'failed' : 'running';
    statusEl.innerHTML = `
      <div class="op-status">
        <span class="op-status-badge ${badgeClass}">${status.toLowerCase()}</span>
        <span>Operation: ${operationId}</span>
        ${status !== 'FINISHED' && status !== 'FAILED' ? '<button id="checkStatusBtn" class="btn btn-sm" style="margin-left:auto">Check Status</button>' : ''}
        ${errorMessage ? `<span style="color:var(--danger);margin-left:8px">${escapeHtml(errorMessage)}</span>` : ''}
      </div>
    `;
    const checkBtn = statusEl.querySelector('#checkStatusBtn');
    if (checkBtn) {
      checkBtn.addEventListener('click', () => pollStatus(statusEl, operationId));
    }
  }

  render('RUNNING', null);
}

async function pollStatus(statusEl, operationId) {
  try {
    const res = await api.checkOperationStatus(operationId);
    const op = res.result || {};
    const status = op.status || 'UNKNOWN';
    const badgeClass = status === 'FINISHED' ? 'finished' : status === 'FAILED' ? 'failed' : 'running';
    statusEl.innerHTML = `
      <div class="op-status">
        <span class="op-status-badge ${badgeClass}">${status.toLowerCase()}</span>
        <span>Operation: ${operationId}</span>
        ${status !== 'FINISHED' && status !== 'FAILED' ? '<button id="checkStatusBtn" class="btn btn-sm" style="margin-left:auto">Check Status</button>' : ''}
        ${op.error_message ? `<span style="color:var(--danger);margin-left:8px">${escapeHtml(op.error_message)}</span>` : ''}
      </div>
    `;
    const checkBtn = statusEl.querySelector('#checkStatusBtn');
    if (checkBtn) {
      checkBtn.addEventListener('click', () => pollStatus(statusEl, operationId));
    }
  } catch (err) {
    state.set({ error: { message: err.message } });
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
