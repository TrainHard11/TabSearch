/**
 * content.js
 * This script runs on Google and Yandex search results pages to:
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
 * - Scroll it so its bottom is 25% up from the viewport bottom (when scrolling down).
 * - Scroll it so its top is 25% from the viewport top (when scrolling up).
 */

let allResultLinks = [];       // Stores all found clickable result links
let currentSelectedIndex = -1; // Index of the currently highlighted link
let isExtensionInitialized = false; // Flag to prevent multiple initializations
let mutationObserverInstance = null; // Store the observer instance

// Define a desired minimum margin in pixels from viewport top/bottom for intermediate links
const SCROLL_MARGIN_PX = 100;

// Define the percentage from the bottom for intermediate link scrolling (when scrolling DOWN or coming into view from below)
const SCROLL_FROM_BOTTOM_PERCENT = 0.25; // Adjusted to 25% for more noticeable scroll

// Define the percentage from the top for intermediate link scrolling (when scrolling UP or coming into view from above)
const SCROLL_FROM_TOP_PERCENT = 0.25; // Adjusted to 25% for more noticeable scroll

/**
 * Finds all eligible search result links based on the current hostname.
 * This function is designed to be idempotent and returns a fresh list.
 * @returns {Array<HTMLAnchorElement>} A list of valid link elements.
 */
function findAllResultLinks() {
  console.log('Google & Yandex Search Result Opener: Re-scanning for result links...');
  const hostname = window.location.hostname;
  let searchResultsContainer = null;
  let linkSelectors = [];
  let excludeSelectors = [];

  // Define selectors based on the search engine
  if (hostname.includes('google.com')) {
    searchResultsContainer = document.getElementById('search');
    linkSelectors = [
      'div.g h3 a',                   // Common main result link (older Google)
      'div.tF2Cxc h3 a',              // Another common main result link (newer Google)
      'div.yuRUbf a[href^="http"]',   // Link wrapper for main results
      'div.g a[href^="http"]'         // General link in result block
    ];
    excludeSelectors = [
      '[role="button"]',              // Buttons (e.g., "More results")
      '.commercial-unit',             // Ads
      '#pnnext',                      // Next page button
      '.fl',                          // "Cached", "Similar" links
      'a[ping]'                       // Analytics or other non-primary links
    ];
  } else if (hostname.includes('yandex.com') || hostname.includes('yandex.ru')) {
    searchResultsContainer = document.querySelector('.main__content') || document.querySelector('.serp-list') || document.body;

    linkSelectors = [
      'li.serp-item h2.organic__title a', // Most common pattern: link inside h2 within serp-item
      'li.serp-item .organic__url a[href^="http"]', // Link in the URL line
      '.serp-item a.link[href^="http"]', // General link with 'link' class within serp-item
      '.UniversalSearchItem a[href^="http"]', // Broader selector for universal search items (e.g., news, social)
      '.news-item .news-item__url a[href^="http"]', // News specific link
      '.video-results__item .video-results__url a[href^="http"]', // Video specific link
      '.twitter-results__item a[href^="http"]', // Attempt to catch the Twitter results link explicitly
      'div[data-bem*="result"] a[href^="http"]' // More general data-bem attribute common on Yandex results
    ];
    excludeSelectors = [
      '[role="button"]',              // Buttons
      '.ads-block',                   // Ads or ad-related containers
      '.pager__item',                 // Pagination links
      '.link_outer',                  // Sometimes used for "more from this site" or similar secondary links
      '.sitelinks__item a',           // Sitelinks beneath the main result (often not primary results)
      '.card-text-container a',       // Some block-style results that might be secondary
      '.suggest__item a',             // Search suggestions
      'a[aria-label="На следующую страницу"]', // Yandex specific pagination
      'a[data-t="sitelinks_item"]' // Exclude sitelinks that are sometimes direct children
    ];
  }

  if (!searchResultsContainer) {
    console.error('Google & Yandex Search Result Opener: Search results container not found for', hostname);
    return [];
  }

  const links = [];

  // Iterate through defined link selectors
  for (const selector of linkSelectors) {
    const elements = searchResultsContainer.querySelectorAll(selector);
    for (const el of elements) {
      // Basic checks for a valid, visible, and non-excluded link
      let isValid = el.tagName === 'A' && el.href && el.href.startsWith('http') && el.offsetParent !== null && el.textContent.trim().length > 0;

      // Apply exclusion rules
      if (isValid) {
        for (const excludeSelector of excludeSelectors) {
          if (el.matches(excludeSelector) || el.closest(excludeSelector)) {
            isValid = false;
            // console.log('Excluded:', el, 'by', excludeSelector);
            break;
          }
        }
      }

      if (isValid && !links.includes(el)) {
        links.push(el);
      }
    }
  }

  console.log(`Google & Yandex Search Result Opener: Found ${links.length} potential result links for ${hostname}.`);
  return links;
}

