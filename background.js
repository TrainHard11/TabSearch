// background.js

// Store the history of active tabs (last two active active tab IDs)
// This will be an array like [previousTabId, currentTabId]
let lastActiveTabs = []; // Stores [tabId, windowId] for the last two unique active tabs
const LAST_ACTIVE_TABS_STORAGE_KEY = "fuzzyTabSearch_lastActiveTabs";

// Function to update last active tabs in storage
async function updateLastActiveTabsStorage() {
  await chrome.storage.local.set({
    [LAST_ACTIVE_TABS_STORAGE_KEY]: lastActiveTabs,
  });
}

// Function to load last active tabs from storage on startup
async function loadLastActiveTabsFromStorage() {
  const result = await chrome.storage.local.get({
    [LAST_ACTIVE_TABS_STORAGE_KEY]: [],
  });
  lastActiveTabs = result[LAST_ACTIVE_TABS_STORAGE_KEY];
  // Ensure the loaded data is in the correct format or clear if invalid
  if (
    !Array.isArray(lastActiveTabs) ||
    lastActiveTabs.some((item) => !Array.isArray(item) || item.length !== 2)
  ) {
    lastActiveTabs = []; // Clear if data is malformed
  }
}

// Call this on service worker startup
loadLastActiveTabsFromStorage();

// Listener for tab activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const currentTabId = activeInfo.tabId;
  const currentWindowId = activeInfo.windowId;

  // Retrieve the current active tab's full info to check if it's a valid tab (not pre-rendered, etc.)
  try {
    const currentTab = await chrome.tabs.get(currentTabId);

    // Filter out tabs that are not "real" or user-navigable, like about:blank in some contexts, or devtools.
    // We mainly care about user-interacted tabs.
    const isSpecialUrl =
      currentTab.url.startsWith("chrome://") ||
      currentTab.url.startsWith("about:");

    // If the tab ID and window ID are already the very last recorded, do nothing
    if (
      lastActiveTabs.length > 0 &&
      lastActiveTabs[lastActiveTabs.length - 1] &&
      lastActiveTabs[lastActiveTabs.length - 1][0] === currentTabId &&
      lastActiveTabs[lastActiveTabs.length - 1][1] === currentWindowId
    ) {
      return;
    }

    // Filter out invalid/special URLs from being recorded as "previous" tabs for toggling
    // We allow `chrome://newtab` only if it's the current tab, not as a history item for toggle
    if (
      currentTab.url === "about:blank" ||
      (currentTab.url.startsWith("chrome://") &&
        currentTab.url !== "chrome://newtab/")
    ) {
      return; // Do not record these as valid "previous" tabs to toggle back to
    }

    // Logic to maintain only the last two unique tab IDs and window IDs
    const newEntry = [currentTabId, currentWindowId];

    // If the new active tab is the same as the previous one, don't add it again
    if (
      lastActiveTabs.length > 0 &&
      lastActiveTabs[lastActiveTabs.length - 1][0] === newEntry[0] &&
      lastActiveTabs[lastActiveTabs.length - 1][1] === newEntry[1]
    ) {
      return;
    }

    // Remove the current tab from the list if it exists elsewhere (handles re-activating an older tab)
    lastActiveTabs = lastActiveTabs.filter(
      ([tabId, windowId]) =>
        !(tabId === newEntry[0] && windowId === newEntry[1]),
    );

    // Add the new active tab to the end
    lastActiveTabs.push(newEntry);

    // Keep only the last two unique tab activations
    if (lastActiveTabs.length > 2) {
      lastActiveTabs.shift(); // Remove the oldest entry
    }

    // Persist to storage
    await updateLastActiveTabsStorage();
  } catch (error) {
    // This can happen if a tab is quickly activated and then closed, or if it's a special internal tab.
    // console.warn("Error getting tab info on activation:", error);
  }
});

// Listener for tab removal (to clean up lastActiveTabs)
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  lastActiveTabs = lastActiveTabs.filter(
    ([storedTabId, storedWindowId]) => storedTabId !== tabId,
  );
  await updateLastActiveTabsStorage();
});

// Listener for window focus changes (important for cross-window toggling)
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    return; // No window focused
  }
  try {
    const window = await chrome.windows.get(windowId, { populate: true });
    const activeTabInWindow = window.tabs.find((tab) => tab.active);
    if (activeTabInWindow) {
      // Manually trigger the onActivated logic for the active tab in the newly focused window
      chrome.tabs.onActivated.dispatch({
        tabId: activeTabInWindow.id,
        windowId: activeTabInWindow.windowId,
      });
    }
  } catch (error) {
    console.warn("Error processing window focus change:", error);
  }
});

/**
 * Toggles between the current active tab and the previously active tab.
 * Uses the stored `lastActiveTabs` array.
 */
