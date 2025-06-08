/**
 * content.js
 * This script runs on Google search results pages to:
 * 1. Identify all organic search result links.
 * 2. Inject a small orange arrow icon next to the currently selected link.
 * 3. Allow navigation between links using Up/Down arrow keys.
 * 4. Open the selected link in the current tab when 'Enter' or 'Space' is pressed.
 * 5. Open the selected link in a new tab when 'Ctrl+Enter' or 'Ctrl+Space' is pressed.
 * 6. Ensure only one arrow is present and selection is maintained across DOM changes.
 * 7. Implements refined scrolling behavior.
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
        if (chrome.runtime.lastError) {
            console.warn("Chrome storage error:", chrome.runtime.lastError.message);
            return true;
        }
        return result.webNavigatorEnabled;
    } catch (error) {
        console.error("Error getting webNavigatorEnabled setting:", error);
        return true;
    }
}


/**
 * Finds all eligible search result links.
 * This version simplifies selectors to be more robust across Google's frequent DOM changes.
 * It prioritizes links that are clearly part of organic search results or prominent related links.
 */
function findAllResultLinks() {
    const hostname = window.location.hostname;
    let searchResultsContainer = document.getElementById('search'); // Primary container for search results

    if (!hostname.includes('google.com')) {
        return []; // Only run on Google search pages
    }

    if (!searchResultsContainer) {
        // Fallback if the 'search' ID is not present (e.g., in rare variations)
        searchResultsContainer = document.body;
    }

    // Key selectors for various result types. Order matters for prioritization.
    // Starting with more specific, commonly used patterns.
    const linkSelectors = [
        'div.g a:not([role="button"]):not(.fl):not(.eZt8xd)', // Standard organic results (main links)
        'div.tF2Cxc a:not([role="button"]):not(.fl):not(.eZt8xd)', // Another common main result structure
        'div.yuRUbf a:not([role="button"]):not(.fl):not(.eZt8xd)', // Yet another main result structure
        'div.X5OiLe a:not([role="button"]):not(.fl):not(.eZt8xd)', // News/video results
        'div.qv3Wpe a:not([role="button"]):not(.fl):not(.eZt8xd)', // "People also ask" direct links
        'g-scrolling-carousel a:not([role="button"]):not(.fl):not(.eZt8xd)', // Links within carousels (videos, products)
        'div[data-sokoban-container] a:not([role="button"]):not(.fl):not(.eZt8xd)', // Featured snippets, knowledge panels
        'div.jtfGm a:not([role="button"]):not(.fl):not(.eZt8xd)', // Might capture some ads, but also legitimate sub-links
        'div.Ww4FFb a:not([role="button"]):not(.fl):not(.eZt8xd)', // General result block links
        'a[jsaction*="click:h"]:not([role="button"]):not(.fl):not(.eZt8xd)', // Generic click handler for result links
        'a[href^="http"]:not([role="button"]):not(.fl):not(.eZt8xd):not([ping])' // Broadest valid links, excluding known non-result elements
    ];

    // Exclusions to prevent selecting non-navigable or irrelevant elements.
    // Keep this list minimal and target specific non-link types.
    const excludeSelectors = [
        '[role="button"]', // Anything explicitly a button
        'a[ping]', // Often analytics/ad tracking links, or non-direct navigation
        '.gL9Hy', // Footer/bottom links (e.g., "Next page", page numbers)
        '#pnnext', // Next page button
        '.fl', // Various footer/utility links
        'a[href="#"]', // Anchor links within the same page
        'a[href^="javascript:"]', // Javascript links
        '.commercial-unit', // Ads (usually have this class)
        'input, textarea, [contenteditable="true"]', // User input fields
        '.sbsb_c a', // Search suggestions dropdown links
        '.jhp button', // Search button in input field
        '.GHDv0b', // Specific "More results from..." links that are often redundant or bad targets
        '.xERGE', // Google Translate / More languages
        '.fP1Qef a', // "About this result" links
        '.mI8kLc a', // "Similar results" links
        '.wQ3eC a', // Some related searches or quick answers
        '.v5rswb a', // "See results about" links
        '.nBDE2d a', // Shopping/product links often duplicated
        // Exclude specific elements that are part of the input or visual decorations
        '.gLFyf', '.RNNXgb', '.a4bIc', '.SDkEP', // Search input related
        '[aria-label="Search by image"]' // Image search icon
    ];

    const uniqueLinks = new Set(); // Use a Set to automatically handle duplicates

    // Iterate through selectors and collect potential links
    for (const selector of linkSelectors) {
        const elements = searchResultsContainer.querySelectorAll(selector);
        for (const el of elements) {
            // Basic validity checks
            let isValid = el.tagName === 'A' && el.href && el.href.startsWith('http') && el.offsetParent !== null;

            // Ensure the link has some meaningful content (text or image)
            if (isValid) {
                const textContent = el.textContent.trim();
                const hasText = textContent.length > 0;
                const hasImage = el.querySelector('img') !== null;
                isValid = hasText || hasImage;
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

            // Additional check for "People also ask" question headers that act as links
            // We want to avoid selecting the expand/collapse triggers themselves if they just reveal content.
            if (isValid && el.closest('div[jsname="x3Bms"]')) { // Common parent for PAA
                if (el.matches('a[aria-expanded]')) { // The actual question link that expands
                    isValid = false;
                }
            }
            
            // Filter out empty or non-meaningful links, e.g., icons without text
            if (isValid && el.textContent.trim() === '' && !el.querySelector('img')) {
                isValid = false;
            }

            if (isValid) {
                uniqueLinks.add(el);
            }
        }
    }

    // Convert Set to Array and sort by vertical position to maintain natural order
    const sortedLinks = Array.from(uniqueLinks).sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();

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
        const parentLink = arrow.closest('a');
        if (parentLink) {
            // Restore original position if it was changed by us
            if (parentLink.dataset.originalPosition !== undefined) {
                parentLink.style.position = parentLink.dataset.originalPosition;
                delete parentLink.dataset.originalPosition;
            } else if (parentLink.style.position === 'relative') {
                // If we set it to relative and didn't store an original, revert to default
                parentLink.style.position = ''; // Revert to browser default/inherited
            }

            // Restore original z-index if it was changed by us
            if (parentLink.dataset.originalZIndex !== undefined) {
                parentLink.style.zIndex = parentLink.dataset.originalZIndex;
                delete parentLink.dataset.originalZIndex;
            } else if (parentLink.style.zIndex === '10000') {
                // If we set it to 10000 and didn't store an original, clear it
                parentLink.style.zIndex = '';
            }
        }
        if (arrow.parentNode) {
            arrow.parentNode.removeChild(arrow);
        }
    });
}