/**
 * Removes any existing arrow elements from the page.
 */
function removeExistingArrows() {
  const existingArrows = document.querySelectorAll('.extension-arrow');
  existingArrows.forEach(arrow => {
    if (arrow.parentNode) {
      arrow.parentNode.removeChild(arrow);
    }
  });
  // console.log('Google & Yandex Search Result Opener: Removed all existing arrows.');
}

/**
 * Injects the arrow element directly inside the target link.
 * @param {HTMLAnchorElement} linkElement - The link to inject the arrow into.
 */
function injectArrow(linkElement) {
  // Check if an arrow already exists *within* this specific link to prevent duplicates.
  if (linkElement.querySelector('.extension-arrow')) {
    return;
  }

  const arrow = document.createElement('span');
  arrow.classList.add('extension-arrow'); // Applies initial styles (opacity: 0, transform: scale(0.8))
  arrow.textContent = '➤'; // Unicode right arrow

  linkElement.prepend(arrow);

  // Trigger the animation by adding the 'is-active' class
  // Use requestAnimationFrame to ensure the browser has painted the initial state (opacity 0)
  // before applying the active state, triggering the transition.
  requestAnimationFrame(() => {
    arrow.classList.add('is-active');
  });

  // console.log('Google & Yandex Search Result Opener: Arrow injected and animation triggered.');
}

/**
 * Checks if an element is currently fully visible within the viewport with a given margin.
 * @param {HTMLElement} element - The element to check.
 * @param {number} marginPx - The desired margin from the viewport edges.
 * @returns {boolean} True if the element is fully visible within the margins, false otherwise.
 */
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

/**
 * Updates the arrow's position based on the new index.
 * Handles wrapping around the list of links and conditional scrolling.
 * @param {number} newIndex - The index of the link to highlight.
 */
