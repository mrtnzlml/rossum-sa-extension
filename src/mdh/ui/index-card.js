import { confirmModal } from './modal.js';
import { createJsonEditor } from './json-editor.js';

export function renderIndexCard({ name, badges = [], definition, canDrop, onDrop }) {
  const card = document.createElement('div');
  card.className = 'record-card record-card-expanded';

  // Header (same structure as record cards)
  const header = document.createElement('div');
  header.className = 'record-card-header';

  const chevron = document.createElement('span');
  chevron.className = 'record-chevron';
  chevron.textContent = '\u25BC';

  const summary = document.createElement('span');
  summary.className = 'record-summary';

  const nameSpan = document.createElement('strong');
  nameSpan.textContent = name;
  summary.appendChild(nameSpan);

  for (const { text, cls } of badges) {
    const b = document.createElement('span');
    b.className = 'index-badge' + (cls ? ' ' + cls : '');
    b.style.marginLeft = '6px';
    b.textContent = text;
    summary.appendChild(b);
  }

  const actions = document.createElement('span');
  actions.className = 'record-actions';

  if (definition) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-copy';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(JSON.stringify(definition, null, 2)).then(() => {
        copyBtn.textContent = '\u2713 Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1000);
      });
    });
    actions.appendChild(copyBtn);
  }

  if (canDrop && onDrop) {
    const delBtn = document.createElement('button');
    delBtn.className = 'action-delete';
    delBtn.textContent = 'Del';
    delBtn.addEventListener('click', () => {
      confirmModal(
        `Drop ${name}?`,
        `This will permanently drop "${name}". This cannot be undone.`,
        onDrop,
      );
    });
    actions.appendChild(delBtn);
  }

  header.appendChild(chevron);
  header.appendChild(summary);
  header.appendChild(actions);
  card.appendChild(header);

  // Body (expanded by default)
  let body = null;
  if (definition) {
    body = document.createElement('div');
    body.className = 'record-card-body';
    const editor = createJsonEditor({
      value: JSON.stringify(definition, null, 2),
      minHeight: '0',
      compact: true,
      readOnly: true,
    });
    body.appendChild(editor.el);
    card.appendChild(body);
  }

  // Toggle expand/collapse on header click
  header.style.cursor = 'pointer';
  header.addEventListener('click', (e) => {
    if (e.target.closest('.record-actions')) return;
    if (body) {
      const isHidden = body.classList.toggle('hidden');
      card.classList.toggle('record-card-expanded', !isHidden);
      chevron.textContent = isHidden ? '\u25B6' : '\u25BC';
    }
  });

  return card;
}