function injectArrow(linkElement) {
    // Ensure we always target the actual anchor tag for injecting the arrow
    const targetAnchor = linkElement.tagName === 'A' ? linkElement : linkElement.querySelector('a');

    if (!targetAnchor || targetAnchor.querySelector('.extension-arrow')) {
        return; // Don't inject if no anchor or arrow already exists
    }

    const arrow = document.createElement('span');
    arrow.classList.add('extension-arrow');
    arrow.textContent = '➤';

    // Store original position and set to relative for proper absolute positioning of the arrow.
    const computedPosition = window.getComputedStyle(targetAnchor).position;
    if (computedPosition === 'static') {
        targetAnchor.dataset.originalPosition = 'static'; // Store 'static'
        targetAnchor.style.position = 'relative';
    } else {
        // If it's already non-static, store its current position
        targetAnchor.dataset.originalPosition = computedPosition;
    }

    // Attempt to bring the target link itself to the front to avoid clipping issues from parents
    // Store original z-index if it exists
    if (targetAnchor.style.zIndex) {
        targetAnchor.dataset.originalZIndex = targetAnchor.style.zIndex;
    }
    targetAnchor.style.zIndex = '10000'; // Very high z-index for the selected link and its arrow

    // Ensure the arrow is visually on top of its immediate siblings within the link
    arrow.style.zIndex = '10001'; // Even higher than the parent link itself

    // Prepend the arrow to the targetAnchor
    targetAnchor.prepend(arrow);
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

    removeExistingArrows(); // Always remove existing before injecting new

    currentSelectedIndex = newIndex;
    const targetLink = allResultLinks[currentSelectedIndex];

    if (targetLink) {
        injectArrow(targetLink);

        const linkRect = targetLink.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const currentScrollY = window.scrollY;

        // Special handling for the first link
        if (currentSelectedIndex === 0) {
            if (currentScrollY > 0) {
                window.scrollTo({ top: 0, behavior: 'auto' });
            }
        } else {
            // General scrolling for other links
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
                    window.scrollTo({ top: scrollToY, behavior: 'auto' });
                }
            }
        }
    } else {
        // If targetLink is somehow null/undefined (e.g., after a filter or DOM change),
        // re-initialize to try and find links and select the first one.
        initializeExtension();
    }
}

