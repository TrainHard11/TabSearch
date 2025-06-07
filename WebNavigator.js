/**
 * content.js
 * This script runs on Google search results pages to:
 * 1. Identify all organic search result links.
 * 2. Inject a small orange arrow icon next to the currently selected link.
 * 3. Allow navigation between links using Up/Down arrow keys.
 * 4. Open the selected link in the current tab when 'Enter' or 'Space' is pressed.
 * 5. Open the selected link in a new tab when 'Ctrl+Enter' or 'Ctrl+Space' is pressed.
 * 6. Ensure only one arrow is present and selection is maintained across DOM changes.
 * 7. Implements refined scrolling behavior:
 * - For the FIRST link: Scrolls to the very top of the page to show all content above it.
 * - For all OTHER links (including the last one):
 * - If the link is already fully visible and has sufficient margin from the viewport edges, NO SCROLL.
 * - If the link is not fully visible OR too close to an edge:
 * - Scroll it so its bottom is 70% up from the viewport bottom (when scrolling down).
 * - Scroll it so its top is 70% from the viewport top (when scrolling up).
 * This functionality is controlled by a user setting.
 */

let allResultLinks = [];
let currentSelectedIndex = -1;
let isExtensionInitialized = false; // Tracks if the content script's listeners are active
let mutationObserverInstance = null;

const SCROLL_MARGIN_PX = 100;
const SCROLL_FROM_BOTTOM_PERCENT = 0.25;
const SCROLL_FROM_TOP_PERCENT = 0.25;

// Variable to hold the current web navigator enabled state
let webNavigatorEnabledState = true; // Default to enabled

/**
 * Retrieves the webNavigatorEnabled setting from storage.
 * @returns {Promise<boolean>} Resolves with the boolean value of the setting.
 */
async function getWebNavigatorSetting() {
  const result = await chrome.storage.local.get({ webNavigatorEnabled: true });
  return result.webNavigatorEnabled;
}

/**
 * Finds all eligible search result links based on the current hostname.
 */
function findAllResultLinks() {
  const hostname = window.location.hostname;
  let searchResultsContainer = null;
  let linkSelectors = [];
  let excludeSelectors = [];

  if (hostname.includes('google.com')) {
    searchResultsContainer = document.getElementById('search');
    linkSelectors = [
      'div.g h3 a',
      'div.tF2Cxc h3 a',
      'div.yuRUbf a[href^="http"]',
      'div.g a[href^="http"]'
    ];
    excludeSelectors = [
      '[role="button"]',
      '.commercial-unit',
      '#pnnext',
      '.fl',
      'a[ping]'
    ];
  } else {
    return [];
  }

  if (!searchResultsContainer) {
    return [];
  }

  const links = [];

  for (const selector of linkSelectors) {
    const elements = searchResultsContainer.querySelectorAll(selector);
    for (const el of elements) {
      let isValid = el.tagName === 'A' && el.href && el.href.startsWith('http') && el.offsetParent !== null && el.textContent.trim().length > 0;

      if (isValid) {
        for (const excludeSelector of excludeSelectors) {
          if (el.matches(excludeSelector) || el.closest(excludeSelector)) {
            isValid = false;
            break;
          }
        }
      }

      if (isValid && !links.includes(el)) {
        links.push(el);
      }
    }
  }

  return links;
}

function removeExistingArrows() {
  const existingArrows = document.querySelectorAll('.extension-arrow');
  existingArrows.forEach(arrow => {
    if (arrow.parentNode) {
      arrow.parentNode.removeChild(arrow);
    }
  });
}

function injectArrow(linkElement) {
  if (linkElement.querySelector('.extension-arrow')) {
    return;
  }

  const arrow = document.createElement('span');
  arrow.classList.add('extension-arrow');
  arrow.textContent = '➤';

  linkElement.prepend(arrow);
}

function isElementFullyVisibleWithMargin(element, marginPx) {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

  return (
    rect.top >= marginPx &&
    rect.left >= 0 &&
    rect.bottom <= (viewportHeight - marginPx) &&
    rect.right <= viewportWidth
  );
}

