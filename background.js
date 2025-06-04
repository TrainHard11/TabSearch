// background.js

// Function to handle focusing an existing tab or creating/updating a new one
// It now takes a baseUrl for matching and a newTabUrl for opening/updating
async function focusOrCreateTab(baseUrl, newTabUrl) {
  // 1. Try to find an existing tab with the baseUrl
  // We use a wildcard (*) to match URLs that start with the baseUrl,
  // allowing for additional path segments or query parameters.
  const existingTabs = await chrome.tabs.query({ url: `${baseUrl}*` });

  if (existingTabs.length > 0) {
    // If one or more tabs are found, pick the first one.
    const targetTab = existingTabs[0];
    // Focus its window and then activate the tab.
    await chrome.windows.update(targetTab.windowId, { focused: true });
    await chrome.tabs.update(targetTab.id, { active: true });
  } else {
    // 2. If no existing tab with the baseUrl is found,
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
    // For WhatsApp, the base URL and new tab URL are the same.
    focusOrCreateTab("https://web.whatsapp.com/", "https://web.whatsapp.com/");
  } else if (command === "gemini_tab") {
    // For Gemini, the base URL is 'https://gemini.google.com/app' and the new tab URL is also 'https://gemini.google.com/app'.
    focusOrCreateTab(
      "https://gemini.google.com/app",
      "https://gemini.google.com/app",
    );
  } else if (command === "chatgpt_tab") {
    // For ChatGPT, the base URL and new tab URL are the same.
    focusOrCreateTab("https://chatgpt.com/", "https://chatgpt.com/");
  }
});

console.log("Background service worker started and listening for commands.");