function updateArrowPosition(newIndex) {
  if (allResultLinks.length === 0) {
    currentSelectedIndex = -1;
    removeExistingArrows(); // Clear any arrows if no links are found
    return;
  }

  // Handle wrapping around for navigation
  if (newIndex < 0) {
    newIndex = allResultLinks.length - 1;
  } else if (newIndex >= allResultLinks.length) {
    newIndex = 0;
  }

  // Only update if the selected index actually changes or the arrow is missing from the target.
  if (newIndex === currentSelectedIndex && allResultLinks[newIndex]?.querySelector('.extension-arrow')) {
    return;
  }

  removeExistingArrows(); // Always clear previous arrows before injecting a new one

  currentSelectedIndex = newIndex;
  const targetLink = allResultLinks[currentSelectedIndex];

  if (targetLink) {
    injectArrow(targetLink);

    const linkRect = targetLink.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const currentScrollY = window.scrollY;

    if (currentSelectedIndex === 0) {
      // For the first link, scroll to the very top of the page to show all content above it
      if (currentScrollY > 0) { // Only scroll if not already at the top
          window.scrollTo({ top: 0, behavior: 'smooth' });
          console.log(`Google & Yandex Search Result Opener: Arrow moved to index ${currentSelectedIndex}, link: ${targetLink.href}, scrolled to top of page.`);
      } else {
          console.log(`Google & Yandex Search Result Opener: Arrow moved to index ${currentSelectedIndex}, link: ${targetLink.href}, already at top.`);
      }
    } else {
      // For all other links (including the last one now): Conditional scrolling with a defined margin
      // Only scroll if the link is NOT fully visible within the defined margins
      if (!isElementFullyVisibleWithMargin(targetLink, SCROLL_MARGIN_PX)) {
        let scrollToY = currentScrollY;

        // Determine scroll target based on which edge is violated or direction
        // If the link's top is above or too close to the top margin (scrolling up to it)
        if (linkRect.top < SCROLL_MARGIN_PX) {
          // Scroll so its TOP is at SCROLL_FROM_TOP_PERCENT from viewport top
          const desiredLinkTopFromViewportTop = viewportHeight * SCROLL_FROM_TOP_PERCENT;
          scrollToY = currentScrollY + linkRect.top - desiredLinkTopFromViewportTop;
          console.log('Scroll triggered - top too high.');
        }
        // If the link's bottom is below or too close to the bottom margin (scrolling down to it)
        else if (linkRect.bottom > (viewportHeight - SCROLL_MARGIN_PX)) {
          // Scroll so its BOTTOM is at SCROLL_FROM_BOTTOM_PERCENT from viewport bottom
          const desiredLinkBottomFromViewportTop = viewportHeight - (viewportHeight * SCROLL_FROM_BOTTOM_PERCENT);
          scrollToY = currentScrollY + linkRect.bottom - desiredLinkBottomFromViewportTop;
          console.log('Scroll triggered - bottom too low.');
        }

        // Clamp the scroll position to valid bounds
        scrollToY = Math.max(0, Math.min(scrollToY, document.body.scrollHeight - viewportHeight));

        // Only perform the scroll if it's actually changing the scroll position by a noticeable amount
        if (Math.abs(scrollToY - currentScrollY) > 1) {
            window.scrollTo({ top: scrollToY, behavior: 'smooth' });
            console.log(`Google & Yandex Search Result Opener: Arrow moved to index ${currentSelectedIndex}, link: ${targetLink.href}, scrolled to ensure visibility with custom margins.`);
        } else {
            console.log(`Google & Yandex Search Result Opener: Arrow moved to index ${currentSelectedIndex}, link: ${targetLink.href}, no scroll needed (already visible within margin).`);
        }
      } else {
        console.log(`Google & Yandex Search Result Opener: Arrow moved to index ${currentSelectedIndex}, link: ${targetLink.href}, no scroll needed (already visible with sufficient margin).`);
      }
    }
  } else {
    console.warn('Google & Yandex Search Result Opener: Target link at index could not be found after update. Re-initializing.');
    initializeExtension();
  }
}

/**
 * Handles keyboard events for navigation and opening links.
 * @param {KeyboardEvent} event - The keyboard event.
 */
function handleKeyDown(event) {
  // Ensure we are not in an input field, textarea, or contenteditable element.
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) {
    return;
  }

  if (allResultLinks.length === 0) {
    return;
  }

  switch (event.key) {
    case 'ArrowUp':
      event.preventDefault(); // Prevent page scrolling
      updateArrowPosition(currentSelectedIndex - 1);
      break;
    case 'ArrowDown':
      event.preventDefault(); // Prevent page scrolling
      updateArrowPosition(currentSelectedIndex + 1);
      break;
    case 'Enter':
      event.preventDefault(); // Prevent default Enter behavior (e.g., form submission)
      const selectedLink = allResultLinks[currentSelectedIndex];
      if (selectedLink) {
        if (event.ctrlKey) {
          // Open in new tab if Ctrl key is pressed
          window.open(selectedLink.href, '_blank');
          console.log('Google & Yandex Search Result Opener: Ctrl+Enter pressed, opening link in new tab:', selectedLink.href);
        } else {
          // Open in current tab otherwise
          selectedLink.click();
          console.log('Google & Yandex Search Result Opener: Enter key pressed, opening link in current tab:', selectedLink.href);
        }
      } else {
        console.log('Google & Yandex Search Result Opener: Enter key pressed, but no link currently selected.');
      }
      break;
  }
}

