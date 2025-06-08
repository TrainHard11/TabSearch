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
            await chrome.tabs.update(currentTab.id, { url: tabUrl });
        } else {
            // If the current tab is not empty, create a brand new tab with the new tab URL.
            await chrome.tabs.create({ url: tabUrl });
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
        const tabsInWindow = await chrome.tabs.query({ windowId: currentTab.windowId });
        const maxIndex = tabsInWindow.length - 1;

        const effectiveIndex = Math.max(0, Math.min(index, maxIndex + 1));

        chrome.tabs.move(currentTab.id, { index: effectiveIndex });
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


// Listen for commands defined in manifest.json
chrome.commands.onCommand.addListener(async (command) => {
    // Fetch custom tab settings
    const settings = await chrome.storage.local.get([
        'customTab1Url', 'customTab1ExactMatch',
        'customTab2Url', 'customTab2ExactMatch',
        'customTab3Url', 'customTab3ExactMatch',
        'customTab4Url', 'customTab4ExactMatch'
    ]);

    switch (command) {
        case "whatsapp_tab":
            focusOrCreateTab("https://web.whatsapp.com/");
            break;
        case "gemini_tab":
            focusOrCreateTab("https://gemini.google.com/app");
            break;
        case "chatgpt_tab":
            focusOrCreateTab("https://chatgpt.com/");
            break;
        case "youtube_homepage_tab":
            focusOrCreateTab(
                "https://www.youtube.com/",
                true, // Set exactMatch to true for this command
            );
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
        case "move_tab_to_first":
            await moveCurrentTabToPosition(0);
            break;
        case "move_tab_to_second":
            await moveCurrentTabToPosition(1);
            break;
        case "move_tab_to_third":
            await moveCurrentTabToPosition(2);
            break;
        case "move_tab_to_fourth":
            await moveCurrentTabToPosition(3);
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
    }
});
