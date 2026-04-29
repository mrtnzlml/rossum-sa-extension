const LOGS_PATH_RE = /\/logs(?:\/|$|\?)/;

function isLogsPage() {
  return LOGS_PATH_RE.test(window.location.pathname);
}

function syncLogsAttr() {
  if (!document.body) return;
  if (isLogsPage()) {
    document.body.setAttribute('data-sa-logs-page', '');
  } else {
    document.body.removeAttribute('data-sa-logs-page');
  }
}

export function init() {
  const style = document.createElement('style');
  style.textContent = `
body[data-sa-logs-page] .MuiContainer-root,
body[data-sa-logs-page] [class*="MuiContainer-maxWidth"] {
  max-width: none !important;
}

body[data-sa-logs-page] .MuiDataGrid-cell {
  white-space: normal !important;
  line-height: 1.4 !important;
  padding-block: 6px !important;
  align-items: flex-start !important;
}

body[data-sa-logs-page] .MuiDataGrid-row {
  max-height: none !important;
}

body[data-sa-logs-page] .MuiDataGrid-columnSeparator--resizable,
body[data-sa-logs-page] .MuiDataGrid-columnSeparator {
  cursor: col-resize;
  pointer-events: auto;
}
`;
  document.head?.appendChild(style);

  syncLogsAttr();

  const wrap = (key) => {
    const original = history[key];
    history[key] = function (...args) {
      const result = original.apply(this, args);
      syncLogsAttr();
      return result;
    };
  };
  wrap('pushState');
  wrap('replaceState');
  window.addEventListener('popstate', syncLogsAttr);
}
