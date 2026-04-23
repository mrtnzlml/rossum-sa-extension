import { h } from 'preact';
import { useState } from 'preact/hooks';

function statusLabel(state, progress) {
  if (state === 'on') return 'On';
  if (state === 'downloading') {
    const pct = Math.round((progress || 0) * 100);
    return pct > 0 ? `Downloading ${pct}%` : 'Downloading\u2026';
  }
  if (state === 'unavailable') return 'Unavailable';
  return 'Off';
}

function buttonLabel(state) {
  if (state === 'on') return 'Disable';
  if (state === 'downloading') return 'Downloading\u2026';
  if (state === 'unavailable') return 'Unavailable';
  return 'Enable';
}

export default function FeatureCard({ feature }) {
  const snapshot = feature.useState();
  const { state, progress, unavailableReason } = snapshot;
  const [confirming, setConfirming] = useState(false);

  async function handleClick() {
    if (state === 'on') {
      await feature.onDisable();
      return;
    }
    if (state === 'off') {
      const needs = await feature.needsConfirmBeforeEnable();
      if (needs) {
        setConfirming(true);
      } else {
        await feature.onEnable();
      }
    }
  }

  async function confirmEnable() {
    setConfirming(false);
    await feature.onEnable();
  }

  const disabled = state === 'downloading' || state === 'unavailable';
  const pct = Math.round((progress || 0) * 100);

  return (
    <div class={`feature-card feature-card-${state}`}>
      <div class="feature-card-header">
        <div class="feature-card-title">
          <span class="feature-card-name">{feature.name}</span>
          {feature.badge && <span class="feature-card-badge">{feature.badge}</span>}
        </div>
        <span class={`feature-card-status feature-card-status-${state}`}>
          {statusLabel(state, progress)}
        </span>
      </div>
      <p class="feature-card-summary">{feature.summary}</p>
      <p class="feature-card-description">{feature.description}</p>
      {feature.requirements && feature.requirements.length > 0 && (
        <ul class="feature-card-requirements">
          {feature.requirements.map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
      {confirming && (
        <div class="feature-card-confirm">
          <p>{feature.confirmMessage || 'Enable this feature?'}</p>
          <div class="feature-card-confirm-actions">
            <button
              class="btn btn-secondary feature-card-confirm-cancel"
              onClick={() => setConfirming(false)}
            >Cancel</button>
            <button
              class="btn btn-primary feature-card-confirm-btn"
              onClick={confirmEnable}
            >Download &amp; enable</button>
          </div>
        </div>
      )}
      <div class="feature-card-footer">
        <button
          class="btn btn-primary feature-card-action"
          disabled={disabled}
          title={state === 'unavailable' ? unavailableReason : null}
          onClick={handleClick}
        >{buttonLabel(state)}</button>
      </div>
      {state === 'downloading' && (
        <div class={'feature-card-progress' + (pct === 0 ? ' indeterminate' : '')}>
          <div
            class="feature-card-progress-fill"
            style={pct > 0 ? { width: pct + '%' } : {}}
          />
        </div>
      )}
    </div>
  );
}
