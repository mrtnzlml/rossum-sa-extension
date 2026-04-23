import { aiEnabled, aiStatus, aiDownloadProgress } from '../store.js';
import * as ai from '../ai.js';

const AI_FEATURE = {
  id: 'ai',
  name: 'AI Features',
  summary: 'Explain records, indexes, and errors using Chrome\u2019s built-in AI model \u2014 runs fully on-device, private by design.',
  description:
    'Adds AI-generated explanations throughout the Dataset Management UI: hover an index, an error, or a record to see a short natural-language summary. All inference happens locally on Chrome\u2019s built-in language model (Gemini Nano). Per Chrome\u2019s official documentation, no prompt, record content, or inference data is sent to Google or any third party while the model is in use. The only network traffic is the one-time ~4 GB model download; everything after that stays on your device, even offline.',
  requirements: [
    'Chrome 128+ with built-in AI (Gemini Nano)',
    '~4 GB model download (one-time)',
    '22 GB free disk space',
    'Unmetered network connection for the initial download',
  ],
  badge: 'Experimental',
  confirmMessage: 'Enabling downloads ~4 GB and runs on-device. Continue?',
  useState: () => {
    const status = aiStatus.value;
    const enabled = aiEnabled.value;
    let state;
    if (status === 'unavailable') state = 'unavailable';
    else if (status === 'downloading') state = 'downloading';
    else if (enabled && status === 'ready') state = 'on';
    else if (enabled) state = 'downloading'; // initializing counts as downloading for UI
    else state = 'off';
    return {
      state,
      progress: aiDownloadProgress.value,
      unavailableReason: status === 'unavailable'
        ? 'Chrome\u2019s built-in AI is not available in this browser.'
        : null,
    };
  },
  needsConfirmBeforeEnable: async () => ai.needsDownload(),
  onEnable: async () => { await ai.enableAI(); },
  onDisable: async () => { await ai.disableAI(); },
};

export const FEATURES = [AI_FEATURE];