/**
 * Refreshes the list of links and updates the arrow position.
 * Called by MutationObserver or when page visibility changes.
 */
function refreshLinksAndArrowPosition() {
  const oldResultLinks = [...allResultLinks]; // Take a snapshot of old links
  const newLinks = findAllResultLinks(); // Get fresh list of links

  // Check if the list of links has truly changed significantly
  const linksChanged = oldResultLinks.length !== newLinks.length ||
                       !oldResultLinks.every((link, i) => link === newLinks[i]);

  if (linksChanged) {
    console.log('Google & Yandex Search Result Opener: Link list changed, re-evaluating selection.');
    allResultLinks = newLinks; // Update the global list

    // Try to maintain selection if the previously selected link still exists in the new list
    let newIndex = 0; // Default to first link if current selection is lost
    if (currentSelectedIndex !== -1 && oldResultLinks[currentSelectedIndex]) {
        const previouslySelectedLink = oldResultLinks[currentSelectedIndex];
        const foundIndexInNewList = newLinks.indexOf(previouslySelectedLink);
        if (foundIndexInNewList !== -1) {
            newIndex = foundIndexInNewList; // Preserve selection if element is still present
        } else {
            // If the exact element is no longer there, try to find a link with the same href
            const sameHrefLinkIndex = newLinks.findIndex(link => link.href === previouslySelectedLink.href);
            if (sameHrefLinkIndex !== -1) {
                newIndex = sameHrefLinkIndex;
            } else {
                console.log('Google & Yandex Search Result Opener: Previous selection not found in new link list, defaulting to first link.');
            }
        }
    } else {
        console.log('Google & Yandex Search Result Opener: No previous selection or previous selection invalid, defaulting to first link.');
    }
    updateArrowPosition(newIndex); // Update arrow based on new links
  } else if (allResultLinks.length > 0 && (currentSelectedIndex === -1 || !allResultLinks[currentSelectedIndex]?.querySelector('.extension-arrow'))) {
      // If links haven't changed, but the arrow is missing or selection is invalid, re-inject/re-select.
      console.log('Google & Yandex Search Result Opener: Links unchanged, but arrow missing or selection invalid. Re-injecting/re-selecting.');
      // If currentSelectedIndex is -1, it means no valid link was found before, or the list was empty.
      // Re-evaluate from 0. Otherwise, re-apply to currentSelectedIndex.
      updateArrowPosition(currentSelectedIndex === -1 ? 0 : currentSelectedIndex);
  }
}

/**
 * Main initialization function. Designed to be called safely multiple times if needed,
 * but performs full setup (event listeners, observer) only once due to 'isExtensionInitialized' flag.
 */
