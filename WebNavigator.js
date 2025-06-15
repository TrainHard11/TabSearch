let allResultLinks = [];
let currentSelectedIndex = -1;
let isExtensionInitialized = false; // Tracks if the content script's listeners are active
let mutationObserverInstance = null;

const SCROLL_MARGIN_PX = 100;
const SCROLL_FROM_TOP_PERCENT = 0.25;
const SCROLL_FROM_BOTTOM_PERCENT = 0.25;

// Variable to hold the current web navigator enabled state
let webNavigatorEnabledState = true; // Default to enabled until setting is loaded

/**
 * Safely retrieves the webNavigatorEnabled setting from storage.
 * It will always attempt to get the setting and handles errors gracefully.
 * @returns {Promise<boolean>} Resolves with the boolean value of the setting,
 * or the default (true) if storage access fails.
 */
async function getWebNavigatorSetting() {
    try {
        const result = await chrome.storage.local.get({ webNavigatorEnabled: true });
        // chrome.runtime.lastError is the standard way to check for API errors after a call.
        if (chrome.runtime.lastError) {
            console.warn("Chrome storage read error:", chrome.runtime.lastError.message);
            return true; // Fallback to default if there's an error getting the setting
        }
        return result.webNavigatorEnabled;
    } catch (error) {
        // Catch any unexpected errors during the storage operation itself
        console.error("Error retrieving webNavigatorEnabled setting:", error);
        return true; // Fallback to default
    }
}

/**
 * Finds all eligible search result links, specifically targeting Google's
 * primary organic and featured snippet links for simplicity.
 * This should make the arrow consistently point at the main search results.
 * @returns {Array<HTMLAnchorElement>} A sorted array of unique, valid link elements.
 */
function findAllResultLinks() {
    // Ensure we are on a Google search domain
    if (!window.location.hostname.includes('google.com')) {
        return [];
    }

    const uniqueLinks = new Set();
    // Prioritize the main search results container for efficiency
    const searchResultsContainer = document.getElementById('search') || document.body;

    // Use broader, more stable selectors for main search results
    // Google's DOM structure is complex, but these are generally reliable for primary links.
    const primaryLinkSelectors = [
        'div.g a', // Most common organic search result link container
        'div[data-async-type="snippet"] a', // Featured snippets often use this structure
        'div.tF2Cxc a', // Another common organic result structure
        'div.yuRUbf a', // Yet another common organic result structure
        'div.X5OiLe a' // May capture some news/video results that are direct links
    ];

    // Stronger exclusion criteria to prevent selecting non-navigable elements.
    // Order and specificity are important here.
    const excludeSelectors = [
        '[role="button"]', // Exclude anything that's clearly a button
        'a[ping]', // Exclude analytics/tracking links that redirect (often ads or internal analytics)
        '.gL9Hy', '.fl', '#pnnext', // Exclude footer/pagination, "more results" type links
        'a[href="#"]', 'a[href^="javascript:"]', // Exclude internal anchor links or JS functions
        'input', 'textarea', '[contenteditable="true"]', // Exclude input fields
        '.sbsb_c a', // Exclude search suggestions from the search bar dropdown
        '.commercial-unit', // Exclude ad blocks (they usually have this class or similar)
        '.gLFyf', '.RNNXgb', '.a4bIc', '.SDkEP', // Exclude elements related to the search input box
        '[aria-label="Search by image"]', // Exclude search by image icon
        '.ab_button', // Exclude generic buttons within search results
        'div[jsname="x3Bms"] a[aria-expanded]', // Exclude "People also ask" accordion headers (they expand, not navigate)
        // Additional exclusions for common non-result links that might match 'a'
        '.Lqc6Hd a', // "Related searches" links often at the bottom
        '.kp-blk a', // Knowledge panel internal links (sometimes too broad)
        '.kno-ft a' // More knowledge panel internal links
    ];

    for (const selector of primaryLinkSelectors) {
        const elements = searchResultsContainer.querySelectorAll(selector);
        for (const el of elements) {
            // Basic check: Must be an anchor with an HTTP/S href, visible, and have content
            let isValid = el.tagName === 'A' && el.href && el.href.startsWith('http') && el.offsetParent !== null;

            if (isValid) {
                const textContent = el.textContent.trim();
                const hasVisibleText = textContent.length > 0 && el.offsetWidth > 0 && el.offsetHeight > 0;
                const hasImage = el.querySelector('img') !== null;
                isValid = hasVisibleText || hasImage;
            }

            // Apply exclusion selectors to the element itself or its ancestors
            if (isValid) {
                for (const excludeSelector of excludeSelectors) {
                    if (el.matches(excludeSelector) || el.closest(excludeSelector)) {
                        isValid = false;
                        break;
                    }
                }
            }

            if (isValid) {
                uniqueLinks.add(el);
            }
        }
    }

    // Convert Set to Array and sort by vertical position for natural navigation order
    return Array.from(uniqueLinks).sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        // Primary sort by top position, secondary by left position
        return rectA.top - rectB.top || rectA.left - rectB.left;
    });
}

