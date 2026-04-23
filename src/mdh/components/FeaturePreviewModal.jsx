import { h } from 'preact';
import { FEATURES } from '../featurePreview/registry.js';
import FeatureCard from './FeatureCard.jsx';

export default function FeaturePreviewModal() {
  if (FEATURES.length === 0) {
    return (
      <div class="modal-body feature-preview-modal">
        <p class="feature-preview-empty">No preview features available right now.</p>
      </div>
    );
  }
  return (
    <div class="modal-body feature-preview-modal">
      <p class="feature-preview-intro">
        Try early-access capabilities before they ship to everyone. Features here may change or be removed without notice.
      </p>
      <div class="feature-preview-list">
        {FEATURES.map((f) => <FeatureCard key={f.id} feature={f} />)}
      </div>
    </div>
  );
}
