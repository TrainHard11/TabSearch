document.addEventListener("DOMContentLoaded", () => {
  // --- Constants and DOM Element References ---
  const LS_PREFIX = "fuzzyTabSearch_"; // Local storage prefix for all keys
  const LS_LAST_QUERY_PERSISTENT = `${LS_PREFIX}lastQueryPersistent`; // For short-term memory
  const LS_LAST_QUERY_TIMESTAMP = `${LS_PREFIX}lastQueryTimestamp`; // For short-term memory

  // Constants for view state management (using sessionStorage for current session)
  const SS_LAST_QUERY_SESSION = `${LS_PREFIX}lastQuerySession`;
  const SS_FILTERED_RESULTS_SESSION = `${LS_PREFIX}filteredResultsSession`; // Renamed from SS_FILTERED_TABS_SESSION
  const SS_SELECTED_INDEX_SESSION = `${LS_PREFIX}selectedIndexSession`;
  const SS_LAST_VIEW = `${LS_PREFIX}lastView`;

  const SEARCH_MEMORY_DURATION_MS = 20 * 1000; // 20 seconds

  const searchInput = document.getElementById("searchInput");
  const tabList = document.getElementById("tabList"); // This will now hold combined results
  const tabCounter = document.getElementById("tabCounter"); // This will now be a results counter
  const helpContentContainer = document.getElementById("helpContentContainer");
  const marksSection = document.getElementById("marksSection"); // Marks Section reference
  const infoText = document.querySelector(".info-text");
  const searchArea = document.querySelector(".search-area");
  const settingsContentContainer = document.getElementById(
    "settingsContentContainer",
  );

  // Variables for settings elements, populated after settings.html is loaded
  let enableWebNavigatorCheckbox;
  let searchOnNoResultsCheckbox;
  let searchMarksCheckbox; // New checkbox reference
  let customTabInputs = [];
  let customTabExactMatchCheckboxes = [];

  // --- State Variables ---
  let allTabs = []; // Holds all active browser tabs
  let allMarks = []; // Holds all user-defined bookmarks
  let filteredResults = []; // Holds combined and filtered tabs/marks
  let selectedIndex = -1;
  let currentQuery = "";
  let helpContentLoaded = false;
  let settingsContentLoaded = false;
  let marksContentLoaded = false; // New state variable for Marks content

  // NEW: Flag to indicate if the current searchInput value came from a persistent query
  let isPersistentQueryActive = false;

  // Default settings
  const defaultSettings = {
    webNavigatorEnabled: true,
    searchOnNoResults: true,
    searchMarksEnabled: true, // NEW: Default to true as requested
    customTab1Url: "https://web.whatsapp.com/",
    customTab1ExactMatch: false,
    customTab2Url: "https://gemini.google.com/app",
    customTab2ExactMatch: false,
    customTab3Url: "",
    customTab3ExactMatch: false,
    customTab4Url: "",
    customTab4ExactMatch: false,
    customTab5Url: "",
    customTab5ExactMatch: false,
    customTab6Url: "",
    customTab6ExactMatch: false,
    customTab7Url: "",
    customTab7ExactMatch: false,
  };
  let currentSettings = {};

  // --- Utility Functions ---

  /**
   * Highlights the query in the text.
   * @param {string} text The full text to highlight.
   * @param {string} query The search query.
   * @returns {string} HTML string with highlighted text.
   */
  const highlightText = (text, query) => {
    if (!text || !query) return text;
    const lowerCaseQuery = query.toLowerCase();
    const queryWords = lowerCaseQuery.split(" ").filter(Boolean);
    let highlightedHtml = text;
    queryWords.forEach((word) => {
      const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${escapedWord})`, "gi");
      highlightedHtml = highlightedHtml.replace(
        regex,
        (match) => `<span class="highlight">${match}</span>`,
      );
    });
    return highlightedHtml;
  };

  /**
   * Performs a fuzzy search on a given list of items.
   * Items are expected to have 'title' (or 'name') and 'url' properties.
   * Prioritizes title/name matches over URL matches.
   * @param {string} query The search query.
   * @param {Array<Object>} items The array of items (tabs or marks) to search within.
   * @param {string} titleKey The key for the title/name property (e.g., 'title' for tabs, 'name' for marks).
   * @returns {Array<Object>} The filtered and sorted list of items.
   */
  const fuzzySearchItems = (query, items, titleKey) => {
    if (!query) return items;
    const lowerCaseQuery = query.toLowerCase();
    const queryWords = lowerCaseQuery.split(" ").filter(Boolean);

    const titleMatches = [];
    const urlMatches = [];
    const processedIds = new Set(); // To prevent duplicates when an item matches both title and URL

    items.forEach((item) => {
      const itemTitle = (item[titleKey] || "").toLowerCase();
      const itemUrl = (item.url || "").toLowerCase();
      const itemId = item.id || item.url; // Use URL as ID for marks, or actual tab ID

      const matchesTitle = queryWords.every((word) =>
        itemTitle.includes(word),
      );
      const matchesUrl = queryWords.every((word) => itemUrl.includes(word));

      if (matchesTitle) {
        titleMatches.push(item);
        processedIds.add(itemId);
      } else if (matchesUrl && !processedIds.has(itemId)) {
        urlMatches.push(item);
        processedIds.add(itemId);
      }
    });
    return [...titleMatches, ...urlMatches];
  };

  /**
   * Switches to the specified tab and closes the popup.
   * @param {number} tabId The ID of the tab to switch to.
   * @param {number} targetWindowId The ID of the window the tab belongs to.
   */
  const switchTab = (tabId, targetWindowId) => {
    chrome.windows.getCurrent((currentWindow) => {
      if (currentWindow.id === targetWindowId) {
        chrome.tabs.update(tabId, { active: true }, () => window.close());
      } else {
        chrome.windows.update(targetWindowId, { focused: true }, () => {
          chrome.tabs.update(tabId, { active: true }, () => window.close());
        });
      }
    });
  };

  /**
   * Opens a URL in a new tab and closes the popup.
   * @param {string} url The URL to open.
   */
  const openUrl = (url) => {
    chrome.tabs.create({ url: url }, () => window.close());
  };

  /**
   * Looks for an existing tab with the given URL and switches to it.
   * If no such tab is found, it creates a new tab with the URL.
   * @param {string} url The URL to open or switch to.
   * @param {boolean} [exactMatch=false] Whether to match the URL exactly or partially.
   */
  const focusOrCreateTabByUrl = (url, exactMatch = false) => {
    const queryOptions = exactMatch ? { url: url } : { url: `${url}*` };
    chrome.tabs.query(queryOptions, (tabs) => {
      if (tabs.length > 0) {
        const existingTab = tabs[0];
        switchTab(existingTab.id, existingTab.windowId);
      } else {
        chrome.tabs.create({ url: url }, () => window.close());
      }
    });
  };

  // --- Session-based Search State (for view switching) ---

  /**
   * Stores the current search state (query, filtered results, selected index) in sessionStorage.
   * This is used to preserve state when switching between different views within the same popup session.
   */
  const saveSessionSearchState = () => {
    try {
      sessionStorage.setItem(SS_LAST_QUERY_SESSION, currentQuery);
      sessionStorage.setItem(
        SS_FILTERED_RESULTS_SESSION,
        JSON.stringify(filteredResults),
      ); // Changed from filteredTabs
      sessionStorage.setItem(SS_SELECTED_INDEX_SESSION, selectedIndex);
    } catch (error) {
      console.error("Error saving session search state:", error);
    }
  };

  /**
   * Loads the search state from sessionStorage.
   * @returns {object|null} The loaded state or null if not found/error.
   */
  const loadSessionSearchState = () => {
    try {
      const query = sessionStorage.getItem(SS_LAST_QUERY_SESSION);
      const results = JSON.parse(
        sessionStorage.getItem(SS_FILTERED_RESULTS_SESSION),
      ); // Changed from filteredTabs
      const index = parseInt(
        sessionStorage.getItem(SS_SELECTED_INDEX_SESSION),
        10,
      );

      if (query !== null && results !== null && !isNaN(index)) {
        return { query, results, index };
      }
    } catch (error) {
      console.error("Error loading session search state:", error);
    }
    return null;
  };

  /**
   * Clears the saved search state from sessionStorage.
   */
  const clearSessionSearchState = () => {
    sessionStorage.removeItem(SS_LAST_QUERY_SESSION);
    sessionStorage.removeItem(SS_FILTERED_RESULTS_SESSION); // Changed from filteredTabs
    sessionStorage.removeItem(SS_SELECTED_INDEX_SESSION);
  };

  // --- Persistent Short-Term Search Memory (for re-opening popup) ---

  /**
   * Saves the current query and a timestamp to localStorage.
   * This is for the 20-second "remember last search" feature,
   * only if there are 2 or more filtered results.
   */
  const savePersistentLastQuery = () => {
    try {
      // Only save if there are 2 or more filtered results.
      if (filteredResults.length > 1) {
        localStorage.setItem(LS_LAST_QUERY_PERSISTENT, currentQuery);
        localStorage.setItem(LS_LAST_QUERY_TIMESTAMP, Date.now().toString());
      } else {
        clearPersistentLastQuery(); // Clear if condition not met
      }
    } catch (error) {
      console.error("Error saving persistent last query:", error);
    }
  };

  /**
   * Loads the last query from localStorage if it's within the memory duration.
   * @returns {string} The last query or an empty string if expired or not found.
   */
  const loadPersistentLastQuery = () => {
    try {
      const lastQuery = localStorage.getItem(LS_LAST_QUERY_PERSISTENT);
      const timestamp = parseInt(
        localStorage.getItem(LS_LAST_QUERY_TIMESTAMP),
        10,
      );

      if (lastQuery && !isNaN(timestamp)) {
        const timeElapsed = Date.now() - timestamp;
        if (timeElapsed <= SEARCH_MEMORY_DURATION_MS) {
          return lastQuery;
        } else {
          // If expired, clear it
          clearPersistentLastQuery();
        }
      }
    } catch (error) {
      console.error("Error loading persistent last query:", error);
    }
    return "";
  };

  /**
   * Clears the persistent last query from localStorage.
   */
  const clearPersistentLastQuery = () => {
    localStorage.removeItem(LS_LAST_QUERY_PERSISTENT);
    localStorage.removeItem(LS_LAST_QUERY_TIMESTAMP);
  };

  // --- View Management ---
  const ViewManager = (() => {
    let activeView = "tabSearch"; // Default view

    const viewElements = {
      tabSearch: { container: searchArea, content: tabList, info: infoText },
      settings: {
        container: settingsContentContainer,
        content: settingsContentContainer,
      },
      help: { container: helpContentContainer, content: helpContentContainer },
      marks: { container: marksSection, content: marksSection }, // Marks view element
    };

    const hideAllViews = () => {
      Object.values(viewElements).forEach((view) => {
        view.container.classList.add("hidden");
        if (view.content) {
          view.content.classList.remove("scrollable-content");
        }
        if (view.info) {
          view.info.classList.add("hidden");
        }
      });
    };

    /**
     * Shows a specified view, saving current state if switching from tabSearch.
     * @param {string} viewName The name of the view to show.
     * @param {boolean} isRestoring If true, indicates a restore operation,
     * so current state should not be saved.
     */
    const showView = (viewName, isRestoring = false) => {
      if (!viewElements[viewName]) {
        console.warn(`Attempted to show unknown view: ${viewName}`);
        return;
      }

      // Save the current search state before switching views, unless it's a restore operation
      if (activeView === "tabSearch" && !isRestoring) {
        saveSessionSearchState();
      }

      hideAllViews();
      activeView = viewName;
      sessionStorage.setItem(SS_LAST_VIEW, activeView); // Persist active view for session

      const { container, content, info } = viewElements[viewName];

      container.classList.remove("hidden");
      if (content) {
        content.classList.add("scrollable-content");
      }
      if (info) {
        info.classList.remove("hidden");
      }

      // Specific actions after showing a view
      if (viewName === "tabSearch") {
        searchInput.focus();
        // The renderResults function will be called by fetchAndDisplayResults which handles restoring.
      } else {
        // Clear search input and visual list when switching away from tabSearch
        searchInput.value = "";
        renderResults([]); // Render an empty list
      }
    };

    /**
     * Toggles between the current view and the specified view.
     * @param {string} viewName The name of the view to toggle to.
     * @param {Function} [loadContentFn=null] Optional function to load view-specific content.
     */
    const toggleView = async (viewName, loadContentFn = null) => {
      if (activeView === viewName) {
        // If already on this view, go back to tab search and try to restore state
        showView("tabSearch", true); // Pass true to indicate a restore
        await fetchAndDisplayResults(); // Re-fetch data and re-apply current query
      } else {
        if (loadContentFn) {
          await loadContentFn(); // Load content if provided (e.g., for help or settings)
        }
        showView(viewName);
      }
    };

    const getActiveView = () => activeView;

    // Initialize with the last active view if available from session storage
    const initialView = sessionStorage.getItem(SS_LAST_VIEW) || "tabSearch";
    if (initialView !== activeView) {
      activeView = initialView; // Set it initially, but showView will handle actual display
    }

    return {
      show: showView,
      toggle: toggleView,
      getActive: getActiveView,
    };
  })();

  // --- Settings Functions ---

  /**
   * Gets references to settings DOM elements after content is loaded.
   */
  const getSettingsDOMElements = () => {
    enableWebNavigatorCheckbox = settingsContentContainer.querySelector(
      "#enableWebNavigator",
    );
    searchOnNoResultsCheckbox =
      settingsContentContainer.querySelector("#searchOnNoResults");
    searchMarksCheckbox =
      settingsContentContainer.querySelector("#searchMarksCheckbox"); // NEW
    customTabInputs = [];
    customTabExactMatchCheckboxes = [];
    for (let i = 1; i < 7; i++) {
      customTabInputs.push(
        settingsContentContainer.querySelector(`#customTab${i}Url`),
      );
      customTabExactMatchCheckboxes.push(
        settingsContentContainer.querySelector(`#customTab${i}ExactMatch`),
      );
    }
  };

  /**
   * Loads settings from chrome.storage.local into the UI fields.
   */
  const loadSettings = async () => {
    const storedSettings = await chrome.storage.local.get(defaultSettings);
    currentSettings = { ...defaultSettings, ...storedSettings };

    if (enableWebNavigatorCheckbox) {
      enableWebNavigatorCheckbox.checked = currentSettings.webNavigatorEnabled;
    }
    if (searchOnNoResultsCheckbox) {
      searchOnNoResultsCheckbox.checked = currentSettings.searchOnNoResults;
    }
    if (searchMarksCheckbox) {
      searchMarksCheckbox.checked = currentSettings.searchMarksEnabled; // NEW
    }

    for (let i = 0; i < 7; i++) {
      if (customTabInputs[i]) {
        customTabInputs[i].value = currentSettings[`customTab${i + 1}Url`];
      }
      if (customTabExactMatchCheckboxes[i]) {
        customTabExactMatchCheckboxes[i].checked =
          currentSettings[`customTab${i + 1}ExactMatch`];
      }
    }
  };

  /**
   * Saves settings from the UI fields to chrome.storage.local.
   */
  const saveSettings = async () => {
    if (enableWebNavigatorCheckbox) {
      currentSettings.webNavigatorEnabled = enableWebNavigatorCheckbox.checked;
    }
    if (searchOnNoResultsCheckbox) {
      currentSettings.searchOnNoResults = searchOnNoResultsCheckbox.checked;
    }
    if (searchMarksCheckbox) {
      currentSettings.searchMarksEnabled = searchMarksCheckbox.checked; // NEW
    }

    for (let i = 0; i < 7; i++) {
      if (customTabInputs[i]) {
        currentSettings[`customTab${i + 1}Url`] =
          customTabInputs[i].value.trim();
      }
      if (customTabExactMatchCheckboxes[i]) {
        currentSettings[`customTab${i + 1}ExactMatch`] =
          customTabExactMatchCheckboxes[i].checked;
      }
    }
    await chrome.storage.local.set(currentSettings);
    // If searchMarksEnabled changes, trigger a re-search in case we're in tabSearch
    if (ViewManager.getActive() === "tabSearch") {
      performUnifiedSearch(currentQuery);
    }
  };

  /**
   * Attaches event listeners to settings elements for saving changes.
   */
  const attachSettingsEventListeners = () => {
    if (enableWebNavigatorCheckbox) {
      enableWebNavigatorCheckbox.addEventListener("change", saveSettings);
    }
    if (searchOnNoResultsCheckbox) {
      searchOnNoResultsCheckbox.addEventListener("change", saveSettings);
    }
    if (searchMarksCheckbox) {
      searchMarksCheckbox.addEventListener("change", saveSettings); // NEW
    }

    for (let i = 0; i < 7; i++) {
      if (customTabInputs[i]) {
        customTabInputs[i].addEventListener("input", saveSettings);
      }
      if (customTabExactMatchCheckboxes[i]) {
        customTabExactMatchCheckboxes[i].addEventListener(
          "change",
          saveSettings,
        );
      }
    }
  };

  /**
   * Loads settings content dynamically from settings.html.
   */
  const loadSettingsContent = async () => {
    if (!settingsContentLoaded) {
      try {
        const response = await fetch(
          chrome.runtime.getURL("html/settings.html"),
        );
        if (response.ok) {
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          const settingsHtmlContent =
            doc.querySelector(".options-container").innerHTML;
          settingsContentContainer.innerHTML = settingsHtmlContent;
          settingsContentLoaded = true;

          // IMPORTANT: Get references and attach listeners ONLY AFTER content is loaded
          getSettingsDOMElements();
          await loadSettings(); // Load the saved settings into the new UI elements
          attachSettingsEventListeners(); // Attach event listeners
        } else {
          console.error("Failed to load settings.html:", response.statusText);
          settingsContentContainer.innerHTML =
            "<p>Error loading settings content.</p>";
        }
      } catch (error) {
        console.error("Error fetching settings.html:", error);
        settingsContentContainer.innerHTML =
          "<p>Error fetching settings content.</p>";
      }
    }
  };

  /**
   * Loads help content dynamically from help.html.
   */
  const loadHelpContent = async () => {
    if (!helpContentLoaded) {
      try {
        const response = await fetch(chrome.runtime.getURL("html/help.html"));
        if (response.ok) {
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          const helpContent = doc.querySelector(".help-container").innerHTML;
          helpContentContainer.innerHTML = helpContent;
          helpContentLoaded = true;
        } else {
          console.error("Failed to load help.html:", response.statusText);
          helpContentContainer.innerHTML = "<p>Error loading help content.</p>";
        }
      } catch (error) {
        console.error("Error fetching help.html:", error);
        helpContentContainer.innerHTML = "<p>Error fetching help content.</p>";
      }
    }
  };

  /**
   * Loads Marks content dynamically from Marks/marks.html and initializes its script.
   */
  const loadMarksContent = async () => {
    if (!marksContentLoaded) {
      try {
        const response = await fetch(
          chrome.runtime.getURL("Marks/marks.html"),
        );
        if (response.ok) {
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          const marksHtmlContent =
            doc.querySelector(".marks-content").innerHTML;
          marksSection.innerHTML = marksHtmlContent;
          marksContentLoaded = true;

          // Get the current active tab's URL and title to set as defaults
          // Ensure 'tabs' permission is in manifest.json for this to work.
          const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          const currentTabUrl = activeTab ? activeTab.url : "";
          const currentTabTitle = activeTab ? activeTab.title : "";

          console.log(
            "popup.js: Calling initMarksFeature with URL:",
            currentTabUrl,
            "and Title:",
            currentTabTitle,
          );

          // Call the global initialization function from marks.js
          // This function should be defined on the window object by marks.js
          if (typeof window.initMarksFeature === "function") {
            await window.initMarksFeature(currentTabUrl, currentTabTitle); // Pass both URL and Title
            // After marks.js is initialized and bookmarks are loaded, grab them.
            // This assumes getAllBookmarks is now available on window.
            if (typeof window.getAllBookmarks === "function") {
              allMarks = window.getAllBookmarks();
            } else {
              console.error(
                "window.getAllBookmarks is not defined. Ensure Marks/marks.js is loading correctly.",
              );
            }
          } else {
            console.error(
              "window.initMarksFeature is not defined. Ensure Marks/marks.js is loaded and defines window.initMarksFeature globally.",
            );
          }
        } else {
          console.error(
            "Failed to load Marks/marks.html:",
            response.statusText,
          );
          marksSection.innerHTML = "<p>Error loading Marks content.</p>";
        }
      } catch (error) {
        console.error("Error fetching Marks/marks.html:", error);
        marksSection.innerHTML = "<p>Error fetching Marks content.</p>";
      }
    }
  };

  // --- Search & UI Rendering ---

  /**
   * Performs a unified search across tabs and (optionally) bookmarks.
   * Updates `filteredResults` and re-renders the UI.
   * @param {string} query The search query.
   */
  const performUnifiedSearch = async (query) => {
    // Fetch all tabs
    allTabs = await chrome.tabs.query({});

    let tabsToSearch = allTabs;
    let marksToSearch = [];

    // Conditionally fetch marks if setting is enabled and marks.js is initialized
    if (currentSettings.searchMarksEnabled && typeof window.getAllBookmarks === 'function') {
        allMarks = window.getAllBookmarks(); // Get the latest marks from marks.js
        marksToSearch = allMarks;
    } else {
        allMarks = []; // Clear marks if feature is disabled
    }

    const filteredTabs = fuzzySearchItems(query, tabsToSearch, "title").map(
      (tab) => ({ ...tab, type: "tab" }),
    );
    const filteredMarks = fuzzySearchItems(query, marksToSearch, "name").map(
      (mark) => ({ ...mark, type: "mark" }),
    );

    // Combine results, tabs first, then marks.
    // Consider adding a scoring/sorting mechanism for more advanced results.
    filteredResults = [...filteredTabs, ...filteredMarks];

    // Re-render the list with the updated filtered results
    renderResults(filteredResults);
  };

  /**
   * Highlights the currently selected item in the list.
   */
  const highlightSelectedItem = () => {
    const items = tabList.querySelectorAll("li");
    items.forEach((item, index) => {
      if (index === selectedIndex) {
        item.classList.add("selected");
        item.scrollIntoView({ block: "nearest", behavior: "auto" });
      } else {
        item.classList.remove("selected");
      }
    });
  };

  /**
   * Fetches all current tabs and updates the display.
   * Prioritizes restoring session state if returning to tabSearch.
   * If not restoring session state, checks for persistent short-term memory.
   * @param {number} [preferredIndex=0] The index to prefer if no state is restored.
   */
  const fetchAndDisplayResults = async (preferredIndex = 0) => {
    let loadedQuery = "";
    let loadedResults = []; // Changed from loadedTabs
    let loadedIndex = -1;

    // 1. Try to restore previous session state (for view switching)
    const lastActiveView = sessionStorage.getItem(SS_LAST_VIEW);
    const sessionState = loadSessionSearchState();

    if (lastActiveView === "tabSearch" && sessionState) {
      loadedQuery = sessionState.query;
      loadedResults = sessionState.results; // Changed from sessionState.tabs
      loadedIndex = sessionState.index;
      isPersistentQueryActive = false; // Session state doesn't count as "persistent" for this specific behavior
    } else {
      // 2. If not restoring session state, check for persistent short-term memory
      loadedQuery = loadPersistentLastQuery();
      if (loadedQuery) {
        // If a query was loaded, re-filter results based on current data
        await performUnifiedSearch(loadedQuery); // This will update filteredResults
        loadedResults = filteredResults;
        loadedIndex = 0; // Default to first item if restoring via persistent memory
        isPersistentQueryActive = true; // NEW: Set the flag here
      } else {
        // 3. No state to restore, start fresh
        loadedQuery = "";
        await performUnifiedSearch(loadedQuery); // This will update filteredResults
        loadedResults = filteredResults;
        loadedIndex = preferredIndex;
        isPersistentQueryActive = false; // NEW: Ensure flag is false
      }
    }

    currentQuery = loadedQuery;
    filteredResults = loadedResults;
    selectedIndex = loadedIndex;
    searchInput.value = currentQuery; // Set input value

    renderResults(filteredResults, selectedIndex);

    if (ViewManager.getActive() === "tabSearch") {
      searchInput.focus();
    }
  };

  /**
   * Renders the list of combined results (tabs and bookmarks) in the UI.
   * @param {Array<Object>} resultsToRender The items to display.
   * @param {number} suggestedIndex The index of the item to highlight.
   */
  const renderResults = (resultsToRender, suggestedIndex = 0) => {
    tabList.innerHTML = "";
    tabCounter.textContent = `${resultsToRender.length} results`; // Changed text

    if (
      resultsToRender.length === 0 &&
      ViewManager.getActive() === "tabSearch"
    ) {
      const noResults = document.createElement("li");
      noResults.textContent = "No matching tabs or bookmarks found."; // Changed text
      noResults.className = "no-results";
      tabList.appendChild(noResults);
      selectedIndex = -1;
      tabList.classList.remove("scrollable-content");
      return;
    } else if (resultsToRender.length > 0) {
      tabList.classList.add("scrollable-content");
    }

    resultsToRender.forEach((item, index) => {
      const listItem = document.createElement("li");
      listItem.dataset.index = index;
      // Original class name for list items
      // No specific class for tab/mark, rely on content for differentiation if needed later via CSS
      // Example: li[data-type="tab"] or li[data-type="mark"] for future styling

      const favicon = document.createElement("img");
      favicon.classList.add("favicon");
      favicon.alt = "icon"; // Set alt text for accessibility

      const titleSpan = document.createElement("span");
      titleSpan.classList.add("tab-title"); // Reverted to original class
      const urlSpan = document.createElement("span");
      urlSpan.classList.add("tab-url"); // Reverted to original class

      if (item.type === "tab") {
        listItem.dataset.tabId = item.id;
        listItem.dataset.windowId = item.windowId;
        listItem.dataset.type = "tab"; // Keep this data-attribute for potential future CSS targeting

        // Favicon logic for tabs (original logic)
        if (item.favIconUrl) {
          favicon.src = item.favIconUrl;
        } else if (
          item.url &&
          (item.url.startsWith("chrome://") || item.url.startsWith("about:"))
        ) {
          favicon.src = chrome.runtime.getURL("img/SGN256.png");
        } else {
          favicon.src = "chrome://favicon/" + item.url;
        }

        titleSpan.innerHTML = highlightText(item.title || "", currentQuery);
        urlSpan.innerHTML = highlightText(item.url || "", currentQuery);

        listItem.addEventListener("click", () =>
          switchTab(item.id, item.windowId),
        );
      } else if (item.type === "mark") {
        listItem.dataset.url = item.url;
        listItem.dataset.type = "mark"; // Keep this data-attribute for potential future CSS targeting

        // Favicon logic for bookmarks: try chrome://favicon first, then fallback to a generic
        // Ensure chrome.tabs permission is in manifest.json for chrome://favicon/ to work
        // For consistent look with tabs, we'll try to get the favicon from the bookmark's URL.
        favicon.src = "chrome://favicon/" + item.url;

        // Fallback for cases where chrome://favicon might not work or for non-web URLs
        favicon.onerror = function() {
          this.onerror = null; // IMPORTANT: Prevent infinite loop
          this.src = chrome.runtime.getURL("img/bookmark_icon.png"); // Set the fallback image
        };

        titleSpan.innerHTML = highlightText(item.name || "", currentQuery); // Use 'name' for bookmarks
        urlSpan.innerHTML = highlightText(item.url || "", currentQuery);

        listItem.addEventListener("click", () => openUrl(item.url));
      }

      listItem.appendChild(favicon);
      listItem.appendChild(titleSpan);
      listItem.appendChild(urlSpan);

      tabList.appendChild(listItem);
    });

    selectedIndex = Math.min(suggestedIndex, resultsToRender.length - 1);
    selectedIndex = Math.max(-1, selectedIndex); // Ensure selectedIndex is not less than -1

    if (selectedIndex !== -1) {
      highlightSelectedItem();
    }
  };

  /**
   * Deletes the currently selected result if it's a tab.
   * Ignores bookmarks.
   */
  const deleteSelectedTab = async () => {
    if (selectedIndex !== -1 && filteredResults[selectedIndex]) {
      const selectedItem = filteredResults[selectedIndex];

      if (selectedItem.type === "tab") {
        const oldSelectedIndex = selectedIndex;

        await chrome.tabs.remove(selectedItem.id);

        // Re-query and re-filter after deletion
        await performUnifiedSearch(currentQuery);

        let newSelectedIndex = -1;
        if (filteredResults.length === 0) {
          newSelectedIndex = -1;
        } else if (oldSelectedIndex < filteredResults.length) {
          newSelectedIndex = oldSelectedIndex;
        } else {
          newSelectedIndex = filteredResults.length - 1;
        }
        newSelectedIndex = Math.max(-1, newSelectedIndex);

        renderResults(filteredResults, newSelectedIndex);
        searchInput.focus();
      } else {
        // If it's a mark, log that deletion is not supported from this view, or simply do nothing.
        console.log("Cannot delete bookmark from search results view.");
        // Optionally, you could show a temporary message to the user.
      }
    }
  };

  /**
   * Deletes all currently filtered results if they are tabs.
   * Ignores bookmarks.
   */
  const deleteAllFilteredTabs = async () => {
    const tabIdsToDelete = filteredResults
      .filter((item) => item.type === "tab")
      .map((item) => item.id);

    if (tabIdsToDelete.length > 0) {
      await chrome.tabs.remove(tabIdsToDelete);

      // Re-query and re-filter after deletion
      await performUnifiedSearch(currentQuery);

      if (filteredResults.length === 0) {
        renderResults(filteredResults, -1);
      } else {
        renderResults(filteredResults, 0);
      }
      searchInput.focus();
    }
  };

  // --- Event Listeners ---

  // Global keyboard shortcuts for View switching
  document.addEventListener("keydown", async (e) => {
    // Prioritize specific Alt key combinations
    if (e.altKey && e.key === "F1") {
      e.preventDefault();
      const extensionsUrl = "chrome://extensions/";
      focusOrCreateTabByUrl(extensionsUrl);
      clearPersistentLastQuery(); // Clear memory on specific navigation actions
    } else if (e.altKey && e.key === "F2") {
      e.preventDefault();
      const shortcutsUrl =
        typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
          ? "chrome://extensions/shortcuts" // Chromium
          : "about:addons"; // Firefox
      focusOrCreateTabByUrl(shortcutsUrl);
      clearPersistentLastQuery(); // Clear memory on specific navigation actions
    }
    // Then handle regular F-keys
    else if (e.key === "F1") {
      e.preventDefault();
      await ViewManager.toggle("settings", loadSettingsContent);
    } else if (e.key === "F2") {
      e.preventDefault();
      await ViewManager.toggle("help", loadHelpContent);
    } else if (e.key === "F3") {
      e.preventDefault();
      await ViewManager.toggle("marks", loadMarksContent);
    } else if (e.key === "F4") {
      e.preventDefault();
      const shortcutsUrl =
        typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
          ? "chrome://extensions/shortcuts" // Chromium
          : "about:addons"; // Firefox
      focusOrCreateTabByUrl(shortcutsUrl);
      clearPersistentLastQuery(); // Clear memory if user goes to shortcuts
    } else if (e.key >= "1" && e.key <= "4" && e.altKey) {
      e.preventDefault();
      const index = parseInt(e.key) - 1;
      chrome.runtime
        .sendMessage({
          action: "executeMoveTabCommand",
          command: "moveCurrentTabToPosition",
          index: index,
        })
        .then(() => fetchAndDisplayResults(selectedIndex))
        .catch(console.error);
    } else if (e.key === "ArrowLeft" && e.altKey) {
      e.preventDefault();
      chrome.runtime
        .sendMessage({
          action: "executeMoveTabCommand",
          command: "moveCurrentTabLeft",
        })
        .then(() => fetchAndDisplayResults(selectedIndex))
        .catch(console.error);
    } else if (e.key === "ArrowRight" && e.altKey) {
      e.preventDefault();
      chrome.runtime
        .sendMessage({
          action: "executeMoveTabCommand",
          command: "moveCurrentTabRight",
        })
        .then(() => fetchAndDisplayResults(selectedIndex))
        .catch(console.error);
    }
  });

  // Keyboard navigation within the main tab search view
  searchInput.addEventListener("keydown", (e) => {
    // Only process navigation keys if the tabSearch view is active
    if (ViewManager.getActive() !== "tabSearch") {
      return;
    }

    // *** NEW LOGIC FOR HANDLING FIRST KEYSTROKE AFTER PERSISTENT QUERY LOAD ***
    if (isPersistentQueryActive) {
      // Check for printable characters (most common scenario for new input)
      // e.key.length === 1 covers letters, numbers, symbols but excludes 'Enter', 'ArrowUp', 'Shift', etc.
      // Exclude modifier keys (Ctrl, Alt, Meta) from this logic.
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault(); // Prevent default character input
        searchInput.value = e.key; // Set input to JUST the new character
        currentQuery = e.key; // Update internal state
        isPersistentQueryActive = false; // Reset the flag, new search has started
        clearPersistentLastQuery(); // Clear from local storage
        performUnifiedSearch(currentQuery); // Use new unified search
        return; // Stop further keydown processing for this event
      }
      // Handle Backspace/Delete explicitly to clear the whole field
      else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault(); // Prevent default action (single char deletion)
        searchInput.value = ""; // Clear the entire input
        currentQuery = ""; // Clear internal state
        isPersistentQueryActive = false; // Reset the flag
        clearPersistentLastQuery(); // Clear from local storage
        performUnifiedSearch(currentQuery); // Use new unified search
        return; // Stop further keydown processing
      }
    }
    // *** END NEW LOGIC ***

    const items = tabList.querySelectorAll("li");

    if (e.key === "ArrowDown" || (e.altKey && e.key === "j")) {
      e.preventDefault();
      if (items.length > 0) {
        selectedIndex = (selectedIndex + 1) % items.length;
        highlightSelectedItem();
      }
    } else if (e.key === "ArrowUp" || (e.altKey && e.key === "k")) {
      e.preventDefault();
      if (items.length > 0) {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        highlightSelectedItem();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex !== -1 && filteredResults[selectedIndex]) {
        const selectedItem = filteredResults[selectedIndex];
        if (selectedItem.type === "tab") {
          switchTab(selectedItem.id, selectedItem.windowId);
        } else if (selectedItem.type === "mark") {
          openUrl(selectedItem.url);
        }
        // Clear both session and persistent state on successful selection activation
        clearSessionSearchState();
        clearPersistentLastQuery();
      } else if (currentQuery.length > 0 && filteredResults.length === 0) {
        if (currentSettings.searchOnNoResults) {
          const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(currentQuery)}`;
          chrome.tabs.create({ url: googleSearchUrl }, () => window.close());
          // Clear both session and persistent state after opening search
          clearSessionSearchState();
          clearPersistentLastQuery();
        }
      } else {
        window.close(); // Close if no selection and no query
        // Clear both session and persistent state on close
        clearSessionSearchState();
        clearPersistentLastQuery();
      }
    } else if (e.key === "Delete" || (e.ctrlKey && e.key === "d")) {
      e.preventDefault();
      deleteSelectedTab(); // This now only deletes selected tabs
    } else if (e.ctrlKey && e.shiftKey && e.key === "D") {
      e.preventDefault();
      deleteAllFilteredTabs(); // This now only deletes all filtered tabs
    }
  });

  // Handle search input for the main tabSearch view
  searchInput.addEventListener("input", () => {
    if (ViewManager.getActive() === "tabSearch") {
      currentQuery = searchInput.value.trim();
      performUnifiedSearch(currentQuery); // Use new unified search
    }
  });

  // Save the current query and timestamp to localStorage when the popup is about to close
  window.addEventListener("beforeunload", () => {
    if (ViewManager.getActive() === "tabSearch" && currentQuery.length > 0) {
      savePersistentLastQuery();
    } else {
      // If not in tabSearch or query is empty, ensure persistent memory is cleared
      clearPersistentLastQuery();
    }
    // Session state is handled by ViewManager.show() already
  });

  // --- Initialization ---
  // Load settings first as they might influence initial behavior
  loadSettings().then(async () => {
    // Load marks content eagerly if searchMarksEnabled is true to ensure bookmarks are available for search
    // This is important because initMarksFeature and getAllBookmarks are asynchronous
    if (currentSettings.searchMarksEnabled) {
      await loadMarksContent(); // Ensure marks are loaded and getAllBookmarks is callable
    }

    // Determine the initial view based on sessionStorage, or default to tabSearch
    const initialView = sessionStorage.getItem(SS_LAST_VIEW) || "tabSearch";
    // Show the initial view (will handle session state restoration if tabSearch)
    ViewManager.show(initialView, initialView === "tabSearch");

    // Fetch and display results (will use restored session state or persistent memory if available)
    fetchAndDisplayResults();
  });
});
