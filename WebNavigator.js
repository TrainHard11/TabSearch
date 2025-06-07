/**
 * content.js
 * This script runs on Google search results pages to:
 * 1. Identify all organic search result links.
 * 2. Inject a small orange arrow icon next to the currently selected link.
 * 3. Allow navigation between links using Up/Down arrow keys.
 * 4. Open the selected link in the current tab when 'Enter' is pressed.
 * 5. Open the selected link in a new tab when 'Ctrl+Enter' is pressed.
 * 6. Ensure only one arrow is present and selection is maintained across DOM changes.
 * 7. Implements refined scrolling behavior:
 * - For the FIRST link: Scrolls to the very top of the page to show all content above it.
 * - For all OTHER links (including the last one):
 * - If the link is already fully visible and has sufficient margin from the viewport edges, NO SCROLL.
 * - If the link is not fully visible OR too close to an edge:
 * - Scroll it so its bottom is 70% up from the viewport bottom (when scrolling down).
 * - Scroll it so its top is 70% from the viewport top (when scrolling up).
 */

let allResultLinks = [];
let currentSelectedIndex = -1;
let isExtensionInitialized = false;
let mutationObserverInstance = null;

const SCROLL_MARGIN_PX = 100;
const SCROLL_FROM_BOTTOM_PERCENT = 0.25;
const SCROLL_FROM_TOP_PERCENT = 0.25;

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
    // Should not happen as manifest only targets google.com
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
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
    return;
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
    case 'Enter':
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

function initializeExtension() {
  if (isExtensionInitialized) {
    refreshLinksAndArrowPosition();
    return;
  }

  refreshLinksAndArrowPosition();

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refreshLinksAndArrowPosition();
  }
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    refreshLinksAndArrowPosition();
  }
});
