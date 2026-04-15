// Per-collection in-memory store for the Data panel's editable state.
// Persisted across tab switches (and within-session collection switches)
// so a user's custom pipeline / variables / pagination position survives
// when they jump to Stats or Indexes and come back.
//
// In-memory only — does NOT persist across page reloads. If session
// persistence is needed, swap the Map for chrome.storage.local.

const stateByCollection = new Map();

export function savePipelineState(collection, state) {
  if (!collection) return;
  stateByCollection.set(collection, state);
}

export function getPipelineState(collection) {
  if (!collection) return null;
  return stateByCollection.get(collection) || null;
}

export function clearPipelineState(collection) {
  stateByCollection.delete(collection);
}

export function clearAllPipelineState() {
  stateByCollection.clear();
}