/**
 * Removes all previously injected arrow cursors from the page.
 */
function removeExistingArrows() {
    document.querySelectorAll('.extension-arrow-container').forEach(container => {
        // Restore original z-index if it was modified
        const parentLink = container.closest('a');
        if (parentLink && parentLink.dataset.originalZIndex !== undefined) {
            parentLink.style.zIndex = parentLink.dataset.originalZIndex;
            delete parentLink.dataset.originalZIndex;
        } else if (parentLink && parentLink.style.zIndex === '10000') {
            parentLink.style.zIndex = ''; // Clear if it was our set value and no original was stored
        }
        container.remove();
    });
}

/**
 * Injects an arrow cursor next to the given link element.
 * @param {HTMLAnchorElement} linkElement The link to inject the arrow next to.
 */
function injectArrow(linkElement) {
    if (linkElement.tagName !== 'A' || linkElement.querySelector('.extension-arrow-container')) {
        return; // Don't inject if not an anchor or arrow already exists
    }

    const arrowContainer = document.createElement('span');
    arrowContainer.classList.add('extension-arrow-container');
    // Minimal styling, mostly handled by CSS
    arrowContainer.style.position = 'relative'; // For arrow's absolute positioning
    arrowContainer.style.display = 'inline-block'; // To occupy space and respect text flow
    arrowContainer.style.verticalAlign = 'middle';
    arrowContainer.style.width = '0'; // Take no horizontal space
    arrowContainer.style.height = '0'; // Take no vertical space

    const arrow = document.createElement('span');
    arrow.classList.add('extension-arrow');
    arrow.textContent = '➤';

    arrowContainer.appendChild(arrow);
    linkElement.prepend(arrowContainer); // Place the arrow at the very beginning of the link's content

    // Ensure the link and its arrow are visible by elevating z-index
    if (linkElement.style.zIndex) {
        linkElement.dataset.originalZIndex = linkElement.style.zIndex;
    }
    linkElement.style.zIndex = '10000';
    linkElement.style.position = 'relative'; // z-index requires a positioned element
}

/**
 * Checks if an element is fully visible within the viewport, with a given margin.
 * @param {HTMLElement} element The DOM element to check.
 * @param {number} marginPx The margin in pixels to consider around the viewport.
 * @returns {boolean} True if the element is fully visible within the margin, false otherwise.
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
 * Updates the position of the arrow cursor to the new index. Handles scrolling.
 * @param {number} newIndex The index of the link to point to in `allResultLinks`.
 */
