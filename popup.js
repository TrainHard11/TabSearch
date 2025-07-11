// popup.js
document.addEventListener("DOMContentLoaded", async () => {
  // --- Constants and DOM Element References ---
  const LS_PREFIX = "fuzzyTabSearch_"; // Local storage prefix for all keys
  const LS_LAST_QUERY_PERSISTENT = `${LS_PREFIX}lastQueryPersistent`;
  const LS_LAST_QUERY_TIMESTAMP = `${LS_PREFIX}lastQueryTimestamp`;

  // Constants for view state management (using chrome.storage.session for current session)
  const SS_LAST_QUERY_SESSION = `${LS_PREFIX}lastQuerySession`;
  const SS_FILTERED_RESULTS_SESSION = `${LS_PREFIX}filteredResultsSession`;
  const SS_SELECTED_INDEX_SESSION = `${LS_PREFIX}selectedIndexSession`;
  const SS_LAST_VIEW = `${LS_PREFIX}lastView`;

  // Key for commanding the initial view upon popup opening (stored in chrome.storage.session)
  const COMMAND_INITIAL_VIEW_KEY = `${LS_PREFIX}commandInitialView`;
  // Key to store the URL of the bookmark to focus after adding/findng it
  const INITIAL_MARK_URL_KEY = `${LS_PREFIX}initialMarkUrl`;
  // Key to store the URL of the harpooned item to focus after adding/finding it
  const INITIAL_HARPOON_URL_KEY = `${LS_PREFIX}initialHarpoonUrl`;

  const SEARCH_MEMORY_DURATION_MS = 10 * 1000; // 10 seconds

  // tabSearch View:
  const searchArea = document.querySelector(".search-area");
  const searchInput = document.getElementById("searchInput");
  const tabCounter = document.getElementById("tabCounter");
  const tabList = document.getElementById("tabList");
  const infoText = document.querySelector(".info-text");
  // Views IDs:
  const SettingsSection = document.getElementById("SettingsSection");
  const MarksSection = document.getElementById("MarksSection");
  const HarpoonSection = document.getElementById("HarpoonSection");
  const tabManagerSection = document.getElementById("tabManagerSection");
  const HelpSection = document.getElementById("HelpSection");

  // === User options from Settings view: ===

  //General Settings:
  let enableWebNavigator_Checkbox;
  let searchOnNoResults_Checkbox;
  // Marks view:
  let showMarksInTabSearch_Checkbox;
  let showAddMenuUIforMarks_Checkbox;
  let showSearchUIforMarks_Checkbox;

  let closePopupAfterMoveTabManager_Checkbox;

  // Those 7 custom field inputs:
  let customTabFields = [];
  let customTabExactMatchCheckboxes = [];

  // --- State Variables ---
  let allTabs = []; // Holds all active browser tabs
  let allMarks = []; // Holds all user-defined bookmarks
  let filteredResults = []; // Holds combined and filtered tabs/marks
  let selectedIndex = -1;
  let currentQuery = "";
  let helpContentLoaded = false;
  let settingsContentLoaded = false;
  let marksContentLoaded = false;
  let harpoonContentLoaded = false;
  let tabManagementContentLoaded = false; // Flag for Tab Management content

  // Flag to indicate if the current searchInput value came from a persistent query
  let isPersistentQueryActive = false;

  // New: Store the ID of the window from which the popup was opened
  let currentWindowId = null;

  // Default settings
  const defaultSettings = {
    webNavigatorEnabled: true,
    searchOnNoResults: true,
    searchMarksEnabled: true,
    enableMarksAddition: true,
    alwaysShowMarksSearchInput: false,
    closePopupAfterMoveTabManager: false,
    showOnlyCurrentWindowTabs: false, // Default to showing all tabs
    customTab1Url: "",
    customTab1ExactMatch: false,
    customTab2Url: "",
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
      // Escape special characters in the word for use in a RegExp constructor
      // This regex escapes characters that have special meaning in regular expressions
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

      const matchesTitle = queryWords.every((word) => itemTitle.includes(word));
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
   * This function now directly handles tab operations without messaging background.
   * @param {string} url The URL to open or switch to.
   * @param {boolean} [exactMatch=false] Whether to match the URL exactly or partially.
   */
  window.focusOrCreateTabByUrl = (url, exactMatch = false) => {
    // Made global for harpoon.js and marks.js access
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
      );
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
      );
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
    sessionStorage.removeItem(SS_FILTERED_RESULTS_SESSION);
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
        container: SettingsSection,
        content: SettingsSection,
      },
      help: { container: HelpSection, content: HelpSection },
      marks: { container: MarksSection, content: MarksSection },
      harpoon: { container: HarpoonSection, content: HarpoonSection },
      // Tab Management view definition
      tabManagement: {
        container: tabManagerSection,
        content: tabManagerSection,
      },
    };

    const hideAllViews = () => {
      Object.values(viewElements).forEach((view) => {
        // Hide the main container for the view
        view.container.classList.add("hidden");

        // Explicitly hide the content element if it's distinct from the container
        // The tabList for 'tabSearch' is a sibling of searchInput, so it needs to be hidden too.
        // The 'content' property in viewElements ensures we hide the right part.
        if (view.content && view.content !== view.container) {
          view.content.classList.add("hidden");
        }

        // Hide info text if it exists
        if (view.info) {
          view.info.classList.add("hidden");
        }
        // Also remove scrollable-content class when hiding
        if (view.content) {
          view.content.classList.remove("scrollable-content");
        }
      });
      // When hiding views, detach Harpoon listeners if they were active
      if (typeof window.detachHarpoonListeners === "function") {
        window.detachHarpoonListeners();
      }
      // Detach Marks listeners if they were active
      if (typeof window.detachMarksListeners === "function") {
        window.detachMarksListeners();
      }
      // Detach Tab Management listeners if they were active
      if (typeof window.detachTabManagerListeners === "function") {
        window.detachTabManagerListeners();
      }
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

      hideAllViews(); // This now explicitly hides all containers and relevant content elements

      activeView = viewName;
      sessionStorage.setItem(SS_LAST_VIEW, activeView); // Persist active view for session

      const { container, content, info } = viewElements[viewName];

      // Show the new active view's container
      container.classList.remove("hidden");
      // Explicitly show the content element if it's distinct from the container
      if (content && content !== container) {
        content.classList.remove("hidden");
      }

      if (content) {
        content.classList.add("scrollable-content");
      }
      if (info) {
        info.classList.remove("hidden");
      }

      // Specific actions after showing a view
      if (viewName === "tabSearch") {
        searchInput.focus(); // Focus search input for tab search
        updateSearchInputColor(); // Update color based on current search mode
        // The renderResults function will be called by fetchAndDisplayResults which handles restoring.
      } else if (viewName === "harpoon") {
        // Do not focus searchInput when in harpoon view
        // Let harpoon.js manage its own focus after rendering
        if (typeof window.refreshHarpoonedTabs === "function") {
          window.refreshHarpoonedTabs(); // Refresh list and set focus after view is shown
        }
        // Attach Harpoon-specific listeners
        if (typeof window.attachHarpoonListeners === "function") {
          window.attachHarpoonListeners();
        }
      } else if (viewName === "marks") {
        // Attach Marks-specific listeners
        if (typeof window.attachMarksListeners === "function") {
          window.attachMarksListeners();
        }
        // The refreshMarks call is now handled by attachMarksListeners for initial focus management
        if (typeof window.refreshMarks === "function") {
          window.refreshMarks(); // Ensure marks are re-rendered
        }
        // Apply the setting for add section visibility
        if (typeof window.toggleMarksAddSection === "function") {
          window.toggleMarksAddSection(currentSettings.enableMarksAddition);
        }
        // Apply the setting for search input visibility
        if (typeof window.toggleMarksSearchInputAlwaysVisible === "function") {
          window.toggleMarksSearchInputAlwaysVisible(
            currentSettings.alwaysShowMarksSearchInput,
          );
        }
      } else if (viewName === "tabManagement") {
        // Tab Management view actions
        if (typeof window.attachTabManagerListeners === "function") {
          window.attachTabManagerListeners();
        }
        // If tabManager.js has an init function for content, call it here
        if (typeof window.initTabManagerFeature === "function") {
          // Pass the actual DOM container element AND currentSettings
          window.initTabManagerFeature(
            tabManagerSection,
            currentSettings, // Pass all current settings
          );
        }
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
    enableWebNavigator_Checkbox = SettingsSection.querySelector(
      "#enableWebNavigator",
    );
    searchOnNoResults_Checkbox =
      SettingsSection.querySelector("#searchOnNoResults");
    showMarksInTabSearch_Checkbox = SettingsSection.querySelector(
      "#showMarksInTabSearch_Checkbox",
    );
    showAddMenuUIforMarks_Checkbox = SettingsSection.querySelector(
      "#enableMarksAddition",
    );
    showSearchUIforMarks_Checkbox = SettingsSection.querySelector(
      "#alwaysShowMarksSearchInput",
    );
    // Get reference for the new checkbox
    closePopupAfterMoveTabManager_Checkbox = SettingsSection.querySelector(
      "#closePopupAfterMoveTabManager",
    );
    // No dedicated checkbox for showOnlyCurrentWindowTabs, it's keymap controlled
    customTabFields = [];
    customTabExactMatchCheckboxes = [];
    for (let i = 1; i <= 7; i++) {
      customTabFields.push(SettingsSection.querySelector(`#customTab${i}Url`));
      customTabExactMatchCheckboxes.push(
        SettingsSection.querySelector(`#customTab${i}ExactMatch`),
      );
    }
  };

  /**
   * Loads settings from chrome.storage.local into the UI fields.
   */
  const loadSettings = async () => {
    const storedSettings = await chrome.storage.local.get(defaultSettings);
    currentSettings = { ...defaultSettings, ...storedSettings };

    if (enableWebNavigator_Checkbox) {
      enableWebNavigator_Checkbox.checked = currentSettings.webNavigatorEnabled;
    }
    if (searchOnNoResults_Checkbox) {
      searchOnNoResults_Checkbox.checked = currentSettings.searchOnNoResults;
    }
    if (showMarksInTabSearch_Checkbox) {
      showMarksInTabSearch_Checkbox.checked =
        currentSettings.searchMarksEnabled;
    }
    if (showAddMenuUIforMarks_Checkbox) {
      showAddMenuUIforMarks_Checkbox.checked =
        currentSettings.enableMarksAddition;
    }
    if (showSearchUIforMarks_Checkbox) {
      showSearchUIforMarks_Checkbox.checked =
        currentSettings.alwaysShowMarksSearchInput;
    }
    // Load the new setting
    if (closePopupAfterMoveTabManager_Checkbox) {
      closePopupAfterMoveTabManager_Checkbox.checked =
        currentSettings.closePopupAfterMoveTabManager;
    }

    for (let i = 0; i < 7; i++) {
      if (customTabFields[i]) {
        customTabFields[i].value = currentSettings[`customTab${i + 1}Url`];
      }
      if (customTabExactMatchCheckboxes[i]) {
        customTabExactMatchCheckboxes[i].checked =
          currentSettings[`customTab${i + 1}ExactMatch`];
      }
    }
    // Update the search input color immediately after settings are loaded
    updateSearchInputColor();
  };

  /**
   * Saves settings from the UI fields to chrome.storage.local.
   */
  const saveSettings = async () => {
    if (enableWebNavigator_Checkbox) {
      currentSettings.webNavigatorEnabled = enableWebNavigator_Checkbox.checked;
    }
    if (searchOnNoResults_Checkbox) {
      currentSettings.searchOnNoResults = searchOnNoResults_Checkbox.checked;
    }
    if (showMarksInTabSearch_Checkbox) {
      currentSettings.searchMarksEnabled =
        showMarksInTabSearch_Checkbox.checked;
    }
    if (showAddMenuUIforMarks_Checkbox) {
      currentSettings.enableMarksAddition =
        showAddMenuUIforMarks_Checkbox.checked;
    }
    if (showSearchUIforMarks_Checkbox) {
      currentSettings.alwaysShowMarksSearchInput =
        showSearchUIforMarks_Checkbox.checked;
    }
    // Save the new setting
    if (closePopupAfterMoveTabManager_Checkbox) {
      currentSettings.closePopupAfterMoveTabManager =
        closePopupAfterMoveTabManager_Checkbox.checked;
    }

    // FIX: Capture values from custom URL input fields before saving
    for (let i = 0; i < 7; i++) {
      if (customTabFields[i]) {
        currentSettings[`customTab${i + 1}Url`] = customTabFields[i].value;
      }
      // Exact match checkbox is already handled below, but this ensures consistency
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
    // If enableMarksAddition changes AND Marks view is active, update its display
    if (
      ViewManager.getActive() === "marks" &&
      typeof window.toggleMarksAddSection === "function"
    ) {
      window.toggleMarksAddSection(currentSettings.enableMarksAddition);
    }

    // If alwaysShowMarksSearchInput changes AND Marks view is active, update its display
    if (
      ViewManager.getActive() === "marks" &&
      typeof window.toggleMarksSearchInputAlwaysVisible === "function"
    ) {
      window.toggleMarksSearchInputAlwaysVisible(
        currentSettings.alwaysShowMarksSearchInput,
      );
    }
    // If the new setting for Tab Management changes, update the variable in tabManager.js
    if (ViewManager.getActive() === "tabManagement") {
      if (typeof window.setTabManagerClosePopupSetting === "function") {
        window.setTabManagerClosePopupSetting(
          currentSettings.closePopupAfterMoveTabManager,
        );
      }
    }
  };

  /**
   * Attaches event listeners to settings elements for saving changes.
   */
  const attachSettingsEventListeners = () => {
    if (enableWebNavigator_Checkbox) {
      enableWebNavigator_Checkbox.addEventListener("change", saveSettings);
    }
    if (searchOnNoResults_Checkbox) {
      searchOnNoResults_Checkbox.addEventListener("change", saveSettings);
    }
    if (showMarksInTabSearch_Checkbox) {
      showMarksInTabSearch_Checkbox.addEventListener("change", saveSettings);
    }
    if (showAddMenuUIforMarks_Checkbox) {
      showAddMenuUIforMarks_Checkbox.addEventListener("change", saveSettings);
    }
    if (showSearchUIforMarks_Checkbox) {
      showSearchUIforMarks_Checkbox.addEventListener("change", saveSettings);
    }
    // Attach listener for the new checkbox
    if (closePopupAfterMoveTabManager_Checkbox) {
      closePopupAfterMoveTabManager_Checkbox.addEventListener(
        "change",
        saveSettings,
      );
    }

    for (let i = 0; i < 7; i++) {
      if (customTabFields[i]) {
        customTabFields[i].addEventListener("input", saveSettings);
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
        const response = await fetch(chrome.runtime.getURL("settings.html"));
        if (response.ok) {
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          // Assuming settings.html uses a top-level .options-container
          const settingsHtmlContent =
            doc.querySelector(".options-container").innerHTML;
          SettingsSection.innerHTML = settingsHtmlContent;
          settingsContentLoaded = true;

          // IMPORTANT: Get references and attach listeners ONLY AFTER content is loaded
          getSettingsDOMElements();
          await loadSettings(); // Load the saved settings into the new UI elements
          attachSettingsEventListeners(); // Attach event listeners
        } else {
          console.error("Failed to load settings.html:", response.statusText);
          SettingsSection.innerHTML = "<p>Error loading settings content.</p>";
        }
      } catch (error) {
        console.error("Error fetching settings.html:", error);
        SettingsSection.innerHTML = "<p>Error fetching settings content.</p>";
      }
    }
  };

  /**
   * Loads help content dynamically from help.html.
   */
  const loadHelpContent = async () => {
    if (!helpContentLoaded) {
      try {
        const response = await fetch(chrome.runtime.getURL("help/help.html"));
        if (response.ok) {
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          const helpContent = doc.querySelector(".help-container").innerHTML;
          HelpSection.innerHTML = helpContent;
          helpContentLoaded = true;
        } else {
          console.error("Failed to load help.html:", response.statusText);
          HelpSection.innerHTML = "<p>Error loading help content.</p>";
        }
      } catch (error) {
        console.error("Error fetching help.html:", error);
        HelpSection.innerHTML = "<p>Error fetching help content.</p>";
      }
    }
  };

  /**
   * Loads Marks content dynamically from Marks/marks.html and initializes its script.
   */
  const loadMarksContent = async () => {
    if (!marksContentLoaded) {
      try {
        const response = await fetch(chrome.runtime.getURL("Marks/marks.html"));
        if (response.ok) {
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          const marksHtmlContent =
            doc.querySelector(".marks-content").innerHTML;
          MarksSection.innerHTML = marksHtmlContent;
          marksContentLoaded = true;

          // Get the current active tab's URL and title to set as defaults
          // Ensure 'tabs' permission is in manifest.json for this to work.
          const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          const currentTabUrl = activeTab ? activeTab.url : "";
          const currentTabTitle = activeTab ? activeTab.title : "";

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
          MarksSection.innerHTML = "<p>Error loading Marks content.</p>";
        }
      } catch (error) {
        console.error("Error fetching Marks/marks.html:", error);
        MarksSection.innerHTML = "<p>Error fetching Marks content.</p>";
      }
    }
  };

  /**
   * Loads Harpoon content dynamically from Harpoon/harpoon.html and initializes its script.
   */
  const loadHarpoonContent = async () => {
    if (!harpoonContentLoaded) {
      try {
        const response = await fetch(
          chrome.runtime.getURL("Harpoon/harpoon.html"),
        );
        if (response.ok) {
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          const harpoonHtmlContent =
            doc.querySelector(".harpoon-content").innerHTML;
          HarpoonSection.innerHTML = harpoonHtmlContent;
          harpoonContentLoaded = true;

          if (typeof window.initHarpoonFeature === "function") {
            await window.initHarpoonFeature();
          } else {
            console.error(
              "window.initHarpoonFeature is not defined. Ensure Harpoon/harpoon.js is loaded and defines window.initHarpoonFeature globally.",
            );
          }
        } else {
          console.error(
            "Failed to load Harpoon/harpoon.html:",
            response.statusText,
          );
          HarpoonSection.innerHTML = "<p>Error loading Harpoon content.</p>";
        }
      } catch (error) {
        console.error("Error fetching Harpoon/harpoon.html:", error);
        HarpoonSection.innerHTML = "<p>Error fetching Harpoon content.</p>";
      }
    }
  };

  /**
   * Loads Tab Management content dynamically from tabManager/tabManager.html and initializes its script.
   */
  const loadTabManagementContent = async () => {
    if (!tabManagementContentLoaded) {
      try {
        const response = await fetch(
          chrome.runtime.getURL("tabManager/tabManager.html"),
        );
        if (response.ok) {
          const html = await response.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, "text/html");
          // Extract content from the <body>, not a specific wrapper div
          const tabManagerHtmlContent = doc.body.innerHTML;
          tabManagerSection.innerHTML = tabManagerHtmlContent;
          tabManagementContentLoaded = true;

          if (typeof window.initTabManagerFeature === "function") {
            // Pass the actual DOM container element AND currentSettings
            await window.initTabManagerFeature(
              tabManagerSection,
              currentSettings,
            );
          } else {
            console.error(
              "window.initTabManagerFeature is not defined. Ensure tabManager/tabManager.js is loaded and defines window.initTabManagerFeature globally.",
            );
          }
        } else {
          console.error(
            "Failed to load tabManager/tabManager.html:",
            response.statusText,
          );
          tabManagerSection.innerHTML =
            "<p>Error loading Tab Management content.</p>";
        }
      } catch (error) {
        console.error("Error fetching tabManager/tabManager.html:", error);
        tabManagerSection.innerHTML =
          "<p>Error fetching Tab Management content.</p>";
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

    // Filter tabs based on 'showOnlyCurrentWindowTabs' setting
    if (currentSettings.showOnlyCurrentWindowTabs && currentWindowId !== null) {
      tabsToSearch = allTabs.filter((tab) => tab.windowId === currentWindowId);
    }

    let marksToSearch = [];

    // First, check if the setting to include bookmarks is enabled.
    if (currentSettings.searchMarksEnabled) {
      // If enabled, we must ensure the marks content and script are loaded.
      // The loadMarksContent function has a check to prevent it from running more than once.
      if (!marksContentLoaded) {
        await loadMarksContent();
      }

      // Now that we have attempted to load the content, we can safely check for
      // the existence of the getAllBookmarks function and use it.
      if (typeof window.getAllBookmarks === "function") {
        const allRawMarks = window.getAllBookmarks(); // Get ALL marks from marks.js
        // Filter marks based on the per-bookmark searchableInTabSearch property
        marksToSearch = allRawMarks.filter(
          (mark) => mark.searchableInTabSearch === true,
        );
      } else {
        // This is a fallback in case loading the marks script failed for some reason.
        console.warn(
          "Bookmarks search is enabled, but the getAllBookmarks function is not available.",
        );
        allMarks = [];
      }
    } else {
      // If the setting is disabled, ensure the marks list is empty.
      allMarks = [];
    }

    const filteredTabsRaw = fuzzySearchItems(query, tabsToSearch, "title").map(
      (tab) => ({ ...tab, type: "tab" }),
    );
    const filteredMarksRaw = fuzzySearchItems(query, marksToSearch, "name").map(
      (mark) => ({ ...mark, type: "mark" }),
    );

    const combinedResults = [];
    const markUrlsAdded = new Set();

    // Add filtered marks first and track their URLs
    filteredMarksRaw.forEach((mark) => {
      if (mark.url && !markUrlsAdded.has(mark.url)) {
        combinedResults.push(mark);
        markUrlsAdded.add(mark.url);
      }
    });

    // Add filtered tabs, preventing duplicates if a mark with the same URL exists.
    filteredTabsRaw.forEach((tab) => {
      if (!tab.url || !markUrlsAdded.has(tab.url)) {
        combinedResults.push(tab);
      }
    });

    filteredResults = combinedResults;

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
    let loadedResults = [];
    let loadedIndex = -1;

    // 1. Try to restore previous session state (for view switching)
    const lastActiveView = sessionStorage.getItem(SS_LAST_VIEW);
    const sessionState = loadSessionSearchState();

    if (lastActiveView === "tabSearch" && sessionState) {
      loadedQuery = sessionState.query;
      loadedResults = sessionState.results;
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
        isPersistentQueryActive = true;
      } else {
        // 3. No state to restore, start fresh
        loadedQuery = "";
        await performUnifiedSearch(loadedQuery); // This will update filteredResults
        loadedResults = filteredResults;
        loadedIndex = preferredIndex;
        isPersistentQueryActive = false;
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
    tabCounter.textContent = `${resultsToRender.length} results`;

    // Update info text to show current window filtering status
    if (currentSettings.showOnlyCurrentWindowTabs) {
      infoText.textContent = `Showing ${resultsToRender.length} results (current window)`;
    } else {
      infoText.textContent = `Showing ${resultsToRender.length} results (all windows)`;
    }


    if (
      resultsToRender.length === 0 &&
      ViewManager.getActive() === "tabSearch"
    ) {
      const noResults = document.createElement("li");
      noResults.textContent = "No matching tabs or bookmarks found.";
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
      listItem.classList.add("tab-item"); // Apply base styling

      const favicon = document.createElement("img");
      favicon.classList.add("favicon");
      favicon.alt = "icon"; // Set alt text for accessibility

      const titleSpan = document.createElement("span");
      titleSpan.classList.add("tab-title");
      const urlSpan = document.createElement("span");
      urlSpan.classList.add("tab-url");

      if (item.type === "tab") {
        listItem.dataset.tabId = item.id;
        listItem.dataset.windowId = item.windowId;
        listItem.dataset.type = "tab";

        // Favicon logic for tabs (original logic)
        if (item.favIconUrl) {
          favicon.src = item.favIconUrl;
        } else if (
          item.url &&
          (item.url.startsWith("chrome://") || item.url.startsWith("about:"))
        ) {
          favicon.src = chrome.runtime.getURL("img/icon.png");
        } else {
          try {
            favicon.src = `chrome://favicon/${new URL(item.url).hostname}`;
          } catch (e) {
            favicon.src = chrome.runtime.getURL("img/icon.png"); // Fallback for invalid URLs
          }
        }

        titleSpan.innerHTML = highlightText(item.title || "", currentQuery);
        urlSpan.innerHTML = highlightText(item.url || "", currentQuery);

        listItem.addEventListener("click", () =>
          switchTab(item.id, item.windowId),
        );
      } else if (item.type === "mark") {
        listItem.dataset.url = item.url;
        listItem.dataset.exactMatch = item.exactMatch; // Store exactMatch status
        listItem.dataset.type = "mark";

        // Set bookmark icon
        favicon.src = chrome.runtime.getURL("img/bookmark.png");

        // Use 'name' for bookmarks, append exact match status to title for display
        titleSpan.innerHTML = highlightText(item.name || "", currentQuery);
        if (item.exactMatch) {
          titleSpan.innerHTML +=
            ' <span class="exact-match-label">[Exact Match]</span>';
        }
        urlSpan.innerHTML = highlightText(item.url || "", currentQuery);

        listItem.addEventListener("click", () => {
          // Pass the exactMatch property when activating the bookmark
          focusOrCreateTabByUrl(item.url, item.exactMatch);
        });
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
   * Toggles the 'local-search-active' class on the search input based on the setting.
   */
  const updateSearchInputColor = () => {
    if (currentSettings.showOnlyCurrentWindowTabs) {
      searchInput.classList.add("local-search-active");
    } else {
      searchInput.classList.remove("local-search-active");
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

  /**
   * Closes all tabs below the currently highlighted tab within the same window.
   * Only applies to items of type 'tab'.
   */
  const closeTabsBelowHighlighted = async () => {
    if (selectedIndex === -1 || !filteredResults[selectedIndex]) {
      console.log("No tab highlighted to close tabs below.");
      return; // No tab is highlighted
    }

    const highlightedItem = filteredResults[selectedIndex];

    // Ensure the highlighted item is a tab
    if (highlightedItem.type !== "tab") {
      console.log("Highlighted item is not a tab. Skipping 'close tabs below'.");
      return;
    }

    const highlightedTabWindowId = highlightedItem.windowId;
    const tabIdsToClose = [];

    // Iterate through filtered results AFTER the highlighted index
    for (let i = selectedIndex + 1; i < filteredResults.length; i++) {
      const item = filteredResults[i];
      // Collect only tabs that are in the same window
      if (item.type === "tab" && item.windowId === highlightedTabWindowId) {
        tabIdsToClose.push(item.id);
      }
    }

    if (tabIdsToClose.length > 0) {
      console.log(`Closing tabs: ${tabIdsToClose.join(', ')} from window ${highlightedTabWindowId}`);
      try {
        await chrome.tabs.remove(tabIdsToClose);
        // After closing tabs, refresh the list
        await performUnifiedSearch(currentQuery);
        // Maintain selection if possible, or move it to the last item if current becomes invalid
        let newSelectedIndex = Math.min(selectedIndex, filteredResults.length - 1);
        newSelectedIndex = Math.max(-1, newSelectedIndex); // Ensure it's not less than -1
        renderResults(filteredResults, newSelectedIndex);
        searchInput.focus();
      } catch (error) {
        console.error("Error closing tabs:", error);
      }
    } else {
      console.log("No tabs found below the highlighted tab in the same window to close.");
    }
  };


  // --- Event Listeners ---

  // Global keyboard shortcuts for View switching and tab/bookmark movement
  document.addEventListener("keydown", async (e) => {
    // Define selectedItem and isItemHighlighted at the beginning of the event listener
    const selectedItem =
      selectedIndex !== -1 ? filteredResults[selectedIndex] : null;
    const isItemHighlighted = selectedItem !== null;

    // Only process these shortcuts if NOT in the harpoon or marks view,
    // as harpoon.js and marks.js will handle their own specific keydowns.
    if (
      ViewManager.getActive() !== "harpoon" &&
      ViewManager.getActive() !== "marks" &&
      ViewManager.getActive() !== "tabManagement"
    ) {
      if (e.ctrlKey) {
        let targetIndex = -1;
        if (e.key === "1") {
          targetIndex = 0; // First position (0-indexed)
        } else if (e.key === "2") {
          targetIndex = 1; // Second position
        } else if (e.key === "3") {
          targetIndex = 2; // Third position
        } else if (e.key === "4") {
          targetIndex = 3; // Fourth position
        }

        if (targetIndex !== -1) {
          if (isItemHighlighted) {
            // Only attempt to move if an item is highlighted
            e.preventDefault(); // Prevent default browser action for Ctrl+#

            // Prepare data to send to background script
            const messageData = {
              action: "executeMoveTabCommand",
              command: "moveHighlightedItem", // Generic command for moving items
              itemUrl: selectedItem.url,
              exactMatch:
                selectedItem.type === "mark"
                  ? selectedItem.exactMatch || false
                  : false, // Only bookmarks have exactMatch property
              targetIndex: targetIndex,
            };

            try {
              const response = await chrome.runtime.sendMessage(messageData);
              if (response && response.success) {
                window.close(); // Close the popup after action
              } else {
                console.error(
                  `Error moving item to position ${targetIndex}:`,
                  response?.error || "Unknown error",
                );
              }
            } catch (error) {
              console.error(
                `Error sending message to move item to position ${targetIndex}:`,
                error,
              );
            }
          }
          return;
        }
      }
    }

    // Ctrl+Shift+B to add current tab as bookmark
    if (e.ctrlKey && e.shiftKey && (e.key === "b" || e.key === "B")) {
      e.preventDefault();
      try {
        // Send a message to background.js to trigger the addCurrentTabAsBookmark function
        const response = await chrome.runtime.sendMessage({
          action: "addBookmarkFromPopup",
        });
        if (response && response.success) {
          // The background script already handles setting the initial view to 'marks'
          // and opening the popup if it was closed, and focusing the new bookmark.
          // So, we just need to ensure the popup reflects the change if it's already open.
          // If the popup is already open and not in marks view, switch to marks view.
          if (ViewManager.getActive() !== "marks") {
            await ViewManager.show("marks", false); // Show marks view, not restoring
          }
          // The marks.js `attachMarksListeners` will pick up `INITIAL_MARK_URL_KEY`
          // and focus the newly added bookmark.
        } else {
          console.error(
            "Failed to add bookmark from popup:",
            response?.message || "Unknown error",
          );
          // Optionally display a message to the user within the popup
          // (This would require a new message display mechanism in popup.js or marks.js)
        }
      } catch (error) {
        console.error("Error sending add bookmark message:", error);
      }
      return; // Consume the event
    }

    // --- Other global F-key combinations (view switching, shortcuts page) ---
    // These now only trigger if Alt is NOT pressed, or if it's the specific F5 case.
    if (!e.altKey) {
      if (e.key === "F1") {
        e.preventDefault();
        await ViewManager.toggle("settings", loadSettingsContent);
      } else if (e.key === "F2" || (e.ctrlKey && e.key === "b")) {
        e.preventDefault();
        await ViewManager.toggle("marks", loadMarksContent);
      } else if (e.key === "F3") {
        e.preventDefault();
        await ViewManager.toggle("harpoon", loadHarpoonContent);
      } else if (e.key === "F4") {
        e.preventDefault();
        await ViewManager.toggle("tabManagement", loadTabManagementContent);
      } else if (e.key === "F5") {
        e.preventDefault();
        await ViewManager.toggle("help", loadHelpContent);
      } else if (e.key === "F6") {
        e.preventDefault();
        const shortcutsUrl =
          typeof chrome !== "undefined" &&
            chrome.runtime &&
            chrome.runtime.getURL
            ? "chrome://extensions/shortcuts" // Chromium
            : "about:addons"; //Mozilla

        // Modified F6 logic: Check for existing tab before opening a new one
        chrome.tabs.query({ url: shortcutsUrl }, (tabs) => {
          if (tabs.length > 0) {
            // Tab exists, switch to it
            const existingTab = tabs[0];
            switchTab(existingTab.id, existingTab.windowId);
          } else {
            // Tab does not exist, open a new one
            chrome.tabs.create({ url: shortcutsUrl }, () => window.close());
          }
          clearPersistentLastQuery(); // Still clear persistent query as we've navigated
        });
      }
    }
  });

  // Keyboard navigation within the main tab search view
  // Note: Harpoon view keybindings are now handled directly in harpoon.js via attached listeners
  // Note: Marks view keybindings are now handled directly in marks.js via attached listeners
  // Tab Management view keybindings will be handled directly in tabManager.js
  document.addEventListener("keydown", async (e) => {
    const activeView = ViewManager.getActive();

    if (activeView === "tabSearch") {
      const items = tabList.querySelectorAll("li");

      // Toggle bookmarks search with backtick (`)
      if (e.key === "`" && !e.ctrlKey) { // Ensure it's not Ctrl+`
        e.preventDefault(); // Prevent typing ` into the search input
        // Ensure the checkbox reference is available. It's loaded via loadSettingsContent.
        // If the settings content hasn't been loaded, load it now to get the reference.
        if (!showMarksInTabSearch_Checkbox) {
          await loadSettingsContent(); // This will also call getSettingsDOMElements() and loadSettings()
        }

        // Toggle the setting in currentSettings and in the UI checkbox if it exists
        currentSettings.searchMarksEnabled =
          !currentSettings.searchMarksEnabled;
        if (showMarksInTabSearch_Checkbox) {
          showMarksInTabSearch_Checkbox.checked =
            currentSettings.searchMarksEnabled;
        }

        await saveSettings(); // Persist the updated setting
        await performUnifiedSearch(currentQuery); // Re-filter and re-render immediately
        return; // Exit to prevent further processing
      }

      // Ctrl+` to toggle between all tabs and current window tabs
      if (e.ctrlKey && e.key === "`") {
        e.preventDefault();
        currentSettings.showOnlyCurrentWindowTabs = !currentSettings.showOnlyCurrentWindowTabs;
        await saveSettings(); // Persist the updated setting
        updateSearchInputColor(); // Update the input field color
        await performUnifiedSearch(currentQuery); // Re-filter and re-render immediately
        return; // Consume the event
      }

      // Ctrl+X to close all tabs below the highlighted tab in the same window
      if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        await closeTabsBelowHighlighted();
        return; // Consume the event
      }

      // Ctrl+N to create a new window with the highlighted tab
      if (e.ctrlKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault(); // Prevent default browser action for Ctrl+N (new window)
        // Re-declare selectedItem and isItemHighlighted within this scope
        const selectedItem =
          selectedIndex !== -1 ? filteredResults[selectedIndex] : null;
        const isItemHighlighted = selectedItem !== null;

        if (isItemHighlighted && selectedItem.type === "tab") {
          try {
            const response = await chrome.runtime.sendMessage({
              action: "createWindowAndMoveTab",
              tabId: selectedItem.id,
              tabUrl: selectedItem.url, // Pass URL for potential use, though not strictly needed for move
            });
            if (response && response.success) {
              window.close(); // Close the popup after action
            } else {
              console.error(
                "Failed to create new window with tab:",
                response?.error || "Unknown error",
              );
            }
          } catch (error) {
            console.error("Error sending message to create new window:", error);
          }
        }
        return; // Consume the event
      }

      if (isPersistentQueryActive) {
        // Check for printable characters (most common scenario for new input)
        // e.key.length === 1 covers letters, numbers, symbols but excludes 'Enter', 'ArrowUp', 'Shift', etc.
        // Exclude modifier keys (Ctrl, Alt, Meta) from this logic.
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          searchInput.value = e.key;
          currentQuery = e.key;
          isPersistentQueryActive = false;
          clearPersistentLastQuery();
          performUnifiedSearch(currentQuery);
          return;
        }
        // Handle Backspace/Delete explicitly to clear the whole field
        else if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          searchInput.value = "";
          currentQuery = "";
          isPersistentQueryActive = false;
          clearPersistentLastQuery();
          performUnifiedSearch(currentQuery);
          return;
        }
      }

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
            // Bookmarks now use the directly implemented focusOrCreateTabByUrl in popup.js
            focusOrCreateTabByUrl(selectedItem.url, selectedItem.exactMatch);
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
    }
  });

  // Handle search input for the main tabSearch view
  searchInput.addEventListener("input", () => {
    if (ViewManager.getActive() === "tabSearch") {
      currentQuery = searchInput.value.trim();
      performUnifiedSearch(currentQuery);
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

  // Get the current window ID right at the start
  const currentWindow = await chrome.windows.getCurrent();
  currentWindowId = currentWindow.id;

  // Load settings first as they might influence initial behavior
  loadSettings().then(async () => {
    // Load marks content eagerly if searchMarksEnabled or enableMarksAddition or alwaysShowMarksSearchInput is true
    // This is important because initMarksFeature and getAllBookmarks are asynchronous
    if (
      currentSettings.searchMarksEnabled ||
      currentSettings.enableMarksAddition ||
      currentSettings.alwaysShowMarksSearchInput
    ) {
      await loadMarksContent(); // Ensure marks are loaded and relevant functions are callable
    }

    // Determine the initial view based on a command flag from background script,
    // or fall back to sessionStorage, or default to tabSearch
    let initialViewFromCommand = await chrome.storage.session.get(
      COMMAND_INITIAL_VIEW_KEY,
    );
    initialViewFromCommand = initialViewFromCommand[COMMAND_INITIAL_VIEW_KEY];

    let initialView;
    if (initialViewFromCommand) {
      initialView = initialViewFromCommand;
      await chrome.storage.session.remove(COMMAND_INITIAL_VIEW_KEY); // Clear the flag after use
    } else {
      initialView = sessionStorage.getItem(SS_LAST_VIEW) || "tabSearch";
    }

    // Ensure relevant content is loaded for the determined initial view
    // The conditional loadMarksContent above handles the primary case.
    // These checks are for edge cases where the initialView might be 'marks' but it wasn't loaded yet.
    if (initialView === "marks" && !marksContentLoaded) {
      await loadMarksContent();
    } else if (initialView === "settings" && !settingsContentLoaded) {
      await loadSettingsContent();
    } else if (initialView === "help" && !helpContentLoaded) {
      await loadHelpContent();
    } else if (initialView === "harpoon" && !harpoonContentLoaded) {
      await loadHarpoonContent(); // Ensure harpoon content is loaded if starting in harpoon view
    } else if (initialView === "tabManagement" && !tabManagementContentLoaded) {
      // Load tab management content if starting in this view
      await loadTabManagementContent();
    }

    // Show the initial view (will handle session state restoration if tabSearch)
    ViewManager.show(initialView, initialView === "tabSearch");

    // Fetch and display results (will use restored session state or persistent memory if available)
    // This is primarily for the 'tabSearch' view, as 'harpoon' and 'marks' will load their own data.
    if (initialView === "tabSearch") {
      fetchAndDisplayResults();
    }
  });
});