function updateArrowPosition(newIndex) {
  if (!webNavigatorEnabledState) return;

  if (allResultLinks.length === 0) {
    currentSelectedIndex = -1;
    removeExistingArrows();
    return;
  }

  if (newIndex < 0) {
    newIndex = allResultLinks.length - 1;
  } else if (newIndex >= allResultLinks.length) {
    newIndex = 0;
  }

  if (newIndex === currentSelectedIndex && allResultLinks[newIndex]?.querySelector('.extension-arrow')) {
    return;
  }

  removeExistingArrows();

  currentSelectedIndex = newIndex;
  const targetLink = allResultLinks[currentSelectedIndex];

  if (targetLink) {
    injectArrow(targetLink);

    const linkRect = targetLink.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const currentScrollY = window.scrollY;

    if (currentSelectedIndex === 0) {
      if (currentScrollY > 0) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      if (!isElementFullyVisibleWithMargin(targetLink, SCROLL_MARGIN_PX)) {
        let scrollToY = currentScrollY;

        if (linkRect.top < SCROLL_MARGIN_PX) {
          const desiredLinkTopFromViewportTop = viewportHeight * SCROLL_FROM_TOP_PERCENT;
          scrollToY = currentScrollY + linkRect.top - desiredLinkTopFromViewportTop;
        }
        else if (linkRect.bottom > (viewportHeight - SCROLL_MARGIN_PX)) {
          const desiredLinkBottomFromViewportTop = viewportHeight - (viewportHeight * SCROLL_FROM_BOTTOM_PERCENT);
          scrollToY = currentScrollY + linkRect.bottom - desiredLinkBottomFromViewportTop;
        }

        scrollToY = Math.max(0, Math.min(scrollToY, document.body.scrollHeight - viewportHeight));

        if (Math.abs(scrollToY - currentScrollY) > 1) {
            window.scrollTo({ top: scrollToY, behavior: 'smooth' });
        }
      }
    }
  } else {
    initializeExtension();
  }
}

function handleKeyDown(event) {
  if (!webNavigatorEnabledState) return;

  // Check if the event target is an input field, textarea, or contenteditable element.
  // This is crucial to avoid interfering with user typing.
  const tagName = event.target.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || event.target.isContentEditable) {
    // Additionally, allow space to be typed in search inputs, unless Ctrl is pressed
    if (event.key === ' ' && !event.ctrlKey && (tagName === 'INPUT' && event.target.type === 'search' || event.target.type === 'text')) {
        return;
    }
    // For other inputs, if it's space or enter, we might still want to prevent default if not typing
    // but the current setup implicitly handles it by returning early.
    // If it's not a relevant key, just let it pass.
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Enter' && event.key !== ' ') {
        return;
    }
  }

  if (allResultLinks.length === 0) {
    return;
  }

  switch (event.key) {
    case 'ArrowUp':
      event.preventDefault();
      updateArrowPosition(currentSelectedIndex - 1);
      break;
    case 'ArrowDown':
      event.preventDefault();
      updateArrowPosition(currentSelectedIndex + 1);
      break;
    case 'Enter': // Fallthrough for Enter and Space
    case ' ':
      // Only prevent default for Space if Ctrl is also pressed or if it's not an input field
      // This prevents unwanted scrolling/actions while allowing space to be typed in search bars normally
      if (event.key === ' ' && !event.ctrlKey && (tagName === 'INPUT' || tagName === 'TEXTAREA' || event.target.isContentEditable)) {
          return;
      }
      event.preventDefault();

      const selectedLink = allResultLinks[currentSelectedIndex];
      if (selectedLink) {
        if (event.ctrlKey) {
          window.open(selectedLink.href, '_blank');
        } else {
          selectedLink.click();
        }
      }
      break;
  }
}