function updateArrowPosition(newIndex) {
    if (!webNavigatorEnabledState || allResultLinks.length === 0) {
        currentSelectedIndex = -1;
        removeExistingArrows();
        return;
    }

    // Ensure newIndex wraps around the array
    if (newIndex < 0) {
        newIndex = allResultLinks.length - 1;
    } else if (newIndex >= allResultLinks.length) {
        newIndex = 0;
    }

    removeExistingArrows(); // Always remove existing before injecting new
    currentSelectedIndex = newIndex;
    const targetLink = allResultLinks[currentSelectedIndex];

    if (targetLink) {
        injectArrow(targetLink);

        const linkRect = targetLink.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const currentScrollY = window.scrollY;

        // Special handling for the first link: always scroll to top
        if (currentSelectedIndex === 0) {
            if (currentScrollY > 0) {
                window.scrollTo({ top: 0, behavior: 'auto' });
            }
        } else {
            // General scrolling for other links if not fully visible
            if (!isElementFullyVisibleWithMargin(targetLink, SCROLL_MARGIN_PX)) {
                let scrollToY = currentScrollY;

                if (linkRect.top < SCROLL_MARGIN_PX) {
                    // Scroll up if link is above the desired top margin
                    const desiredLinkTopFromViewportTop = viewportHeight * SCROLL_FROM_TOP_PERCENT;
                    scrollToY = currentScrollY + linkRect.top - desiredLinkTopFromViewportTop;
                } else if (linkRect.bottom > (viewportHeight - SCROLL_MARGIN_PX)) {
                    // Scroll down if link is below the desired bottom margin
                    const desiredLinkBottomFromViewportTop = viewportHeight - (viewportHeight * SCROLL_FROM_BOTTOM_PERCENT);
                    scrollToY = currentScrollY + linkRect.bottom - desiredLinkBottomFromViewportTop;
                }

                // Clamp scroll position to document bounds
                scrollToY = Math.max(0, Math.min(scrollToY, document.body.scrollHeight - viewportHeight));

                // Only scroll if there's a meaningful change
                if (Math.abs(scrollToY - currentScrollY) > 1) {
                    window.scrollTo({ top: scrollToY, behavior: 'auto' });
                }
            }
        }
    } else {
        // If targetLink is invalid (e.g., removed from DOM), re-initialize to re-scan
        initializeExtension();
    }
}

/**
 * Handles keyboard navigation (ArrowUp, ArrowDown, Enter, Space).
 * Prevents default browser behavior for these keys when navigating.
 * @param {KeyboardEvent} event The keyboard event.
 */
