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

// Listen for commands defined in manifest.json
chrome.commands.onCommand.addListener((command) => {
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
  }
});

console.log("Background service worker started and listening for commands.");