function initializeExtension() {
  if (isExtensionInitialized) {
    // If already initialized, just refresh links and position.
    // This handles scenarios like history navigation or tab becoming visible.
    console.log('Google & Yandex Search Result Opener: Already initialized, refreshing state.');
    refreshLinksAndArrowPosition();
    return;
  }

  console.log('Google & Yandex Search Result Opener: Initializing extension for the first time...');
  refreshLinksAndArrowPosition(); // Initial scan and arrow placement

  // Set up the global keydown listener ONLY ONCE
  if (window.extensionKeyDownListener) {
    document.removeEventListener('keydown', window.extensionKeyDownListener);
  }
  const newListener = (event) => handleKeyDown(event);
  document.addEventListener('keydown', newListener);
  window.extensionKeyDownListener = newListener; // Store for potential removal

  // Set up the MutationObserver ONLY ONCE
  if (!mutationObserverInstance) {
    mutationObserverInstance = new MutationObserver((mutations) => {
      let relevantChangeDetected = false;
      for (const mutation of mutations) {
        // Check for changes that might affect search results (e.g., new elements added/removed in #search or .main__content)
        if (mutation.type === 'childList') {
          const addedNodes = Array.from(mutation.addedNodes);
          const removedNodes = Array.from(mutation.removedNodes);
          const hasRelevantNode = (nodes) => nodes.some(node =>
            node.nodeType === 1 && (
              node.id === 'search' || node.closest('#search') || // Google
              node.matches('.main__content') || node.closest('.main__content') || // Yandex
              node.matches('.g') || node.matches('.tF2Cxc') || // Google result classes
              node.matches('.yuRUbf') || node.matches('.rc') || node.matches('.srg') || // Other Google wrappers
              node.matches('.serp-item') || node.matches('.organic__url') || // Yandex result classes/wrappers
              node.matches('#main') || // Generic main content area
              node.matches('.UniversalSearchItem') || node.matches('.twitter-results__item') || // Yandex specific blocks
              node.matches('.news-item') || node.matches('.video-results__item')
            )
          );
          if (hasRelevantNode(addedNodes) || hasRelevantNode(removedNodes)) {
            relevantChangeDetected = true;
            break;
          }
        }
      }

      if (relevantChangeDetected) {
        // Debounce refresh to avoid excessive calls during rapid DOM changes
        clearTimeout(window.extensionRefreshTimeout);
        window.extensionRefreshTimeout = setTimeout(() => {
          console.log('Google & Yandex Search Result Opener: DOM change detected, triggering refresh.');
          refreshLinksAndArrowPosition();
        }, 200); // Increased delay slightly for better stability
      }
    });

    // Start observing the relevant container or body as fallback.
    const googleSearchContainer = document.getElementById('search');
    const yandexSerpList = document.querySelector('.serp-list');
    const yandexMainContent = document.querySelector('.main__content');


    if (googleSearchContainer) {
      mutationObserverInstance.observe(googleSearchContainer, { childList: true, subtree: true, attributes: false });
      console.log('Google & Yandex Search Result Opener: Observing Google #search container.');
    } else if (yandexSerpList) { // Prioritize .serp-list if it exists for Yandex
        mutationObserverInstance.observe(yandexSerpList, { childList: true, subtree: true, attributes: false });
        console.log('Google & Yandex Search Result Opener: Observing Yandex .serp-list container.');
    }
    else if (yandexMainContent) { // Fallback to .main__content for Yandex
      mutationObserverInstance.observe(yandexMainContent, { childList: true, subtree: true, attributes: false });
      console.log('Google & Yandex Search Result Opener: Observing Yandex .main__content container.');
    } else { // Final fallback to document.body
      mutationObserverInstance.observe(document.body, { childList: true, subtree: true, attributes: false });
      console.log('Google & Yandex Search Result Opener: Observing document.body as specific containers not found initially.');
    }
  }

  // Set flag that extension is now initialized
  isExtensionInitialized = true;
  console.log('Google & Yandex Search Result Opener: Initialization complete.');
}


// Event listeners for initial load and visibility changes
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
  initializeExtension(); // If DOM is already ready
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    console.log('Google & Yandex Search Result Opener: Page became visible, refreshing state.');
    refreshLinksAndArrowPosition();
  }
});

// Listener for history navigation (back/forward buttons)
window.addEventListener('pageshow', (event) => {
  // Check if the page is being restored from the bfcache (back-forward cache)
  if (event.persisted) {
    console.log('Google & Yandex Search Result Opener: Page restored from bfcache, refreshing state.');
    refreshLinksAndArrowPosition();
  }
});
