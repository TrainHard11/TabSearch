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
    //    check the current active tab to see if it's empty.
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
// This function will now be largely incorporated into cycleMediaTabs
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
        // Get all tabs in the current window to determine the maximum index
        const tabsInWindow = await chrome.tabs.query({ windowId: currentTab.windowId });
        const maxIndex = tabsInWindow.length - 1;

        if (currentTab.index < maxIndex) {
            await chrome.tabs.move(currentTab.id, { index: currentTab.index + 1 });
        } else {
            // If it's already the last tab, move it to the very end (no change if already last)
            // Or you could cycle to the beginning if that's desired behavior
            // For now, it stays at the end if it's already the last.
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
        /^https?:\/\/(www\.)?youtube\.com\/watch\?v=/, // Specific YouTube video pages
        /^https?:\/\/(www\.)?netflix\.com\/watch\//,    // Netflix watch pages
        /^https?:\/\/(www\.)?open\.spotify\.com\/(track|album|playlist|artist|episode)\//, // Standard Spotify content
        /^https?:\/\/googleusercontent\.com\/spotify\.com\/27\/(track|album|playlist|artist|episode)\//, // Googleusercontent.com Spotify URLs
        /^https?:\/\/(www\.)?twitch\.tv\/[^\/]+\/?$/, // Twitch live streams (e.g., twitch.tv/some_channel, not just twitch.tv)
        /^https?:\/\/(www\.)?twitch\.tv\/videos\//,    // Twitch VODs
        /^https?:\/\/(www\.)?vimeo\.com\/\d+/,         // Specific Vimeo videos
        /^https?:\/\/(www\.)?soundcloud\.com\/[^\/]+\/[^\/]+/, // Specific SoundCloud tracks
        /^https?:\/\/(www\.)?hulu\.com\/watch\//,      // Hulu watch pages
        /^https?:\/\/(www\.)?disneyplus\.com\/video\//, // Disney+ video pages
        /^https?:\/\/(www\.)?amazon\.com\/Prime-Video\/dp\//, // Amazon Prime Video detail pages
        /^https?:\/\/(www\.)?amazon\.com\/gp\/video\/detail\// // Another Amazon Prime Video detail pattern
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
        return; // No media or audible tabs found, do nothing
    }

    // Sort tabs for consistent cycling order
    mediaTabs.sort((a, b) => {
        if (a.windowId !== b.windowId) {
            return a.windowId - b.windowId;
        }
        return a.index - b.index;
    });

    // Get the ID of the last media tab that was focused
    const { lastMediaTabId } = await chrome.storage.local.get({ lastMediaTabId: null });

    let nextTabIndex = -1;

    // Find the index of the last focused media tab
    if (lastMediaTabId !== null) {
        const lastTabIndex = mediaTabs.findIndex(tab => tab.id === lastMediaTabId);
        if (lastTabIndex !== -1) {
            // Calculate the next tab's index, cycling back to the beginning if at the end
            nextTabIndex = (lastTabIndex + 1) % mediaTabs.length;
        }
    }

    // If no last tab was found or it was invalid, start from the first media tab
    if (nextTabIndex === -1) {
        nextTabIndex = 0;
    }

    const targetTab = mediaTabs[nextTabIndex];

    if (targetTab) {
        // Focus the window and activate the target tab
        await chrome.windows.update(targetTab.windowId, { focused: true });
        await chrome.tabs.update(targetTab.id, { active: true });
        // Store the ID of the newly focused tab for the next cycle
        await chrome.storage.local.set({ lastMediaTabId: targetTab.id });
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
    // This command can now be redundant if cycle_media_tabs covers all audible tabs.
    // Consider removing this if you only want one unified media/audible cycle.
    await cycleAudibleTabs();
    }  else if (command === "cycle_youtube_tabs") {
        await cycleYoutubeTabs();
    } else if (command === "move_tab_left") {
        await moveCurrentTabLeft();
    } else if (command === "move_tab_right") {
        await moveCurrentTabRight();
    } else if (command === "cycle_media_tabs") { // New command handler
        await cycleMediaTabs();
    }
});
