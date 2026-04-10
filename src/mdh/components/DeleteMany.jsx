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