function handleKeyDown(event) {
    if (!webNavigatorEnabledState) return;

    // Check if the event target is an input field, textarea, or contenteditable element.
    const tagName = event.target.tagName;
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || event.target.isContentEditable) {
        // Allow normal typing for relevant keys unless Ctrl/Alt is pressed
        if (!event.ctrlKey && !event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
            return;
        }
        // If Ctrl/Alt IS pressed with one of these keys, then we might want to intervene.
        // For now, if it's an input and not one of our navigation keys, let it pass.
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
        case 'Enter':
        case ' ': // Handle space bar for activation
            // Prevent default only if we are taking action
            if (currentSelectedIndex !== -1 && allResultLinks[currentSelectedIndex]) {
                event.preventDefault();
                const selectedLink = allResultLinks[currentSelectedIndex];
                if (event.ctrlKey) {
                    window.open(selectedLink.href, '_blank');
                } else {
                    selectedLink.click();
                }
            } else if (event.key === ' ') {
                // If no link selected and space pressed, allow default space behavior (e.g., scroll page)
                return;
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

        let newIndex = 0; // Default to selecting the first link
        if (currentSelectedIndex !== -1 && oldResultLinks[currentSelectedIndex]) {
            const previouslySelectedLink = oldResultLinks[currentSelectedIndex];
            const foundIndexInNewList = newLinks.indexOf(previouslySelectedLink);
            if (foundIndexInNewList !== -1) {
                newIndex = foundIndexInNewList;
            } else {
                // Try to find by href if the DOM element itself changed
                const sameHrefLinkIndex = newLinks.findIndex(link => link.href === previouslySelectedLink.href);
                if (sameHrefLinkIndex !== -1) {
                    newIndex = sameHrefLinkIndex;
                }
            }
        }
        updateArrowPosition(newIndex);
    } else if (allResultLinks.length > 0 && (currentSelectedIndex === -1 || !allResultLinks[currentSelectedIndex]?.querySelector('.extension-arrow'))) {
        // If links didn't change but arrow is missing (e.g., page re-render without full DOM reset)
        updateArrowPosition(currentSelectedIndex === -1 ? 0 : currentSelectedIndex);
    }
}

// Function to attach all event listeners and observer
function attachContentScriptListeners() {
    if (isExtensionInitialized) return;

    // Detach any pre-existing listeners to prevent duplicates
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
                    // Check if nodes were added/removed from relevant search sections
                    const hasRelevantNode = (nodes) => Array.from(nodes).some(node =>
                        node.nodeType === Node.ELEMENT_NODE && (
                            node.id === 'search' || node.closest('#search') ||
                            node.matches('div.g, div.tF2Cxc, div.yuRUbf, div.rc, div.srg, div.X5OiLe, div.qv3Wpe, div.jtfGm, div.Ww4FFb')
                        )
                    );
                    if (hasRelevantNode(mutation.addedNodes) || hasRelevantNode(mutation.removedNodes)) {
                        relevantChangeDetected = true;
                        break;
                    }
                } else if (mutation.type === 'attributes' && mutation.target.tagName === 'A' && mutation.attributeName === 'href') {
                    // Also consider changes to href attributes on links as relevant
                    if (mutation.target.closest('#search')) {
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
            mutationObserverInstance.observe(googleSearchContainer, { childList: true, subtree: true, attributes: true });
        } else {
            mutationObserverInstance.observe(document.body, { childList: true, subtree: true, attributes: true });
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
    // Only proceed if runtime is valid (extension is still active)
    if (chrome.runtime && chrome.runtime.id) {
        webNavigatorEnabledState = await getWebNavigatorSetting();
    } else {
        console.warn("Extension runtime is invalidated during initializeExtension. Assuming webNavigatorEnabledState is true.");
        webNavigatorEnabledState = true;
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
        if (chrome.runtime && chrome.runtime.id) {
            webNavigatorEnabledState = changes.webNavigatorEnabled.newValue;
            initializeExtension();
        }
        // No else block here, as it's typically fine if context is invalidated
        // just means the content script won't react immediately, but will on next load.
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