async function toggleLastTab() {
  try {
    if (lastActiveTabs.length < 2) {
      console.log("Not enough history to toggle (less than 2 tabs recorded).");
      return { success: false, error: "Not enough tab history." };
    }

    const [currentActiveTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!currentActiveTab) {
      console.warn("No current active tab found to toggle from.");
      return { success: false, error: "No current active tab." };
    }

    // The last entry in lastActiveTabs should be the current active tab.
    // The second to last entry is the one we want to toggle back to.
    const [previousTabId, previousWindowId] = lastActiveTabs[0]; // This is the 'older' tab in the list

    // If the current active tab is already the one we want to go back to,
    // then the "previous" tab is actually the *newest* one in the history list.
    // This handles the case where you hit the shortcut twice quickly.
    let targetTabId;
    let targetWindowId;

    if (
      currentActiveTab.id === lastActiveTabs[lastActiveTabs.length - 1][0] &&
      currentActiveTab.windowId === lastActiveTabs[lastActiveTabs.length - 1][1]
    ) {
      // Current tab is the most recent one in history, so toggle to the second most recent
      targetTabId = lastActiveTabs[0][0];
      targetWindowId = lastActiveTabs[0][1];
    } else {
      // Current tab is not the most recent one in history (e.g. user manually switched outside our tracking)
      // In this case, we need to activate the one that was most recently active *before* the current one.
      // This scenario is largely covered by the onActivated listener, which keeps the lastActiveTabs
      // array up-to-date. So, hitting toggle should always attempt to go to the first item in the array.
      targetTabId = lastActiveTabs[0][0];
      targetWindowId = lastActiveTabs[0][1];
    }

    try {
      // Check if the target tab still exists
      const targetTab = await chrome.tabs.get(targetTabId);

      // Check if the target tab is in the current window.
      if (targetTab.windowId === currentActiveTab.windowId) {
        // Same window, just activate the tab
        await chrome.tabs.update(targetTabId, { active: true });
        // Move the target tab to be the last in the history (new current) and the current tab to be the previous
        // This effectively swaps their positions in the array for the next toggle
        lastActiveTabs = [
          [currentActiveTab.id, currentActiveTab.windowId],
          [targetTabId, targetWindowId],
        ];
      } else {
        // Different window, focus the window and then activate the tab
        await chrome.windows.update(targetWindowId, { focused: true });
        await chrome.tabs.update(targetTabId, { active: true });
        // The onActivated listener will handle updating `lastActiveTabs` after the window focus and tab activation.
      }
      await updateLastActiveTabsStorage();
      return { success: true };
    } catch (tabError) {
      console.warn(
        `Target tab ${targetTabId} (Window ${targetWindowId}) no longer exists. Removing from history.`,
      );
      lastActiveTabs = lastActiveTabs.filter(
        ([id, winId]) => id !== targetTabId || winId !== targetWindowId,
      );
      await updateLastActiveTabsStorage();
      // Try to toggle again, might activate the first available valid tab in history
      return toggleLastTab(); // Recursive call, be careful with infinite loops if no valid tabs
    }
  } catch (error) {
    console.error("Error toggling last tab:", error);
    return { success: false, error: error.message };
  }
}

