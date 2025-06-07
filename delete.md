help me fix an issue in my chrome extention. Basically i have an arrow cursor which goes through the google search
results. Right now the cursor ruins the indentation of the said link and makes phisical room for itself in the DOM.
I dont wanna it to do that , the positoin im ok with it but i want it to be to the left but not ruin the identation.
Plus please remove all the animation effects related to the cursor, i want it to be fast , no ease in animations if there are any.
When you giving me the solution , tell men which file and give me the full code , top to bottom to simply copy and paste.

Also, i will give you the entire code base in two sessions, so wait and dont answer to this message and then i will give you
the last batch of code and then propose a solution:

//Code base:


# Project File Paths

- `WebNavigator.js`
- `background.js`
- `manifest.json`
- `popup.css`
- `popup.html`
- `popup.js`
## File: `WebNavigator.js`

```javascript
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

```

## File: `background.js`

```javascript
// background.js

// Function to handle focusing an existing tab or creating/updating a new one
// It now takes a targetUrl for matching, a newTabUrl for opening/updating,
// and an optional exactMatch boolean for precise URL matching.
async function focusOrCreateTab(targetUrl, newTabUrl, exactMatch = false) {
  // 1. Try to find an existing tab based on the matching criteria.
  // If exactMatch is true, query for the exact targetUrl.
  // Otherwise, use a wildcard (*) to match URLs that start with the targetUrl.
  const queryOptions = exactMatch
    ? { url: targetUrl }
    : { url: `${targetUrl}*` };
  const existingTabs = await chrome.tabs.query(queryOptions);

  if (existingTabs.length > 0) {
    // If one or more tabs are found, pick the first one.
    const targetTab = existingTabs[0];
    // Focus its window and then activate the tab.
    await chrome.windows.update(targetTab.windowId, { focused: true });
    await chrome.tabs.update(targetTab.id, { active: true });
  } else {
    // 2. If no existing tab matching the criteria is found,
    //    check the current active tab to see if it's empty.
    const [currentTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    // Define what constitutes an "empty" tab.
    // Common empty tab URLs are 'chrome://newtab/' and 'about:blank'.
    const isEmptyTab =
      currentTab &&
      (currentTab.url === "chrome://newtab/" ||
        currentTab.url === "about:blank");

    if (isEmptyTab) {
      // If the current tab is empty, update its URL to the newTabUrl.
      // This effectively reuses the empty tab.
      await chrome.tabs.update(currentTab.id, { url: newTabUrl });
    } else {
      // If the current tab is not empty, create a brand new tab with the newTabUrl.
      // This preserves the content of the current non-empty tab.
      await chrome.tabs.create({ url: newTabUrl });
    }
  }
}

// Function to move the current tab to a specific position (0-indexed)
async function moveCurrentTabToPosition(index) {
  const [currentTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (currentTab) {
    // Check if the target index is valid within the current window's tab count
    const tabsInWindow = await chrome.tabs.query({ windowId: currentTab.windowId });
    const maxIndex = tabsInWindow.length - 1;

    // Ensure index is not negative and not beyond the last position (unless it's the current tab, which can move freely)
    // The Chrome tabs.move API handles out-of-bounds indices by placing at the end/beginning.
    // However, explicitly limiting helps with user expectations (e.g., cannot move to 10th place if only 5 tabs exist unless allowed)
    const effectiveIndex = Math.max(0, Math.min(index, maxIndex + 1)); // Allows moving past the last tab to the end

    chrome.tabs.move(currentTab.id, { index: effectiveIndex });
  }
}

async function openNewEmptyTab() {
  await chrome.tabs.create({ url: "chrome://newtab/" });
}

// Function to cycle through tabs currently playing audio (audible)
async function cycleAudibleTabs() {
    const audibleTabs = await chrome.tabs.query({ audible: true });

    if (audibleTabs.length === 0) {
        return;
    }

    audibleTabs.sort((a, b) => {
        if (a.windowId !== b.windowId) {
            return a.windowId - b.windowId;
        }
        return a.index - b.index;
    });

    const { lastAudibleTabId } = await chrome.storage.local.get({ lastAudibleTabId: null });

    let nextTabIndex = -1;

    if (lastAudibleTabId !== null) {
        const lastTabIndex = audibleTabs.findIndex(tab => tab.id === lastAudibleTabId);
        if (lastTabIndex !== -1) {
            nextTabIndex = (lastTabIndex + 1) % audibleTabs.length;
        }
    }

    if (nextTabIndex === -1) {
        nextTabIndex = 0;
    }

    const targetTab = audibleTabs[nextTabIndex];

    if (targetTab) {
        await chrome.windows.update(targetTab.windowId, { focused: true });
        await chrome.tabs.update(targetTab.id, { active: true });
        await chrome.storage.local.set({ lastAudibleTabId: targetTab.id });
    }
}

async function cycleYoutubeTabs() {
    const allTabs = await chrome.tabs.query({});

    const youtubeTabs = allTabs.filter(tab => {
        // Filter for tabs whose URL starts with the YouTube domain
        return tab.url && (tab.url.startsWith("https://www.youtube.com/") || tab.url.startsWith("http://www.youtube.com/"));
    });

    if (youtubeTabs.length === 0) {
        return;
    }

    youtubeTabs.sort((a, b) => {
        if (a.windowId !== b.windowId) {
            return a.windowId - b.windowId;
        }
        return a.index - b.index;
    });

    // Use a separate storage key for this command's cycle state
    const { lastYoutubeTabId } = await chrome.storage.local.get({ lastYoutubeTabId: null });

    let nextTabIndex = -1;

    if (lastYoutubeTabId !== null) {
        const lastTabIndex = youtubeTabs.findIndex(tab => tab.id === lastYoutubeTabId);
        if (lastTabIndex !== -1) {
            nextTabIndex = (lastTabIndex + 1) % youtubeTabs.length;
        }
    }

    if (nextTabIndex === -1) {
        nextTabIndex = 0;
    }

    const targetTab = youtubeTabs[nextTabIndex];

    if (targetTab) {
        await chrome.windows.update(targetTab.windowId, { focused: true });
        await chrome.tabs.update(targetTab.id, { active: true });
        await chrome.storage.local.set({ lastYoutubeTabId: targetTab.id });
    }
}


// Listen for commands defined in manifest.json
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "whatsapp_tab") {
    focusOrCreateTab("https://web.whatsapp.com/", "https://web.whatsapp.com/");
  } else if (command === "gemini_tab") {
    focusOrCreateTab(
      "https://gemini.google.com/app",
      "https://gemini.google.com/app",
    );
  } else if (command === "chatgpt_tab") {
    focusOrCreateTab("https://chatgpt.com/", "https://chatgpt.com/");
  } else if (command === "youtube_homepage_tab") {
    focusOrCreateTab(
      "https://www.youtube.com/",
      "https://www.youtube.com/",
      true, // Set exactMatch to true for this command
    );
  } else if (command === "move_tab_to_first") {
    await moveCurrentTabToPosition(0);
  } else if (command === "move_tab_to_second") {
    await moveCurrentTabToPosition(1);
  } else if (command === "move_tab_to_third") {
    await moveCurrentTabToPosition(2);
  } else if (command === "move_tab_to_fourth") {
    await moveCurrentTabToPosition(3);
  } else if (command === "open_new_empty_tab") { 
    await openNewEmptyTab();
  } else if (command === "cycle_audible_tabs") {
        await cycleAudibleTabs();
    }  else if (command === "cycle_youtube_tabs") { 
        await cycleYoutubeTabs();
    }
});

```

