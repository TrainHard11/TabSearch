// background.js

// Function to handle focusing an existing tab or creating/updating a new one
// It now takes a single URL parameter and an optional exactMatch boolean.
async function focusOrCreateTab(tabUrl, exactMatch = false) {
    // 1. Try to find an existing tab based on the matching criteria.
    const queryOptions = exactMatch
        ? { url: tabUrl }
        : { url: `${tabUrl}*` }; // Use wildcard for partial match unless exactMatch is true
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
            const updatedTab = await chrome.tabs.update(currentTab.id, { url: tabUrl });
            return updatedTab; // Return the updated tab object
        } else {
            // If the current tab is not empty, create a brand new tab with the new tab URL.
            const newTab = await chrome.tabs.create({ url: tabUrl });
            return newTab; // Return the new tab object
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
        if (!tab || typeof tab.id === 'undefined') {
            console.warn("Attempted to move an invalid tab:", tab);
            return;
        }

        const tabsInWindow = await chrome.tabs.query({ windowId: tab.windowId });
        const maxIndex = tabsInWindow.length - 1;

        // Ensure targetIndex is within valid bounds (0 to maxIndex + 1 for appending)
        const actualTargetIndex = Math.max(0, Math.min(targetIndex, maxIndex + 1));

        await chrome.tabs.move(tab.id, { index: actualTargetIndex });
        // Optionally, focus the tab after moving it
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(tab.id, { active: true });
    } catch (error) {
        console.error(`Error moving tab ${tab?.id} to position ${targetIndex}:`, error);
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
            return { success: false, error: "Failed to find or create tab for move operation." };
        }
    } catch (error) {
        console.error(`Error in handleMoveItemToPosition for URL ${itemUrl} to index ${targetIndex}:`, error);
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

/**
 * Moves the current active tab one position to the left.
 */
async function moveCurrentTabLeft() {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (currentTab && currentTab.index > 0) {
        await chrome.tabs.move(currentTab.id, { index: currentTab.index - 1 });
    }
}

/**
 * Moves the current active tab one position to the right.
 */
async function moveCurrentTabRight() {
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (currentTab) {
        const tabsInWindow = await chrome.tabs.query({ windowId: currentTab.windowId });
        const maxIndex = tabsInWindow.length - 1;

        if (currentTab.index < maxIndex) {
            await chrome.tabs.move(currentTab.id, { index: currentTab.index + 1 });
        }
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
        /^https?:\/\/(www\.)?amazon\.com\/gp\/video\/detail\//
    ];

    let mediaTabs = allTabs.filter(tab => {
        return tab.url && mediaContentPatterns.some(pattern => pattern.test(tab.url));
    });

    // Add currently audible tabs that are not already in mediaTabs
    const audibleTabs = allTabs.filter(tab => tab.audible);
    for (const audibleTab of audibleTabs) {
        if (!mediaTabs.some(tab => tab.id === audibleTab.id)) {
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

    const { lastMediaTabId } = await chrome.storage.local.get({ lastMediaTabId: null });

    let nextTabIndex = -1;

    if (lastMediaTabId !== null) {
        const lastTabIndex = mediaTabs.findIndex(tab => tab.id === lastMediaTabId);
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

/**
 * Adds the currently active tab to the harpoon list.
 */
async function addCurrentTabToHarpoonList() {
    try {
        const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        if (activeTab && activeTab.url && activeTab.title) {
            let harpoonedTabs = await getHarpoonedTabs();

            // Check for duplicates before adding
            const isDuplicate = harpoonedTabs.some(
                (harpoonedTab) => harpoonedTab.url === activeTab.url
            );

            if (!isDuplicate) {
                const newHarpoonedTab = {
                    id: activeTab.id, // Store tab ID for potential direct interaction
                    url: activeTab.url,
                    title: activeTab.title,
                    favIconUrl: activeTab.favIconUrl || chrome.runtime.getURL("img/SGN256.png") // Default icon
                };
                harpoonedTabs.push(newHarpoonedTab);
                await chrome.storage.local.set({ [HARPOON_STORAGE_KEY]: harpoonedTabs });
                console.log("Tab harpooned:", activeTab.title);
            } else {
                console.log("Tab already harpooned:", activeTab.title);
            }
        } else {
            console.warn("Could not harpoon tab: No active tab found or missing URL/title.");
        }
    } catch (error) {
        console.error("Error adding current tab to harpoon list:", error);
    }
}

/**
 * Retrieves the list of harpooned tabs from local storage.
 * @returns {Promise<Array<Object>>} A promise that resolves with the array of harpooned tabs.
 */
async function getHarpoonedTabs() {
    try {
        const result = await chrome.storage.local.get({ [HARPOON_STORAGE_KEY]: [] });
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
        harpoonedTabs = harpoonedTabs.filter(tab => tab.url !== urlToRemove);

        if (harpoonedTabs.length < initialLength) {
            await chrome.storage.local.set({ [HARPOON_STORAGE_KEY]: harpoonedTabs });
            console.log("Harpooned tab removed:", urlToRemove);
            return true; // Indicate success
        }
        console.log("Harpooned tab not found for removal:", urlToRemove);
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
        console.log(`Activating harpooned tab at index ${index}: ${tabToActivate.title}`);
        await focusOrCreateTab(tabToActivate.url, false); // Harpooned tabs are generally not exact match
    } else {
        console.warn(`Attempted to activate harpooned tab at invalid index: ${index}. List has ${harpoonedTabs.length} items.`);
    }
}

// NEW: Key for commanding the initial view upon popup opening
const COMMAND_INITIAL_VIEW_KEY = "fuzzyTabSearch_commandInitialView";

// Listen for commands defined in manifest.json
chrome.commands.onCommand.addListener(async (command) => {
    // Fetch custom tab settings
    const settings = await chrome.storage.local.get([
        'customTab1Url', 'customTab1ExactMatch',
        'customTab2Url', 'customTab2ExactMatch',
        'customTab3Url', 'customTab3ExactMatch',
        'customTab4Url', 'customTab4ExactMatch',
        'customTab5Url', 'customTab5ExactMatch',
        'customTab6Url', 'customTab6ExactMatch',
        'customTab7Url', 'customTab7ExactMatch'
    ]);

    switch (command) {
        case "_execute_action":
            // When the default action command is triggered, explicitly set the view to tabSearch
            await chrome.storage.session.set({ [COMMAND_INITIAL_VIEW_KEY]: "tabSearch" });
            // chrome.action.openPopup() is usually implicitly called by _execute_action
            break;
        case "open_harpoon_view": // NEW command
            await chrome.storage.session.set({ [COMMAND_INITIAL_VIEW_KEY]: "harpoon" });
            await chrome.action.openPopup(); // Programmatically open the popup
            break;
        case "custom_tab_1":
            if (settings.customTab1Url) {
                focusOrCreateTab(settings.customTab1Url, settings.customTab1ExactMatch || false);
            }
            break;
        case "custom_tab_2":
            if (settings.customTab2Url) {
                focusOrCreateTab(settings.customTab2Url, settings.customTab2ExactMatch || false);
            }
            break;
        case "custom_tab_3":
            if (settings.customTab3Url) {
                focusOrCreateTab(settings.customTab3Url, settings.customTab3ExactMatch || false);
            }
            break;
        case "custom_tab_4":
            if (settings.customTab4Url) {
                focusOrCreateTab(settings.customTab4Url, settings.customTab4ExactMatch || false);
            }
            break;
        case "custom_tab_5":
            if (settings.customTab5Url) {
                focusOrCreateTab(settings.customTab5Url, settings.customTab5ExactMatch || false);
            }
            break;
        case "custom_tab_6":
            if (settings.customTab6Url) {
                focusOrCreateTab(settings.customTab6Url, settings.customTab6ExactMatch || false);
            }
            break;
        case "custom_tab_7":
            if (settings.customTab7Url) {
                focusOrCreateTab(settings.customTab7Url, settings.customTab7ExactMatch || false);
            }
            break;
        case "move_tab_to_first":
            // Note: These still use moveCurrentTabToPosition, which relies on the active tab.
            // The Alt+F# shortcut from popup.js will use the new handleMoveItemToPosition.
            const [currentTab1] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (currentTab1) await moveTabToPosition(currentTab1, 0);
            break;
        case "move_tab_to_second":
            const [currentTab2] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (currentTab2) await moveTabToPosition(currentTab2, 1);
            break;
        case "move_tab_to_third":
            const [currentTab3] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (currentTab3) await moveTabToPosition(currentTab3, 2);
            break;
        case "move_tab_to_fourth":
            const [currentTab4] = await chrome.tabs.query({ active: true, currentWindow: true });
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
            await moveCurrentTabLeft();
            break;
        case "move_tab_right":
            await moveCurrentTabRight();
            break;
        case "cycle_media_tabs":
            await cycleMediaTabs();
            break;
        case "harpoon_current_tab": // NEW COMMAND HANDLER
            await addCurrentTabToHarpoonList();
            break;
        // --- NEW: Harpoon Command Handlers ---
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
        // --- END NEW ---
    }
});

// Listen for messages from popup.js (e.g., to move a specific tab or bookmark)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Check if the request is to execute a command from the popup
    if (request.action === "executeMoveTabCommand") {
        if (request.command === "moveHighlightedItem" && request.itemUrl && typeof request.targetIndex === 'number') {
            // Call the new unified handler
            handleMoveItemToPosition(request.itemUrl, request.exactMatch || false, request.targetIndex)
                .then(result => sendResponse(result))
                .catch(error => {
                    console.error("Error handling moveHighlightedItem message:", error);
                    sendResponse({ success: false, error: error.message });
                });
            return true; // Indicate that sendResponse will be called asynchronously
        }
    } else if (request.action === "harpoonCommand") { // NEW: Harpoon related messages from popup.js
        if (request.command === "getHarpoonedTabs") {
            getHarpoonedTabs()
                .then(tabs => sendResponse({ success: true, tabs: tabs }))
                .catch(error => {
                    console.error("Error getting harpooned tabs:", error);
                    sendResponse({ success: false, error: error.message });
                });
            return true; // Asynchronous response
        } else if (request.command === "removeHarpoonedTab" && request.url) {
            removeHarpoonedTab(request.url)
                .then(success => sendResponse({ success: success }))
                .catch(error => {
                    console.error("Error removing harpooned tab:", error);
                    sendResponse({ success: false, error: error.message });
                });
            return true; // Asynchronous response
        }
    }
});