function refreshLinksAndArrowPosition() {
  if (!webNavigatorEnabledState) {
    removeExistingArrows();
    allResultLinks = [];
    currentSelectedIndex = -1;
    return;
  }

  const oldResultLinks = [...allResultLinks];
  const newLinks = findAllResultLinks();

  const linksChanged = oldResultLinks.length !== newLinks.length ||
                       !oldResultLinks.every((link, i) => link === newLinks[i]);

  if (linksChanged) {
    allResultLinks = newLinks;

    let newIndex = 0;
    if (currentSelectedIndex !== -1 && oldResultLinks[currentSelectedIndex]) {
        const previouslySelectedLink = oldResultLinks[currentSelectedIndex];
        const foundIndexInNewList = newLinks.indexOf(previouslySelectedLink);
        if (foundIndexInNewList !== -1) {
            newIndex = foundIndexInNewList;
        } else {
            const sameHrefLinkIndex = newLinks.findIndex(link => link.href === previouslySelectedLink.href);
            if (sameHrefLinkIndex !== -1) {
                newIndex = sameHrefLinkIndex;
            }
        }
    }
    updateArrowPosition(newIndex);
  } else if (allResultLinks.length > 0 && (currentSelectedIndex === -1 || !allResultLinks[currentSelectedIndex]?.querySelector('.extension-arrow'))) {
      updateArrowPosition(currentSelectedIndex === -1 ? 0 : currentSelectedIndex);
  }
}

// Function to attach all event listeners and observer
function attachContentScriptListeners() {
  if (isExtensionInitialized) return;

  if (window.extensionKeyDownListener) {
    document.removeEventListener('keydown', window.extensionKeyDownListener);
  }
  const newListener = (event) => handleKeyDown(event);
  document.addEventListener('keydown', newListener);
  window.extensionKeyDownListener = newListener;

  if (!mutationObserverInstance) {
    mutationObserverInstance = new MutationObserver((mutations) => {
      let relevantChangeDetected = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          const addedNodes = Array.from(mutation.addedNodes);
          const removedNodes = Array.from(mutation.removedNodes);
          const hasRelevantNode = (nodes) => nodes.some(node =>
            node.nodeType === 1 && (
              node.id === 'search' || node.closest('#search') ||
              node.matches('.g') || node.matches('.tF2Cxc') ||
              node.matches('.yuRUbf') || node.matches('.rc') || node.matches('.srg')
            )
          );
          if (hasRelevantNode(addedNodes) || hasRelevantNode(removedNodes)) {
            relevantChangeDetected = true;
            break;
          }
        }
      }

      if (relevantChangeDetected) {
        clearTimeout(window.extensionRefreshTimeout);
        window.extensionRefreshTimeout = setTimeout(() => {
          refreshLinksAndArrowPosition();
        }, 200);
      }
    });

    const googleSearchContainer = document.getElementById('search');
    if (googleSearchContainer) {
      mutationObserverInstance.observe(googleSearchContainer, { childList: true, subtree: true, attributes: false });
    } else {
      mutationObserverInstance.observe(document.body, { childList: true, subtree: true, attributes: false });
    }
  }

  isExtensionInitialized = true;
}

// Function to remove all event listeners and disconnect observer
function detachContentScriptListeners() {
  if (!isExtensionInitialized) return;

  if (window.extensionKeyDownListener) {
    document.removeEventListener('keydown', window.extensionKeyDownListener);
    window.extensionKeyDownListener = null;
  }
  if (mutationObserverInstance) {
    mutationObserverInstance.disconnect();
    mutationObserverInstance = null;
  }
  removeExistingArrows();
  allResultLinks = [];
  currentSelectedIndex = -1;
  isExtensionInitialized = false;
}

// Main initialization logic, now conditional
async function initializeExtension() {
  webNavigatorEnabledState = await getWebNavigatorSetting();

  if (webNavigatorEnabledState) {
    attachContentScriptListeners();
    refreshLinksAndArrowPosition();
  } else {
    detachContentScriptListeners();
  }
}

// Listen for changes in storage (from popup)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.webNavigatorEnabled) {
    webNavigatorEnabledState = changes.webNavigatorEnabled.newValue;
    initializeExtension();
  }
});

// Initial load events
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    initializeExtension();
  }
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    initializeExtension();
  }
});