## File: `manifest.json`

```json
{
	"manifest_version": 3,
	"name": "Fuzzy Tab & Search Navigator",
	"version": "1.8",
	"description": "Quickly switch between Chrome tabs using fuzzy search",
	"permissions": [
		"tabs",
		"scripting",
		"storage"
	],
	"host_permissions": [
		"*://www.google.com/search?*"
	],
	"action": {
		"default_popup": "popup.html",
		"default_icon": {
			"16": "icon.png"
		}
	},
	"icons": {
		"16": "icon.png"
	},
	"commands": {
		"_execute_action": {
			"suggested_key": {
				"default": "Alt+A"
			},
			"description": "Open Fuzzy Tab Switcher"
		},
		"whatsapp_tab": {
			"description": "WhatsApp tab"
		},
		"chatgpt_tab": {
			"description": "ChatGPT tab"
		},
		"youtube_homepage_tab": {
			"description": "YouTube homepage tab"
		},
		"gemini_tab": {
			"description": "Gemini tab"
		},
		"move_tab_to_first": {
			"description": "Move tab to 1st place"
		},
		"move_tab_to_second": {
			"description": "Move tab to 2nd place"
		},
		"move_tab_to_third": {
			"description": "Move tab to 3rd place"
		},
		"move_tab_to_fourth": {
			"description": "Move tab to 4th place"
		},
		"open_new_empty_tab": {
			"description": "New empty tab"
		},
		"cycle_audible_tabs": {
			"description": "Cycle tabs playing audio"
		},
		"cycle_youtube_tabs": {
			"description": "Cycle YouTube tabs"
		}
	},
	"browser_specific_settings": {
		"gecko": {
			"id": "fuzzy-tab-switcher@SergiuNani.private",
			"strict_min_version": "109.0"
		}
	},
	"background": {
		"service_worker": "background.js"
	},
	"content_scripts": [
		{
			"matches": [
				"*://www.google.com/search?*"
			],
			"js": [
				"WebNavigator.js"
			],
			"css": [
				"popup.css"
			],
			"run_at": "document_idle"
		}
	]
}

```

