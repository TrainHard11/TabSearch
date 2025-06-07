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