function handleKeyDown(event) {
    if (!webNavigatorEnabledState || allResultLinks.length === 0) {
        return;
    }

    // Check if the event target is an input field, textarea, or contenteditable element.
    const tagName = event.target.tagName;
    const isInputField = tagName === 'INPUT' || tagName === 'TEXTAREA' || event.target.isContentEditable;

    // Allow normal typing behavior for relevant keys if in an input field,
    // unless a modifier key (Ctrl/Alt) is also pressed.
    if (isInputField) {
        if (!event.ctrlKey && !event.altKey && ['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) {
            return; // Allow default navigation/typing in inputs without modifiers
        }
        // If it's an input and not one of our specific navigation keys (even with modifiers), pass through
        if (!['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)) {
            return;
        }
    }

    switch (event.key) {
        case 'ArrowUp':
            event.preventDefault(); // Prevent page scroll
            updateArrowPosition(currentSelectedIndex - 1);
            break;
        case 'ArrowDown':
            event.preventDefault(); // Prevent page scroll
            updateArrowPosition(currentSelectedIndex + 1);
            break;
        case 'Enter':
        case ' ': // Handle space bar for activation
            if (currentSelectedIndex !== -1 && allResultLinks[currentSelectedIndex]) {
                event.preventDefault(); // Prevent default if we are taking action
                const selectedLink = allResultLinks[currentSelectedIndex];
                if (event.ctrlKey) {
                    window.open(selectedLink.href, '_blank'); // Open in new tab
                } else {
                    selectedLink.click(); // Navigate
                }
            } else if (event.key === ' ') {
                // If no link is selected and space is pressed, allow default space behavior (e.g., scroll page)
                return;
            }
            break;
    }
}

/**
 * Refreshes the list of found links and updates the arrow position.
 * Uses debouncing to prevent excessive calls during rapid DOM changes.
 */
function refreshLinksAndArrowPosition() {
    if (!webNavigatorEnabledState) {
        removeExistingArrows();
        allResultLinks = [];
        currentSelectedIndex = -1;
        return;
    }

    const oldResultLinks = [...allResultLinks];
    const newLinks = findAllResultLinks();

    // Determine if the list of links has actually changed
    const linksChanged = oldResultLinks.length !== newLinks.length ||
        !oldResultLinks.every((link, i) => link === newLinks[i]);

    if (linksChanged) {
        allResultLinks = newLinks;
        let newIndex = 0; // Default to the first link

        // Attempt to preserve the selection if the previously selected link still exists
        if (currentSelectedIndex !== -1 && oldResultLinks[currentSelectedIndex]) {
            const previouslySelectedLink = oldResultLinks[currentSelectedIndex];
            const foundIndexInNewList = newLinks.indexOf(previouslySelectedLink);
            if (foundIndexInNewList !== -1) {
                newIndex = foundIndexInNewList;
            } else {
                // If the DOM element changed, try to find by href
                const sameHrefLinkIndex = newLinks.findIndex(link => link.href === previouslySelectedLink.href);
                if (sameHrefLinkIndex !== -1) {
                    newIndex = sameHrefLinkIndex;
                }
            }
        }
        updateArrowPosition(newIndex);
    } else if (allResultLinks.length > 0 && (currentSelectedIndex === -1 || !allResultLinks[currentSelectedIndex]?.querySelector('.extension-arrow-container'))) {
        // If links didn't change but the arrow is missing (e.g., a re-render removed it), re-inject.
        updateArrowPosition(currentSelectedIndex === -1 ? 0 : currentSelectedIndex);
    }
}

/**
 * Attaches all necessary event listeners and the MutationObserver.
 * Ensures listeners are not duplicated.
 */
function attachContentScriptListeners() {
    if (isExtensionInitialized) return; // Prevent double initialization

    // Ensure only one keydown listener is active
    if (window.extensionKeyDownListener) {
        document.removeEventListener('keydown', window.extensionKeyDownListener);
    }
    const newKeyDownListener = (event) => handleKeyDown(event);
    document.addEventListener('keydown', newKeyDownListener);
    window.extensionKeyDownListener = newKeyDownListener; // Store reference

    // Initialize MutationObserver if not already active
    if (!mutationObserverInstance) {
        mutationObserverInstance = new MutationObserver(() => {
            // Debounce the refresh to avoid performance issues from rapid DOM changes
            clearTimeout(window.extensionRefreshTimeout);
            window.extensionRefreshTimeout = setTimeout(refreshLinksAndArrowPosition, 200);
        });

        // Observe the main search results container. Fallback to body if not found.
        const googleSearchContainer = document.getElementById('search');
        if (googleSearchContainer) {
            mutationObserverInstance.observe(googleSearchContainer, { childList: true, subtree: true, attributes: true });
        } else {
            mutationObserverInstance.observe(document.body, { childList: true, subtree: true, attributes: true });
        }
    }

    isExtensionInitialized = true;
    console.log("WebNavigator content script initialized.");
}

/**
 * Removes all event listeners and disconnects the MutationObserver.
 * Cleans up the DOM by removing any injected arrows.
 */
function detachContentScriptListeners() {
    if (!isExtensionInitialized) return; // Already detached

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
    console.log("WebNavigator content script detached.");
}

/**
 * Main function to initialize or de-initialize the extension's content script.
 * It reads the 'webNavigatorEnabled' setting and activates/deactivates functionality.
 */
async function initializeExtension() {
    // Attempt to get the setting regardless of chrome.runtime.id.
    // The getWebNavigatorSetting function itself now handles runtime errors.
    webNavigatorEnabledState = await getWebNavigatorSetting();

    if (webNavigatorEnabledState) {
        attachContentScriptListeners();
        // Initial scan and arrow placement might need a slight delay
        // to ensure all DOM elements are rendered, especially on complex pages.
        // Though document_idle helps, a small timeout ensures robustness.
        setTimeout(refreshLinksAndArrowPosition, 50);
    } else {
        detachContentScriptListeners(); // Clean up if disabled
    }
}

// Listen for changes in extension storage (e.g., from the popup UI)
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.webNavigatorEnabled) {
        // We only re-initialize if the runtime appears to be active to avoid
        // errors from an invalid context attempting storage operations.
        // The `getWebNavigatorSetting` now handles the fallback if the context
        // *becomes* invalid during its execution.
        if (chrome.runtime?.id) {
            initializeExtension();
        } else {
            console.warn("Storage change received but chrome.runtime is invalid. Cannot update webNavigator state until runtime is restored.");
        }
    }
});

// --- Initial Load and Lifecycle Event Handlers ---

// Ensure the extension initializes when the DOM is fully loaded or already ready.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension(); // DOM is already ready
}

// Re-initialize if the tab becomes visible (e.g., user switches back to it)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log("Tab became visible. Re-initializing WebNavigator.");
        initializeExtension();
    }
});

// Handle pages that are served from the back/forward cache (bfcache).
// These pages don't trigger 'DOMContentLoaded' or 'load'.
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        console.log("Page restored from bfcache. Re-initializing WebNavigator.");
        initializeExtension();
    }
});