## File: `popup.css`

```css
body {
	font-family: "Inter", sans-serif;
	width: 750px;
	/* Adjust width as needed */
	margin: 0;
	padding: 0;
	background-color: #282c34;
	border-radius: 8px;
	overflow: hidden;
	color: #e0e0e0;
}

.container {
	padding: 15px;
}

/* NEW: Style for search input and counter wrapper */
.search-area {
    display: flex;
    align-items: center;
    margin-bottom: 10px; /* Space between search area and tab list */
    gap: 10px; /* Space between input and counter */
}

#searchInput {
	flex-grow: 1; /* Allow search input to take available space */
	padding: 10px;
	border: 1px solid #444;
	/* Darker border */
	border-radius: 6px;
	font-size: 16px;
	box-sizing: border-box;
	outline: none;
	background-color: #3b4048;
	/* Dark background for input */
	color: #e0e0e0;
	/* Light text for input */
}

#searchInput::placeholder {
	color: #a0a0a0;
	/* Lighter placeholder text */
}

#searchInput:focus {
	border-color: #61afef;
	/* A pleasing blue for focus */
}

/* NEW: Style for the tab counter */
.tab-counter {
    padding: 5px 10px;
    background-color: #61afef; /* Blue background */
    color: #282c34; /* Dark text */
    border-radius: 5px;
    font-weight: bold;
    font-size: 0.9em;
    flex-shrink: 0; /* Prevent counter from shrinking */
}

#tabList {
	list-style: none;
	padding: 0;
	margin: 0;
	max-height: 8000px;
	/* Limit height for scrollability */
	overflow-y: auto;
	background-color: #21252b;
	/* Even darker background for the list */
	border-radius: 6px;
	border: 1px solid #333;
	/* Darker border for the list */
	box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
	/* More pronounced shadow */
}

#tabList li {
	padding: 10px 15px;
	cursor: pointer;
	border-bottom: 1px solid #2c313a;
	/* Darker separator */
	display: flex;
	align-items: center;
	border-radius: 4px;
}

#tabList li:last-child {
	border-bottom: none;
}

#tabList li:hover,
#tabList li.selected {
	background-color: #3a4049;
	/* Darker hover/selection color */
	color: #f8f8f8;
	/* Very light text on hover/selection */
}

#tabList li .favicon {
	width: 16px;
	height: 16px;
	margin-right: 10px;
	flex-shrink: 0;
}

#tabList li .tab-title {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	flex-grow: 1;
	color: #e0e0e0;
	/* Ensure title is light */
}

#tabList li .tab-url {
	font-size: 0.8em;
	color: #8a8a8a;
	/* Slightly desaturated light grey for URL */
	margin-left: 10px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	max-width: 150px;
}

/* NEW: Highlight styling for search matches */
.highlight {
	background-color: #ffd580;
	color: #1a1a1a;
	padding: 1px 2px;
	border-radius: 2px;
}

/* Scrollbar styling for dark mode */
#tabList::-webkit-scrollbar {
	width: 8px;
}

#tabList::-webkit-scrollbar-track {
	background: #2c313a;
	/* Darker scrollbar track */
	border-radius: 4px;
}

#tabList::-webkit-scrollbar-thumb {
	background: #555;
	/* Darker scrollbar thumb */
	border-radius: 4px;
}

#tabList::-webkit-scrollbar-thumb:hover {
	background: #61afef;
	/* Blue on hover for scrollbar */
}

/* Styles for the extension-arrow on search results pages */
.extension-arrow {
  display: inline-block;
  margin-right: 8px; /* Small margin to separate arrow from text */
  font-size: 1.2em;
  font-weight: bold;
  color: #FFA500; /* Orange color */
  vertical-align: 6px; /* Adjusts vertical position downwards by 3 pixels */
  pointer-events: none; /* Ensure it doesn't interfere with link clicks */
  flex-shrink: 0; /* Prevent arrow from shrinking on small screens */
}

/* Styles for the options section */
.options-container {
    margin-top: 15px;
    padding: 15px;
    background-color: #363a42; /* Slightly different background for options */
    border-radius: 8px;
    border: 1px solid #444;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2); /* Inset shadow */
}

.options-container h2 {
    color: #61afef; /* Blue heading */
    margin-top: 0;
    margin-bottom: 15px;
    font-size: 1.1em;
    border-bottom: 1px solid #444;
    padding-bottom: 10px;
}

.option-item {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
}

.option-item input[type="checkbox"] {
    margin-right: 10px;
    width: 18px;
    height: 18px;
    accent-color: #98c379; /* Green accent color */
    cursor: pointer;
}

.option-item label {
    font-size: 0.95em;
    color: #e0e0e0;
    cursor: pointer;
}

.settings-hint {
    font-size: 0.8em;
    color: #888;
    text-align: right;
    margin-top: 15px;
}

/* Utility class to hide elements */
.hidden {
    display: none !important;
}

```

