let overlayEl = null;
let onCloseCallback = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay';
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) closeModal();
  });
  document.body.appendChild(overlayEl);
  return overlayEl;
}

export function openModal(title, contentEl, onClose) {
  const overlay = ensureOverlay();
  onCloseCallback = onClose || null;

  overlay.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'modal-card';

  const header = document.createElement('div');
  header.className = 'modal-header';
  const titleEl = document.createElement('span');
  titleEl.className = 'modal-title';
  titleEl.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', closeModal);
  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  card.appendChild(header);
  card.appendChild(contentEl);
  overlay.appendChild(card);
  overlay.classList.add('visible');

  document.addEventListener('keydown', handleEscape);
}

export function closeModal() {
  if (overlayEl) {
    overlayEl.classList.remove('visible');
    overlayEl.innerHTML = '';
  }
  document.removeEventListener('keydown', handleEscape);
  if (onCloseCallback) {
    onCloseCallback();
    onCloseCallback = null;
  }
}

function handleEscape(e) {
  if (e.key === 'Escape') closeModal();
}

export function confirmModal(title, message, onConfirm) {
  const content = document.createElement('div');
  content.className = 'modal-body';

  const msg = document.createElement('p');
  msg.className = 'modal-message';
  msg.textContent = message;
  content.appendChild(msg);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', closeModal);

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'btn btn-danger';
  confirmBtn.textContent = 'Confirm';
  confirmBtn.addEventListener('click', () => {
    closeModal();
    onConfirm();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  content.appendChild(actions);

  openModal(title, content);
}
