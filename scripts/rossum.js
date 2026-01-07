// @flow

/*::

declare const chrome: any; // TODO

*/

const styleSchemaID = document.createElement('style');
styleSchemaID.textContent = `
[data-sa-extension-schema-id] {
  position: relative;
}

.rossum-sa-extension-schema-id {
  position: absolute;
  top: 0;
  right: 0;
  color: red;
  font-size: 10px;
  transition: all 0.25s ease-in-out;
  opacity: .7;
  margin-inline: 3px;
}

.rossum-sa-extension-schema-id:hover {
  font-size: 16px;
  opacity: 1;
  background-color: rgba(255, 255, 255, 0.7);
  border-radius: 3px;
  padding-inline: 3px;
}`;
document.head?.appendChild(styleSchemaID);

function displaySchemaID(node /*: $FlowFixMe */) {
  const span = document.createElement('span');
  span.className = 'rossum-sa-extension-schema-id';
  span.innerHTML = node.getAttribute('data-sa-extension-schema-id');
  node.appendChild(span);
}

function isElementNode(node /*: any */) /*: node is Element */ {
  // https://developer.mozilla.org/en-US/docs/Web/API/Node
  // https://developer.mozilla.org/en-US/docs/Web/API/Element
  return node.nodeType === Node.ELEMENT_NODE;
}

const htmlBodyElement = document.querySelector('body');
if (htmlBodyElement == null) {
  throw new Error('No body element found');
}

const observeHtmlBody = (
  options /*: { +schemaAnnotationsEnabled: boolean, +expandFormulasEnabled: boolean, +expandReasoningFieldsEnabled: boolean, +scrollLockEnabled: boolean } */,
) => {
  const observer = new MutationObserver((mutations /*: Array<MutationRecord> */) => {
    const checkAddedNode = (addedNode /*: Node */) => {
      if (!isElementNode(addedNode)) {
        return;
      }

      if (options.schemaAnnotationsEnabled === true) {
        if (addedNode.hasAttribute('data-sa-extension-schema-id')) {
          displaySchemaID(addedNode);
        }
      }

      if (options.expandFormulasEnabled === true) {
        const button = document.querySelector('button[aria-label="Show source code"]');
        if (button != null) {
          button.click();
        }
      }

      if (options.expandReasoningFieldsEnabled === true) {
        const button = Array.from(document.querySelectorAll('button[data-sentry-source-file="ReasoningTiles.tsx"]')).find(button => button.textContent.trim() === 'Show options');
        if (button != null) {
          button.click();
        }
      }

      if (options.scrollLockEnabled === true) {
        const scrollableContainer = document.querySelector('#sidebar-scrollable');
        if (scrollableContainer != null && !scrollableContainer.__saScrollLockAttached) {
          initScrollLock(scrollableContainer);
        }
      }

      for (const child of addedNode.children) {
        checkAddedNode(child);
      }
    };

    for (const mutation of mutations) {
      for (const addedNode of mutation.addedNodes) {
        checkAddedNode(addedNode);
      }
    }
  });

  observer.observe(htmlBodyElement, {
    subtree: true,
    childList: true,
  });
};