## File: `popup.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fuzzy Tab Switcher</title>
    <link rel="stylesheet" href="popup.css">
</head>
<body>
    <div class="container">
        <div class="search-area"> <!-- NEW: Wrapper for search input and counter -->
            <input type="text" id="searchInput" placeholder="Search tabs..." autofocus>
            <span id="tabCounter" class="tab-counter"></span> <!-- NEW: Tab Counter -->
        </div>
        <ul id="tabList"></ul>

        <!-- Options Section -->
        <div id="optionsSection" class="options-container hidden">
            <h2>Extension Options</h2>
            <div class="option-item">
                <input type="checkbox" id="enableWebNavigator">
                <label for="enableWebNavigator">Enable Web Search Navigator</label>
            </div>
            <div class="option-item">
                <input type="checkbox" id="searchOnNoResults">
                <label for="searchOnNoResults">Search on Enter if no results</label>
            </div>
            <p class="settings-hint">Press F1 again to hide options.</p>
        </div>
    </div>
    <script src="popup.js"></script>
</body>
</html>

```

## File: `popup.js`

```javascript
document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("searchInput");
    const tabList = document.getElementById("tabList");
    const tabCounter = document.getElementById("tabCounter"); // NEW
    const optionsSection = document.getElementById("optionsSection");
    const enableWebNavigatorCheckbox = document.getElementById("enableWebNavigator");
    const searchOnNoResultsCheckbox = document.getElementById("searchOnNoResults");

    let allTabs = [];
    let filteredTabs = [];
    let selectedIndex = -1; // Index of the currently selected tab in the filtered list
    let currentQuery = ""; // Declare a variable to hold the current search query

    // Default settings
    const defaultSettings = {
        webNavigatorEnabled: true, // Default enabled
        searchOnNoResults: true // Default enabled
    };
    let currentSettings = {}; // Will hold loaded settings

    // Function to load settings
    const loadSettings = async () => {
        const storedSettings = await chrome.storage.local.get(defaultSettings);
        currentSettings = { ...defaultSettings, ...storedSettings }; // Merge with defaults
        enableWebNavigatorCheckbox.checked = currentSettings.webNavigatorEnabled;
        searchOnNoResultsCheckbox.checked = currentSettings.searchOnNoResults;
    };

    // Function to save settings
    const saveSettings = async () => {
        currentSettings.webNavigatorEnabled = enableWebNavigatorCheckbox.checked;
        currentSettings.searchOnNoResults = searchOnNoResultsCheckbox.checked;
        await chrome.storage.local.set(currentSettings);
    };

    // Helper function to highlight matching parts of the text
    const highlightText = (text, query) => {
        if (!text || !query) {
            return text;
        }

        let highlightedHtml = text;
        const lowerCaseQuery = query.toLowerCase();
        // Split the query into words and filter out any empty strings
        const queryWords = lowerCaseQuery.split(" ").filter(Boolean);

        queryWords.forEach((word) => {
            // Escape special characters in the word for use in RegExp
            const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            // Create a global, case-insensitive regular expression for each word
            const regex = new RegExp(`(${escapedWord})`, "gi");
            // Replace matches with a span tag
            highlightedHtml = highlightedHtml.replace(
                regex,
                (match) => `<span class="highlight">${match}</span>`,
            );
        });

        return highlightedHtml;
    };

    // Function to fetch and display tabs
    const fetchAndDisplayTabs = (preferredIndex = 0) => {
        chrome.tabs.query({}, (tabs) => {
            allTabs = tabs;
            filteredTabs = fuzzySearch(currentQuery, allTabs); // Re-apply filter on new data
            renderTabs(filteredTabs, preferredIndex); // Pass the preferred index
            searchInput.focus(); // Focus the search input when popup opens
        });
    };

    // Function to render tabs in the list
    const renderTabs = (tabsToRender, suggestedIndex = 0) => {
        tabList.innerHTML = ""; // Clear previous list
        // Update the tab counter
        tabCounter.textContent = `${tabsToRender.length} tabs`; // NEW

        if (tabsToRender.length === 0) {
            const noResults = document.createElement("li");
            noResults.textContent = "No matching tabs found.";
            noResults.style.textAlign = "center";
            noResults.style.color = "#888";
            noResults.style.padding = "10px";
            tabList.appendChild(noResults);
            selectedIndex = -1;
            return;
        }

        tabsToRender.forEach((tab, index) => {
            const listItem = document.createElement("li");
            listItem.dataset.tabId = tab.id;
            listItem.dataset.windowId = tab.windowId;
            listItem.dataset.index = index;

            // Add favicon
            if (tab.favIconUrl) {
                const favicon = document.createElement("img");
                favicon.src = tab.favIconUrl;
                favicon.alt = "favicon";
                favicon.classList.add("favicon");
                listItem.appendChild(favicon);
            } else {
                // Placeholder for missing favicon
                const placeholder = document.createElement("span");
                placeholder.classList.add("favicon");
                placeholder.textContent = "📄";
                listItem.appendChild(placeholder);
            }

            // Add title with highlighting
            const titleSpan = document.createElement("span");
            titleSpan.classList.add("tab-title");
            titleSpan.innerHTML = highlightText(tab.title || "", currentQuery);
            listItem.appendChild(titleSpan);

            // Add URL with highlighting
            const urlSpan = document.createElement("span");
            urlSpan.classList.add("tab-url");
            urlSpan.innerHTML = highlightText(tab.url || "", currentQuery);
            listItem.appendChild(urlSpan);

            listItem.addEventListener("click", () => {
                switchTab(tab.id, tab.windowId);
            });

            tabList.appendChild(listItem);
        });

        // Set selectedIndex based on suggestedIndex, with bounds checking
        selectedIndex = Math.min(suggestedIndex, tabsToRender.length - 1);
        selectedIndex = Math.max(-1, selectedIndex);

        // Highlight the item if a valid index is selected
        if (selectedIndex !== -1) {
            highlightSelectedItem();
        }
    };

    // Fuzzy search function - MODIFIED FOR PRIORITY
    const fuzzySearch = (query, tabs) => {
        if (!query) {
            return tabs; // If no query, return all tabs without sorting
        }

        const lowerCaseQuery = query.toLowerCase();
        const queryWords = lowerCaseQuery.split(" ").filter(Boolean);

        const titleMatches = [];
        const urlMatches = [];
        const processedTabIds = new Set(); // To avoid duplicates

        tabs.forEach((tab) => {
            const tabTitle = (tab.title || "").toLowerCase();
            const tabUrl = (tab.url || "").toLowerCase();

            // Check if all query words are in the title
            const matchesTitle = queryWords.every((word) => tabTitle.includes(word));
            // Check if all query words are in the URL
            const matchesUrl = queryWords.every((word) => tabUrl.includes(word));

            if (matchesTitle) {
                titleMatches.push(tab);
                processedTabIds.add(tab.id); // Mark this tab ID as processed for title match
            } else if (matchesUrl && !processedTabIds.has(tab.id)) {
                // If it didn't match the title, but matches the URL, and hasn't been added yet
                urlMatches.push(tab);
                processedTabIds.add(tab.id); // Mark this tab ID as processed for URL match
            }
        });

        // Combine results: title matches first, then URL matches
        return [...titleMatches, ...urlMatches];
    };

    // Handle search input
    searchInput.addEventListener("input", () => {
        currentQuery = searchInput.value.trim(); // Update the current query
        filteredTabs = fuzzySearch(currentQuery, allTabs);
        renderTabs(filteredTabs); // Render, starting from index 0 by default
    });

    // Highlight selected item
    const highlightSelectedItem = () => {
        const items = tabList.querySelectorAll("li");
        items.forEach((item, index) => {
            if (index === selectedIndex) {
                item.classList.add("selected");
                // Scroll the selected item into view if it's not already
                item.scrollIntoView({ block: "nearest", behavior: "auto" });
            } else {
                item.classList.remove("selected");
            }
        });
    };

    // Function to switch to a tab and close the popup
    const switchTab = (tabId, targetWindowId) => {
        chrome.windows.getCurrent((currentWindow) => {
            if (currentWindow.id === targetWindowId) {
                // If the target tab is in the current window, just activate the tab
                chrome.tabs.update(tabId, { active: true }, () => {
                    window.close(); // Close the popup
                });
            } else {
                // If the target tab is in a different window, first focus that window, then activate the tab
                chrome.windows.update(targetWindowId, { focused: true }, () => {
                    chrome.tabs.update(tabId, { active: true }, () => {
                        window.close(); // Close the popup
                    });
                });
            }
        });
    };

    // Function to delete the selected tab
    const deleteSelectedTab = async () => {
        if (selectedIndex !== -1 && filteredTabs[selectedIndex]) {
            const tabToDelete = filteredTabs[selectedIndex];
            const oldSelectedIndex = selectedIndex; // Store current index before deletion

            await chrome.tabs.remove(tabToDelete.id);

            // After deletion, re-fetch and display tabs to update the list
            // and recalculate the new selected index.
            chrome.tabs.query({}, (tabs) => {
                allTabs = tabs;
                filteredTabs = fuzzySearch(currentQuery, allTabs);

                let newSelectedIndex = -1;
                if (filteredTabs.length === 0) {
                    newSelectedIndex = -1; // No tabs left to select
                } else if (oldSelectedIndex < filteredTabs.length) {
                    // If there's still an item at the old index, select it (this covers non-last deletions)
                    newSelectedIndex = oldSelectedIndex;
                } else {
                    // If oldIndex was past the new length (i.e., the last item was deleted or items before it),
                    // select the new last item if the list is not empty.
                    newSelectedIndex = filteredTabs.length - 1;
                }
                newSelectedIndex = Math.max(-1, newSelectedIndex); // Ensure it's not negative unless list is empty.

                renderTabs(filteredTabs, newSelectedIndex); // Pass the new desired index
                searchInput.focus();
            });
        }
    };

    // Function to delete all filtered tabs
    const deleteAllFilteredTabs = async () => {
        if (filteredTabs.length > 0) {
            const tabIdsToDelete = filteredTabs.map(tab => tab.id);
            await chrome.tabs.remove(tabIdsToDelete);
            // After deletion, re-fetch and display tabs to update the list
            chrome.tabs.query({}, (tabs) => {
                allTabs = tabs;
                filteredTabs = fuzzySearch(currentQuery, allTabs);
                if (filteredTabs.length === 0) {
                    renderTabs(filteredTabs, -1); // No tabs left, no selection
                } else {
                    // If there are still tabs, default to the first one for mass delete.
                    renderTabs(filteredTabs, 0);
                }
                searchInput.focus();
            });
        }
    };

    // Toggle options section visibility
    document.addEventListener("keydown", (e) => {
        if (e.key === "F1") {
            e.preventDefault(); // Prevent default F1 behavior (e.g., opening help)
            optionsSection.classList.toggle("hidden");
            // If options are shown, hide search area and tab list, otherwise show them
            if (!optionsSection.classList.contains("hidden")) {
                document.querySelector('.search-area').classList.add('hidden'); // NEW: Hide search area wrapper
                tabList.classList.add("hidden");
            } else {
                document.querySelector('.search-area').classList.remove('hidden'); // NEW: Show search area wrapper
                tabList.classList.remove("hidden");
                searchInput.focus(); // Focus search input when tab list is visible
            }
        }
    });

    // Event listeners for checkboxes
    enableWebNavigatorCheckbox.addEventListener("change", saveSettings);
    searchOnNoResultsCheckbox.addEventListener("change", saveSettings);

    // Handle keyboard navigation including new delete commands
    searchInput.addEventListener("keydown", (e) => {
        // Only process search input keydowns if options section is hidden
        if (!optionsSection.classList.contains("hidden")) {
            return; // Do nothing if options are visible
        }

        const items = tabList.querySelectorAll("li");

        if (e.key === "ArrowDown" || (e.altKey && e.key === "j")) {
            e.preventDefault(); // Prevent cursor movement in input
            if (items.length > 0) { // Only navigate if there are items
                selectedIndex = (selectedIndex + 1) % items.length;
                highlightSelectedItem();
            }
        } else if (e.key === "ArrowUp" || (e.altKey && e.key === "k")) {
            e.preventDefault(); // Prevent cursor movement in input
            if (items.length > 0) { // Only navigate if there are items
                selectedIndex = (selectedIndex - 1 + items.length) % items.length;
                highlightSelectedItem();
            }
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (selectedIndex !== -1 && filteredTabs[selectedIndex]) {
                // If a tab is selected, switch to it
                const selectedTab = filteredTabs[selectedIndex];
                switchTab(selectedTab.id, selectedTab.windowId);
            } else if (currentQuery.length > 0 && filteredTabs.length === 0) {
                // Check setting for "Search on Enter if no results"
                if (currentSettings.searchOnNoResults) {
                    // If no tabs are found and a query is typed, open a Google search
                    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(currentQuery)}`;
                    chrome.tabs.create({ url: googleSearchUrl }, () => {
                        window.close(); // Close the popup after opening the search tab
                    });
                }
            } else {
                // If no search results and no query, or simply no selection,
                // and Enter is pressed, close the popup (default behavior if no action)
                window.close();
            }
        } else if (e.ctrlKey && e.key === "d") { // Ctrl+D for deleting selected tab
            e.preventDefault();
            deleteSelectedTab();
        } else if (e.ctrlKey && e.shiftKey && e.key === "D") { // Ctrl+Shift+D for deleting all filtered tabs (e.key will be 'D' for Shift+d)
            e.preventDefault();
            deleteAllFilteredTabs();
        }
    });

    // Initial fetch and display of tabs + load settings
    loadSettings().then(() => {
        fetchAndDisplayTabs();
    });
});

```

