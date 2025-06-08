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
 * @returns {Promise<boolean>} Resolves with the boolean value of the setting,
 * or the default if the context is invalidated.
 */
async function getWebNavigatorSetting() {
    try {
        const result = await chrome.storage.local.get({ webNavigatorEnabled: true });
        // It's good practice to check chrome.runtime.lastError after any chrome.* API call
        // especially in content scripts.
        if (chrome.runtime.lastError) {
            console.warn("Chrome storage error:", chrome.runtime.lastError.message);
            // If there's an error, assume default or a safe state
            return true; // Or false, depending on what's safest default behavior during an error
        }
        return result.webNavigatorEnabled;
    } catch (error) {
        // This catch block might not always capture "context invalidated"
        // as the error might occur even before the promise 'catches' it
        // but it's good for other potential errors.
        console.error("Error getting webNavigatorEnabled setting:", error);
        return true; // Return default in case of error
    }
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
        // More robust selectors for various types of Google search results
        linkSelectors = [
            'a:not([role="button"]):not(.fl):not(.eZt8xd):not([ping])', // Generic link not a button, footer link, etc.
            'div.g a', // Standard organic results
            'div.tF2Cxc a', // Another common structure for organic results
            'div.yuRUbf a', // Yet another structure
            'div.X5OiLe a', // News/video results sometimes use this
            'div.qv3Wpe a', // "People also ask" links
            'div.dFdO7c a', // Image links that open a search (if not specifically excluded)
            'div.srg a', // Older Google structure for search results
            'g-scrolling-carousel a', // Links within carousels (e.g., videos)
            'div[data-sokoban-container] a', // Featured snippets, knowledge panels
            'div[data-md] a', // More generic for structured data results
            'div.jtfGm a', // Could capture some ad or sponsored links, need careful exclusion
            'div.Ww4FFb a' // General links often found in result blocks
        ];
        excludeSelectors = [
            // General exclusions
            '[role="button"]',
            '.commercial-unit', // Ads
            'a[ping]', // Links with ping attribute (often analytics/ads)
            '.gL9Hy', // Footer/bottom links (e.g., "Next page")
            '#pnnext', // Next page button
            '.fl', // Various footer links
            'a[href="#"]', // Anchor links within the page
            'a[href^="javascript:"]', // Javascript links
            'a[aria-label="Search by image"]', // Image search icon
            'a[href*="/search?q=related:"]', // Related searches
            'a[href*="/search?q=site:"]', // Site search suggestions
            'a[href*="google.com/url?q="][href*="webcache.googleusercontent.com"]', // Cached links
            'a[data-ved][jsname="cKq3i"]', // "More results" from a site/section
            '.fGFU5', // "More results" button
            '.xERGE', // Google Translate / "More languages" links
            '.gLFyf', // The search input itself
            '.jhp button', // Search button
            '.sbsb_c a', // Search suggestions dropdown links
            'a.kno-a.xnprg', // Knowledge panel "More about" links
            'a[href*="google.com/search?tbm=isch"]', // Image search link from video/news section
            'a[href*="google.com/search?tbm=vid"]', // Video search link
            'a[href*="google.com/search?tbm=nws"]', // News search link
            'a[jsaction*="click:__qavf:"]', // Links in "People also ask" that expand answers, not real external links
            '.lXgL3c', // Elements often containing "Feedback" or similar non-result links
            '.P9pYv.cKq3i', // "More results from X" type links that are not the main result
            '.fP1Qef a', // "About this result"
            '.mI8kLc a', // "Similar results" links
            '.wQ3eC a', // Some related searches or quick answers
            '.v5rswb a', // "See results about" links
            '.nBDE2d a' // More like shopping or product links
        ];
        searchResultsContainer = document.getElementById('search'); // Still a good general container
    } else {
        // If not a Google search page, no links are found by this script.
        return [];
    }

    if (!searchResultsContainer) {
        // Fallback to searching the whole document if 'search' container is not found,
        // though it's usually present on Google search pages.
        searchResultsContainer = document.body;
    }

    const links = new Set(); // Use a Set to automatically handle duplicates

    for (const selector of linkSelectors) {
        const elements = searchResultsContainer.querySelectorAll(selector);
        for (const el of elements) {
            // Basic validity checks
            let isValid = el.tagName === 'A' && el.href && el.href.startsWith('http') && el.offsetParent !== null;

            // Additional checks to ensure it's a "displayable" link with text or an image
            if (isValid) {
                const textContent = el.textContent.trim();
                const hasText = textContent.length > 0;
                const hasImage = el.querySelector('img') !== null;
                isValid = hasText || hasImage; // Must have text or an image
            }

            // Apply exclusion selectors
            if (isValid) {
                for (const excludeSelector of excludeSelectors) {
                    if (el.matches(excludeSelector) || el.closest(excludeSelector)) {
                        isValid = false;
                        break;
                    }
                }
            }
            
            // Exclude links that are direct children of the search input field or similar interactive elements
            // This prevents the arrow from appearing within the search bar itself or its autocomplete suggestions.
            if (isValid) {
                if (el.closest('.gLFyf, .RNNXgb, .a4bIc, .SDkEP')) { // Common classes for search input/related elements
                    isValid = false;
                }
            }


            if (isValid) {
                // Further filter out empty or non-meaningful links
                if (el.href.trim() === '' || el.textContent.trim() === '') {
                    isValid = false;
                }
                // Exclude links that point to the current page with just a hash
                if (el.href === window.location.href + '#') {
                    isValid = false;
                }
                // Exclude links that are just part of the navigation (e.g., page numbers)
                if (el.closest('#foot')) { // Check if it's in the footer pagination
                    isValid = false;
                }
            }


            if (isValid) {
                links.add(el);
            }
        }
    }

    // Convert Set to Array and sort by vertical position to maintain natural order
    const sortedLinks = Array.from(links).sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();

        // Sort primarily by top position, then by left position for elements on the same line
        if (rectA.top !== rectB.top) {
            return rectA.top - rectB.top;
        }
        return rectA.left - rectB.left;
    });

    return sortedLinks;
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

    // Set the parent link to position: relative for absolute positioning of the arrow
    // We check if it's already set to avoid unnecessary style changes.
    if (window.getComputedStyle(linkElement).position === 'static') {
        linkElement.style.position = 'relative';
    }

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
                window.scrollTo({ top: 0, behavior: 'auto' }); // Changed to 'auto' for no animation
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
                    window.scrollTo({ top: scrollToY, behavior: 'auto' }); // Changed to 'auto' for no animation
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
                            node.matches('div.g') || node.matches('div.tF2Cxc') ||
                            node.matches('div.yuRUbf') || node.matches('div.rc') || node.matches('div.srg') ||
                            node.matches('div.X5OiLe') || node.matches('div.qv3Wpe') // Added more specific relevant nodes
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
    // Before calling getWebNavigatorSetting(), check if the runtime is valid.
    // This is more of a defensive check. The error typically happens *after* the await,
    // so checking chrome.runtime.lastError *after* the promise resolves/rejects
    // is the primary fix. However, this preliminary check doesn't hurt.
    if (chrome.runtime && chrome.runtime.id) { // Check if extension runtime is still active
        webNavigatorEnabledState = await getWebNavigatorSetting();
    } else {
        // If runtime is already invalidated, assume a default state
        console.warn("Extension runtime is invalidated during initializeExtension. Assuming webNavigatorEnabledState is true.");
        webNavigatorEnabledState = true; // Or false, depending on desired behavior
    }


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
        // This listener might also fire after context invalidation.
        // It's generally handled by Chrome's lifecycle, but a similar
        // check can be added if issues persist here.
        if (chrome.runtime && chrome.runtime.id) {
            webNavigatorEnabledState = changes.webNavigatorEnabled.newValue;
            initializeExtension();
        } else {
            console.warn("Extension runtime invalidated during storage change listener.");
        }
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
