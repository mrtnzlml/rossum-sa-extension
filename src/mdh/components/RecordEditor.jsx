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