// Function to handle focusing an existing tab or creating/updating a new one
async function focusOrCreateTab(tabUrl, exactMatch = false) {
  // 1. Try to find an existing tab based on the matching criteria.
  const queryOptions = exactMatch ? { url: tabUrl } : { url: `${tabUrl}*` }; // Use wildcard for partial match unless exactMatch is true
  const existingTabs = await chrome.tabs.query(queryOptions);

  if (existingTabs.length > 0) {
    // If one or more tabs are found, pick the first one.
    const targetTab = existingTabs[0];
    // Focus its window and then activate the tab.
    await chrome.windows.update(targetTab.windowId, { focused: true });
    await chrome.tabs.update(targetTab.id, { active: true });
    return targetTab; // Return the tab object
  } else {
    // 2. If no existing tab matching the criteria is found,
    //    check the current active tab to see if it's empty.
    const [currentTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    // Define what constitutes an "empty" tab.
    const isEmptyTab =
      currentTab &&
      (currentTab.url === "chrome://newtab/" ||
        currentTab.url === "about:blank");

    if (isEmptyTab) {
      // If the current tab is empty, update its URL to the new tab URL.
      const updatedTab = await chrome.tabs.update(currentTab.id, {
        url: tabUrl,
      });
      return updatedTab;
    } else {
      // If the current tab is not empty, create a brand new tab with the new tab URL.
      const newTab = await chrome.tabs.create({ url: tabUrl });
      return newTab;
    }
  }
}

/**
 * Moves a given tab to a specific position (0-indexed) in its window.
 * @param {chrome.tabs.Tab} tab The tab object to move.
 * @param {number} targetIndex The 0-indexed position to move the tab to.
 */
async function moveTabToPosition(tab, targetIndex) {
  try {
    if (!tab || typeof tab.id === "undefined") {
      console.warn("background.js: Attempted to move an invalid tab:", tab);
      return;
    }

    let finalIndex = targetIndex;

    // Special handling for -1 index which means 'move to the end' in chrome.tabs.move
    // If targetIndex is NOT -1, we apply bounds checking.
    // If targetIndex IS -1, it's passed directly to chrome.tabs.move.
    if (targetIndex !== -1) {
      const tabsInWindow = await chrome.tabs.query({ windowId: tab.windowId });
      const maxIndex = tabsInWindow.length - 1;
      // Ensure positive targetIndex is within valid bounds (0 to maxIndex + 1 for appending)
      finalIndex = Math.max(0, Math.min(targetIndex, maxIndex + 1));
    }

    await chrome.tabs.move(tab.id, { index: finalIndex });

    // Optionally, focus the tab after moving it
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
  } catch (error) {
    console.error(
      `background.js: Error moving tab ${tab?.id} to position ${targetIndex}:`,
      error,
    );
    throw error; // Re-throw to propagate the error back to the sender
  }
}

/**
 * Handles moving either an existing tab or a new tab (created from a URL)
 * to a specified position.
 * @param {string} itemUrl The URL of the tab/bookmark.
 * @param {boolean} exactMatch Whether to perform an exact URL match when looking for an existing tab.
 * @param {number} targetIndex The 0-indexed position to move the tab to.
 */
async function handleMoveItemToPosition(itemUrl, exactMatch, targetIndex) {
  try {
    // First, try to find and focus/create the tab
    const tabToMove = await focusOrCreateTab(itemUrl, exactMatch);
    if (tabToMove) {
      // Then, move that tab to the desired position
      await moveTabToPosition(tabToMove, targetIndex);
      return { success: true, tab: tabToMove };
    } else {
      return {
        success: false,
        error: "Failed to find or create tab for move operation.",
      };
    }
  } catch (error) {
    console.error(
      `background.js: Error in handleMoveItemToPosition for URL ${itemUrl} to index ${targetIndex}:`,
      error,
    );
    return { success: false, error: error.message };
  }
}

async function openNewEmptyTab() {
  await chrome.tabs.create({ url: "chrome://newtab/" });
}

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

  const { lastAudibleTabId } = await chrome.storage.local.get({
    lastAudibleTabId: null,
  });

  let nextTabIndex = -1;

  if (lastAudibleTabId !== null) {
    const lastTabIndex = audibleTabs.findIndex(
      (tab) => tab.id === lastAudibleTabId,
    );
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

  const youtubeTabs = allTabs.filter((tab) => {
    return (
      tab.url &&
      (tab.url.startsWith("https://www.youtube.com/") ||
        tab.url.startsWith("http://www.youtube.com/"))
    );
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

  const { lastYoutubeTabId } = await chrome.storage.local.get({
    lastYoutubeTabId: null,
  });

  let nextTabIndex = -1;

  if (lastYoutubeTabId !== null) {
    const lastTabIndex = youtubeTabs.findIndex(
      (tab) => tab.id === lastYoutubeTabId,
    );
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

/**
 * Moves the current active tab by a specified offset.
 * @param {number} offset The number of positions to move the tab. Positive for right, negative for left.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
async function moveCurrentTabByOffset(offset) {
  try {
    const [currentTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!currentTab) {
      console.warn("No active tab found to move.");
      return false;
    }

    const tabsInWindow = await chrome.tabs.query({
      windowId: currentTab.windowId,
    });
    const maxIndex = tabsInWindow.length - 1;

    let newIndex = currentTab.index + offset;

    // Ensure the new index is within valid bounds
    newIndex = Math.max(0, Math.min(newIndex, maxIndex));

    // Only move if the index actually changes
    if (newIndex !== currentTab.index) {
      await chrome.tabs.move(currentTab.id, { index: newIndex });
      return true;
    } else {
      // Tab is already at the extreme left/right and cannot move further in that direction
      return false;
    }
  } catch (error) {
    console.error(
      `background.js: Error moving current tab by offset ${offset}:`,
      error,
    );
    throw error; // Re-throw to propagate the error
  }
}

/**
 * Moves the current active tab to a specific 0-indexed position by calculating the necessary offset.
 * This function utilizes moveCurrentTabByOffset.
 * @param {number} targetIndex The 0-indexed position to move the tab to.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
async function moveToSpecificPositionByOffset(targetIndex) {
  try {
    const [currentTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!currentTab) {
      console.warn("No active tab found to move to specific position.");
      return false;
    }

    const tabsInWindow = await chrome.tabs.query({
      windowId: currentTab.windowId,
    });
    const maxIndex = tabsInWindow.length - 1;

    // Calculate the actual target index within bounds, considering adding at the end
    // If targetIndex is -1, it means move to the end, which is maxIndex + 1 (appending)
    let actualTargetIndex =
      targetIndex === -1
        ? maxIndex + 1
        : Math.max(0, Math.min(targetIndex, maxIndex + 1));

    // Calculate the offset required to move from current index to actualTargetIndex
    const offset = actualTargetIndex - currentTab.index;

    // If the tab is already at the target index, no move is needed.
    if (offset === 0) {
      return true;
    }

    // Use the existing moveCurrentTabByOffset function
    const success = await moveCurrentTabByOffset(offset);
    return success;
  } catch (error) {
    console.error(
      `background.js: Error moving current tab to specific position ${targetIndex} via offset:`,
      error,
    );
    throw error;
  }
}

/**
 * Cycles through tabs that are identified as "media content tabs" based on specific URL patterns,
 * AND includes any tabs that are currently playing audio.
 */
async function cycleMediaTabs() {
  const allTabs = await chrome.tabs.query({});

  // Define a list of regex patterns for media CONTENT pages (excluding home/browse)
  const mediaContentPatterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/,
    /^https?:\/\/(www\.)?netflix\.com\/watch\//,
    /^https?:\/\/(www\.)?open\.spotify\.com\/(track|album|playlist|artist|episode)\//,
    /^https?:\/\/googleusercontent\.com\/spotify\.com\/27\/(track|album|playlist|artist|episode)\//,
    /^https?:\/\/(www\.)?twitch\.tv\/[^\/]+\/?$/,
    /^https?:\/\/(www\.)?twitch\.tv\/videos\//,
    /^https?:\/\/(www\.)?vimeo\.com\/\d+/,
    /^https?:\/\/(www\.)?soundcloud\.com\/[^\/]+\/[^\/]+/,
    /^https?:\/\/(www\.)?hulu\.com\/watch\//,
    /^https?:\/\/(www\.)?disneyplus\.com\/video\//,
    /^https?:\/\/(www\.)?amazon\.com\/Prime-Video\/dp\//,
    /^https?:\/\/(www\.)?amazon\.com\/gp\/video\/detail\//,
  ];

  let mediaTabs = allTabs.filter((tab) => {
    return (
      tab.url && mediaContentPatterns.some((pattern) => pattern.test(tab.url))
    );
  });

  // Add currently audible tabs that are not already in mediaTabs
  const audibleTabs = allTabs.filter((tab) => tab.audible);
  for (const audibleTab of audibleTabs) {
    if (!mediaTabs.some((tab) => tab.id === audibleTab.id)) {
      mediaTabs.push(audibleTab);
    }
  }

  if (mediaTabs.length === 0) {
    return;
  }

  // Sort tabs for consistent cycling order
  mediaTabs.sort((a, b) => {
    if (a.windowId !== b.windowId) {
      return a.windowId - b.windowId;
    }
    return a.index - b.index;
  });

  const { lastMediaTabId } = await chrome.storage.local.get({
    lastMediaTabId: null,
  });

  let nextTabIndex = -1;

  if (lastMediaTabId !== null) {
    const lastTabIndex = mediaTabs.findIndex(
      (tab) => tab.id === lastMediaTabId,
    );
    if (lastTabIndex !== -1) {
      nextTabIndex = (lastTabIndex + 1) % mediaTabs.length;
    }
  }

  if (nextTabIndex === -1) {
    nextTabIndex = 0;
  }

  const targetTab = mediaTabs[nextTabIndex];

  if (targetTab) {
    await chrome.windows.update(targetTab.windowId, { focused: true });
    await chrome.tabs.update(targetTab.id, { active: true });
    await chrome.storage.local.set({ lastMediaTabId: targetTab.id });
  }
}

// --- Harpoon Feature Functions ---

const HARPOON_STORAGE_KEY = "fuzzyTabSearch_harpoonedTabs";
const MAX_HARPOON_LINKS = 4;
// New key to store the URL of the harpooned item to focus after adding/finding it
const INITIAL_HARPOON_URL_KEY = "fuzzyTabSearch_initialHarpoonUrl";

/**
 * Adds the currently active tab to the harpoon list.
 * @returns {Promise<string|null>} A promise that resolves with the URL of the added/existing harpooned tab, or null if unsuccessful.
 */
async function addCurrentTabToHarpoonList() {
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (activeTab && activeTab.url && activeTab.title) {
      let harpoonedTabs = await getHarpoonedTabs();

      // Check for duplicates before adding
      const existingHarpoon = harpoonedTabs.find(
        (harpoonedTab) => harpoonedTab.url === activeTab.url,
      );

      if (existingHarpoon) {
        // If duplicate, return its URL for focusing
        return existingHarpoon.url;
      } else {
        const newHarpoonedTab = {
          id: activeTab.id,
          url: activeTab.url,
          title: activeTab.title,
          favIconUrl:
            activeTab.favIconUrl || chrome.runtime.getURL("img/icon.png"),
        };
        // Check if the list is already at its maximum capacity
        if (harpoonedTabs.length >= MAX_HARPOON_LINKS) {
          harpoonedTabs[MAX_HARPOON_LINKS - 1] = newHarpoonedTab;
        } else {
          harpoonedTabs.push(newHarpoonedTab);
        }
        await chrome.storage.local.set({
          [HARPOON_STORAGE_KEY]: harpoonedTabs,
        });
        return newHarpoonedTab.url; // Return URL of the newly added tab
      }
    } else {
      console.warn(
        "Could not harpoon tab: No active tab found or missing URL/title.",
      );
    }
    return null; // Indicate unsuccessful harpooning
  } catch (error) {
    console.error("Error adding current tab to harpoon list:", error);
    return null;
  }
}

/**
 * Retrieves the list of harpooned tabs from local storage.
 * @returns {Promise<Array<Object>>} A promise that resolves with the array of harpooned tabs.
 */
async function getHarpoonedTabs() {
  try {
    const result = await chrome.storage.local.get({
      [HARPOON_STORAGE_KEY]: [],
    });
    return result[HARPOON_STORAGE_KEY];
  } catch (error) {
    console.error("Error getting harpooned tabs:", error);
    return [];
  }
}

/**
 * Removes a harpooned tab by its URL.
 * @param {string} urlToRemove The URL of the tab to remove from the harpoon list.
 */
async function removeHarpoonedTab(urlToRemove) {
  try {
    let harpoonedTabs = await getHarpoonedTabs();
    const initialLength = harpoonedTabs.length;
    harpoonedTabs = harpoonedTabs.filter((tab) => tab.url !== urlToRemove);

    if (harpoonedTabs.length < initialLength) {
      await chrome.storage.local.set({ [HARPOON_STORAGE_KEY]: harpoonedTabs });
      return true; // Indicate success
    }
    return false; // Indicate not found
  } catch (error) {
    console.error("Error removing harpooned tab:", error);
    return false;
  }
}

/**
 * Activates a harpooned tab by its index.
 * Used by manifest commands.
 * @param {number} index The 0-indexed position of the harpooned tab to activate.
 */
async function activateHarpoonedTabByIndex(index) {
  const harpoonedTabs = await getHarpoonedTabs();
  if (index >= 0 && index < harpoonedTabs.length) {
    const tabToActivate = harpoonedTabs[index];
    await focusOrCreateTab(tabToActivate.url, false); // Harpooned tabs are generally not exact match
  } else {
    console.warn(
      `Attempted to activate harpooned tab at invalid index: ${index}. List has ${harpoonedTabs.length} items.`,
    );
  }
}

// --- Bookmark Feature Functions ---
const MARKS_STORAGE_KEY = "fuzzyTabSearch_bookmarks"; // Use the same key as Marks/marks.js

/**
 * Adds the currently active tab as a bookmark to local storage.
 * It performs checks for duplicate URLs and names before adding.
 * Defaults exactMatch to false and searchableInTabSearch to true.
 * @returns {Promise<Object>} A promise resolving with success status, message, and the URL of the bookmark (newly added or existing).
 */
async function addCurrentTabAsBookmark() {
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!activeTab || !activeTab.url || !activeTab.title) {
      console.warn(
        "Cannot add bookmark: No active tab found or missing URL/title.",
      );
      return {
        success: false,
        message: "No active tab or missing URL/title.",
        url: null,
      };
    }

    const newBookmarkName = activeTab.title.trim();
    const newBookmarkUrl = activeTab.url.trim();

    if (!newBookmarkName || !newBookmarkUrl) {
      return {
        success: false,
        message: "Bookmark name or URL cannot be empty.",
        url: null,
      };
    }

    let existingBookmarks = await chrome.storage.local.get({
      [MARKS_STORAGE_KEY]: [],
    });
    existingBookmarks = existingBookmarks[MARKS_STORAGE_KEY];

    // Check for duplicate URL
    const urlExists = existingBookmarks.some(
      (mark) => mark.url === newBookmarkUrl,
    );
    if (urlExists) {
      return {
        success: false,
        message: "A bookmark with this URL already exists.",
        url: newBookmarkUrl,
      };
    }

    // Check for duplicate name (case-insensitive)
    const nameExists = existingBookmarks.some(
      (mark) => mark.name.toLowerCase() === newBookmarkName.toLowerCase(),
    );
    if (nameExists) {
      return {
        success: false,
        message:
          "A bookmark with this name already exists. Please choose a unique name.",
        url: newBookmarkUrl,
      };
    }

    const newBookmark = {
      name: newBookmarkName,
      url: newBookmarkUrl,
      exactMatch: false, // Default to false for quick add
      searchableInTabSearch: false, // Default to false as per request
    };

    existingBookmarks.push(newBookmark);
    await chrome.storage.local.set({ [MARKS_STORAGE_KEY]: existingBookmarks });
    return {
      success: true,
      message: "Bookmark added successfully!",
      url: newBookmarkUrl,
    };
  } catch (error) {
    console.error("Error adding current tab as bookmark:", error);
    return { success: false, message: `Error: ${error.message}`, url: null };
  }
}

// Key for commanding the initial view upon popup opening
const COMMAND_INITIAL_VIEW_KEY = "fuzzyTabSearch_commandInitialView";
// Key to store the URL of the bookmark to focus after adding/findng it
const INITIAL_MARK_URL_KEY = "fuzzyTabSearch_initialMarkUrl";

// Listen for commands defined in manifest.json
chrome.commands.onCommand.addListener(async (command) => {
  // Fetch custom tab settings
  const settings = await chrome.storage.local.get([
    "customTab1Url",
    "customTab1ExactMatch",
    "customTab2Url",
    "customTab2ExactMatch",
    "customTab3Url",
    "customTab3ExactMatch",
    "customTab4Url",
    "customTab4ExactMatch",
    "customTab5Url",
    "customTab5ExactMatch",
    "customTab6Url",
    "customTab6ExactMatch",
    "customTab7Url",
    "customTab7ExactMatch",
  ]);

  switch (command) {
    case "_execute_action":
    case "open_main_view_secondary": // <--- ADD THIS CASE
      // When either the default action or the new secondary command is triggered,
      // explicitly set the view to tabSearch and open the popup.
      await chrome.storage.session.set({
        [COMMAND_INITIAL_VIEW_KEY]: "tabSearch",
      });
      // Clear any lingering initial focus commands
      await chrome.storage.session.remove(INITIAL_MARK_URL_KEY);
      await chrome.storage.session.remove(INITIAL_HARPOON_URL_KEY);
      await chrome.action.openPopup(); // Explicitly open popup for secondary command
      break;
    case "open_harpoon_view": // NEW command
      await chrome.storage.session.set({
        [COMMAND_INITIAL_VIEW_KEY]: "harpoon",
      });
      // Clear any lingering initial focus commands
      await chrome.storage.session.remove(INITIAL_MARK_URL_KEY);
      await chrome.storage.session.remove(INITIAL_HARPOON_URL_KEY);
      await chrome.action.openPopup(); // Programmatically open the popup
      break;
    case "open_marks_view": // NEW command for Marks
      await chrome.storage.session.set({ [COMMAND_INITIAL_VIEW_KEY]: "marks" });
      // Clear any lingering initial focus commands for harpoon
      await chrome.storage.session.remove(INITIAL_HARPOON_URL_KEY);
      await chrome.storage.session.remove(INITIAL_MARK_URL_KEY); // Clear any specific bookmark focus
      await chrome.action.openPopup(); // Programmatically open the popup
      break;
    // New case for "open_tab_management_view" command
    case "open_tab_management_view":
      await chrome.storage.session.set({
        [COMMAND_INITIAL_VIEW_KEY]: "tabManagement",
      });
      // Clear any lingering initial focus commands
      await chrome.storage.session.remove(INITIAL_MARK_URL_KEY);
      await chrome.storage.session.remove(INITIAL_HARPOON_URL_KEY);
      await chrome.action.openPopup(); // Programmatically open the popup
      break;
    case "custom_tab_1":
      if (settings.customTab1Url) {
        focusOrCreateTab(
          settings.customTab1Url,
          settings.customTab1ExactMatch || false,
        );
      }
      break;
    case "custom_tab_2":
      if (settings.customTab2Url) {
        focusOrCreateTab(
          settings.customTab2Url,
          settings.customTab2ExactMatch || false,
        );
      }
      break;
    case "custom_tab_3":
      if (settings.customTab3Url) {
        focusOrCreateTab(
          settings.customTab3Url,
          settings.customTab3ExactMatch || false,
        );
      }
      break;
    case "custom_tab_4":
      if (settings.customTab4Url) {
        focusOrCreateTab(
          settings.customTab4Url,
          settings.customTab4ExactMatch || false,
        );
      }
      break;
    case "custom_tab_5":
      if (settings.customTab5Url) {
        focusOrCreateTab(
          settings.customTab5Url,
          settings.customTab5ExactMatch || false,
        );
      }
      break;
    case "custom_tab_6":
      if (settings.customTab6Url) {
        focusOrCreateTab(
          settings.customTab6Url,
          settings.customTab6ExactMatch || false,
        );
      }
      break;
    case "custom_tab_7":
      if (settings.customTab7Url) {
        focusOrCreateTab(
          settings.customTab7Url,
          settings.customTab7ExactMatch || false,
        );
      }
      break;
    case "move_tab_to_first":
      // Note: These still use moveCurrentTabToPosition, which relies on the active tab.
      // The Ctrl+# shortcut from popup.js will use the new handleMoveItemToPosition.
      const [currentTab1] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (currentTab1) await moveTabToPosition(currentTab1, 0);
      break;
    case "move_tab_to_second":
      const [currentTab2] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (currentTab2) await moveTabToPosition(currentTab2, 1);
      break;
    case "move_tab_to_third":
      const [currentTab3] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (currentTab3) await moveTabToPosition(currentTab3, 2);
      break;
    case "move_tab_to_fourth":
      const [currentTab4] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (currentTab4) await moveTabToPosition(currentTab4, 3);
      break;
    case "open_new_empty_tab":
      await openNewEmptyTab();
      break;
    case "cycle_audible_tabs":
      await cycleAudibleTabs();
      break;
    case "cycle_youtube_tabs":
      await cycleYoutubeTabs();
      break;
    case "move_tab_left":
      await moveCurrentTabByOffset(-1); // Changed to use the new combined function
      break;
    case "move_tab_right":
      await moveCurrentTabByOffset(1); // Changed to use the new combined function
      break;
    case "cycle_media_tabs":
      await cycleMediaTabs();
      break;
    case "harpoon_current_tab":
      const harpoonTabUrl = await addCurrentTabToHarpoonList();
      if (harpoonTabUrl) {
        // Store the URL of the harpooned tab to be focused
        await chrome.storage.session.set({
          [INITIAL_HARPOON_URL_KEY]: harpoonTabUrl,
        });
      }
      // Always open the harpoon view, regardless of whether a new tab was added or it was a duplicate.
      await chrome.storage.session.set({
        [COMMAND_INITIAL_VIEW_KEY]: "harpoon",
      });
      // Clear any lingering initial mark URL command (only one focus per popup open)
      await chrome.storage.session.remove(INITIAL_MARK_URL_KEY);
      await chrome.action.openPopup(); // Programmatically open the popup
      break;
    case "harpoon_command_1":
      await activateHarpoonedTabByIndex(0);
      break;
    case "harpoon_command_2":
      await activateHarpoonedTabByIndex(1);
      break;
    case "harpoon_command_3":
      await activateHarpoonedTabByIndex(2);
      break;
    case "harpoon_command_4":
      await activateHarpoonedTabByIndex(3);
      break;
    case "add_current_tab_as_bookmark":
      const bookmarkResult = await addCurrentTabAsBookmark(); // Add the bookmark
      if (bookmarkResult.url) {
        // Store the URL of the bookmark to be focused
        await chrome.storage.session.set({
          [INITIAL_MARK_URL_KEY]: bookmarkResult.url,
        });
      }
      // Set the initial view to 'marks' and open the popup
      await chrome.storage.session.set({ [COMMAND_INITIAL_VIEW_KEY]: "marks" });
      // Clear any lingering initial harpoon URL command (only one focus per popup open)
      await chrome.storage.session.remove(INITIAL_HARPOON_URL_KEY);
      await chrome.action.openPopup();
      break;
    case "toggle_last_tab":
      await toggleLastTab(); // Call the new function
      break;
  }
});

// Listen for messages from popup.js (e.g., to move a specific tab or bookmark)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Check if the request is to execute a command from the popup
  if (request.action === "executeMoveTabCommand") {
    if (
      request.command === "moveHighlightedItem" &&
      request.itemUrl &&
      typeof request.targetIndex === "number"
    ) {
      // Call the new unified handler
      handleMoveItemToPosition(
        request.itemUrl,
        request.exactMatch || false,
        request.targetIndex,
      )
        .then((result) => sendResponse(result))
        .catch((error) => {
          console.error("Error handling moveHighlightedItem message:", error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Indicate that sendResponse will be called asynchronously
    }
  } else if (request.action === "harpoonCommand") {
    if (request.command === "getHarpoonedTabs") {
      getHarpoonedTabs()
        .then((tabs) => sendResponse({ success: true, tabs: tabs }))
        .catch((error) => {
          console.error("Error getting harpooned tabs:", error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Asynchronous response
    } else if (request.command === "removeHarpoonedTab" && request.url) {
      removeHarpoonedTab(request.url)
        .then((success) => sendResponse({ success: success }))
        .catch((error) => {
          console.error("Error removing harpooned tab:", error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Asynchronous response
    }
  } else if (request.action === "moveCurrentTabToSpecificPosition") {
    (async () => {
      try {
        const success = await moveToSpecificPositionByOffset(
          request.targetIndex,
        ); // Changed to use the new function
        sendResponse({ success: success });
      } catch (error) {
        console.error("Error moving current tab to specific position:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Asynchronous response
  } else if (request.action === "moveCurrentTabLeft") {
    (async () => {
      try {
        const success = await moveCurrentTabByOffset(-1); // Changed to use the new combined function
        sendResponse({ success: success });
      } catch (error) {
        console.error("Error moving current tab left from popup:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Asynchronous response
  } else if (request.action === "moveCurrentTabRight") {
    (async () => {
      try {
        const success = await moveCurrentTabByOffset(1); // Changed to use the new combined function
        sendResponse({ success: success });
      } catch (error) {
        console.error("Error moving current tab right from popup:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Asynchronous response
  } else if (request.action === "moveActiveTabToWindow") {
    (async () => {
      try {
        // Find the tab to move (it might not be the active one anymore if user switched tabs outside the popup)
        const tabToMove = await chrome.tabs.get(request.tabId);
        if (!tabToMove) {
          sendResponse({ success: false, error: "Tab to move not found." });
          return;
        }

        await chrome.tabs.move(tabToMove.id, {
          windowId: request.targetWindowId,
          index: -1,
        }); // Move to the end of the target window
        await chrome.windows.update(request.targetWindowId, { focused: true }); // Focus the target window
        await chrome.tabs.update(tabToMove.id, { active: true }); // Activate the tab in the new window
        sendResponse({ success: true });
      } catch (error) {
        console.error(
          "background.js: Error moving active tab to another window:",
          error,
        );
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Asynchronous response
  } else if (request.action === "createWindowAndMoveTab") {
    //  Handle "create empty window and teleport"
    (async () => {
      try {
        // Find the tab to move (it might not be the active one anymore)
        const tabToMove = await chrome.tabs.get(request.tabId);
        if (!tabToMove) {
          sendResponse({ success: false, error: "Tab to move not found." });
          return;
        }

        // Create a new window with a new tab page
        const newWindow = await chrome.windows.create({
          url: "chrome://newtab/",
        });
        const newWindowId = newWindow.id;
        const initialBlankTabId =
          newWindow.tabs && newWindow.tabs.length > 0
            ? newWindow.tabs[0].id
            : null; // The tab created with the new window

        // Move the current active tab to the new window
        await chrome.tabs.move(tabToMove.id, {
          windowId: newWindowId,
          index: 0,
        }); // Move to first position

        // Optionally, remove the initial blank tab from the new window if it's still there
        if (initialBlankTabId && initialBlankTabId !== tabToMove.id) {
          try {
            // Verify the initial tab still exists and is not the one we just moved
            const initialTabCheck = await chrome.tabs.get(initialBlankTabId);
            if (
              initialTabCheck &&
              initialTabCheck.windowId === newWindowId &&
              initialTabCheck.id !== tabToMove.id
            ) {
              await chrome.tabs.remove(initialBlankTabId);
            }
          } catch (tabError) {
            // Tab might have already been removed by Chrome if it was the only one
          }
        }

        // Focus the new window and activate the tab we just moved
        await chrome.windows.update(newWindowId, { focused: true });
        await chrome.tabs.update(tabToMove.id, { active: true });

        sendResponse({ success: true, newWindowId: newWindowId });
      } catch (error) {
        console.error(
          "background.js: Error creating new window and moving tab:",
          error,
        );
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Asynchronous response
  } else if (request.action === "closeWindow") {
    (async () => {
      try {
        if (typeof request.windowId !== "number") {
          sendResponse({ success: false, error: "Invalid windowId provided." });
          return;
        }

        const allWindows = await chrome.windows.getAll();
        if (allWindows.length === 1 && allWindows[0].id === request.windowId) {
          sendResponse({
            success: false,
            error: "Cannot close the last remaining browser window.",
          });
          return;
        }

        await chrome.windows.remove(request.windowId);
        sendResponse({ success: true });
      } catch (error) {
        // Capture Chrome's specific error message and send it back
        console.error(
          `background.js: Error closing window ${request.windowId}:`,
          error,
        );
        sendResponse({
          success: false,
          error:
            error.message ||
            "An unknown error occurred while trying to close the window.",
        });
      }
    })();
    return true; // Asynchronous response
  } else if (request.action === "addBookmarkFromPopup") {
    // New handler for adding bookmark from popup
    (async () => {
      try {
        const result = await addCurrentTabAsBookmark();
        // The addCurrentTabAsBookmark function already handles setting INITIAL_MARK_URL_KEY
        // and COMMAND_INITIAL_VIEW_KEY, and opening the popup if needed.
        sendResponse(result);
      } catch (error) {
        console.error("Error adding bookmark from popup:", error);
        sendResponse({ success: false, error: error.message, url: null });
      }
    })();
    return true; // Asynchronous response
  }
});