function initScrollLock(element /*: Element */) {
  if (!(element instanceof HTMLElement)) return;

  let savedScrollTop = 0;
  let lockUntil = 0;
  let isRestoring = false;
  let currentPathname = window.location.pathname;

  let userScrollUntil = 0;
  let userScrollTimer = null;

  element.__saScrollLockAttached = true;
  console.log('[SA Extension] Scroll lock initialized for #sidebar-scrollable, pathname:', currentPathname);

  requestAnimationFrame(() => {
    if (element instanceof HTMLElement) element.scrollTop = 0;
  });

  const markUserScrollActive = () => {
    const now = Date.now();
    userScrollUntil = now + 250;

    if (userScrollTimer) clearTimeout(userScrollTimer);
    userScrollTimer = setTimeout(() => {
    }, 260);
  };

  element.addEventListener('wheel', markUserScrollActive, { passive: true });
  element.addEventListener('touchstart', markUserScrollActive, { passive: true });
  element.addEventListener('mousedown', markUserScrollActive, { passive: true });
  element.addEventListener('keydown', markUserScrollActive, { passive: true });

  element.addEventListener(
    'scroll',
    () => {
      if (!(element instanceof HTMLElement)) return;

      markUserScrollActive();

      const now = Date.now();
      const cur = element.scrollTop;

      if (!isRestoring && now <= userScrollUntil) {
        savedScrollTop = cur;
        return;
      }

      if (!isRestoring && now < lockUntil && savedScrollTop > 50) {
        if (Math.abs(cur - savedScrollTop) > 5) {
          isRestoring = true;
          element.scrollTop = savedScrollTop;
          setTimeout(() => {
            isRestoring = false;
          }, 0);
        }
      }
    },
    { passive: true },
  );

  const proto = Object.getPrototypeOf(element);
  const desc = Object.getOwnPropertyDescriptor(proto, 'scrollTop');
  if (desc && typeof desc.set === 'function' && typeof desc.get === 'function') {
    Object.defineProperty(element, 'scrollTop', {
      configurable: true,
      enumerable: true,
      get() { return desc.get.call(this); },
      set(v) {
        const now = Date.now();
        const desired = Number(v) || 0;

        if (now > userScrollUntil && now < lockUntil && savedScrollTop > 50) {
          if (Math.abs(desired - savedScrollTop) > 5) {
            return desc.set.call(this, savedScrollTop);
          }
        }
        return desc.set.call(this, v);
      },
    });
  }

  const armLockWindow = (ms) => {
    if (savedScrollTop <= 50) return; 
    lockUntil = Date.now() + ms;
    element.scrollTop = savedScrollTop;
    requestAnimationFrame(() => {
      if (element.scrollTop !== savedScrollTop) element.scrollTop = savedScrollTop;
    });
  };

  const contentObserver = new MutationObserver(() => {
    if (window.location.pathname !== currentPathname) {
      currentPathname = window.location.pathname;
      armLockWindow(800);
      return;
    }
    armLockWindow(400);
  });

  contentObserver.observe(element, { childList: true, subtree: true });
}


function initFocusPatch() {
  if (!HTMLElement.prototype.__saFocusPatched) {
    const originalFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (...args) {
      try {
        return originalFocus.call(this, { preventScroll: true });
      } catch {
        return originalFocus.apply(this, args);
      }
    };
    HTMLElement.prototype.__saFocusPatched = true;
  }
}

chrome.storage.local.get(['schemaAnnotationsEnabled', 'expandFormulasEnabled', 'expandReasoningFieldsEnabled', 'scrollLockEnabled']).then((result) => {
  
  if (result.scrollLockEnabled === true) {
    initFocusPatch();
  }

  observeHtmlBody({
    schemaAnnotationsEnabled: result.schemaAnnotationsEnabled,
    expandFormulasEnabled: result.expandFormulasEnabled,
    expandReasoningFieldsEnabled: result.expandReasoningFieldsEnabled,
    scrollLockEnabled: result.scrollLockEnabled,
  });
});

/**
 * Adds functionality to enable or disable `devFeaturesEnabled`/`devDebugEnabled` flag in the actual local storage.
 *
 * This functionality is invoked from the popup window when toggling the checkboxes.
 */
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  // devFeaturesEnabled:
  if (message === 'get-dev-features-enabled-value') {
    sendResponse(window.localStorage.getItem('devFeaturesEnabled') === 'true');
  }

  if (message === 'toggle-dev-features-enabled') {
    if (window.localStorage.getItem('devFeaturesEnabled') === 'true') {
      window.localStorage.removeItem('devFeaturesEnabled');
    } else {
      window.localStorage.setItem('devFeaturesEnabled', true);
    }
    sendResponse(true);
  }

  // devDebugEnabled:
  if (message === 'get-dev-debug-enabled-value') {
    sendResponse(window.localStorage.getItem('devDebugEnabled') === 'true');
  }

  if (message === 'toggle-dev-debug-enabled') {
    if (window.localStorage.getItem('devDebugEnabled') === 'true') {
      window.localStorage.removeItem('devDebugEnabled');
    } else {
      window.localStorage.setItem('devDebugEnabled', true);
    }
    sendResponse(true);
  }
});
