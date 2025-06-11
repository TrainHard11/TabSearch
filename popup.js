document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Element References ---
  const searchInput = document.getElementById("searchInput");
  const tabList = document.getElementById("tabList");
  const tabCounter = document.getElementById("tabCounter");
  const helpContentContainer = document.getElementById("helpContentContainer");
  const harpoonSection = document.getElementById("harpoonSection");
  const infoText = document.querySelector(".info-text");
  const searchArea = document.querySelector(".search-area");
  const settingsContentContainer = document.getElementById(
    "settingsContentContainer",
  ); // New reference for settings container

  // Variables for settings elements, will be populated after settings.html is loaded
  let enableWebNavigatorCheckbox;
  let searchOnNoResultsCheckbox;
  let customTabInputs = [];
  let customTabExactMatchCheckboxes = [];

  // --- State Variables ---
  let allTabs = [];
  let filteredTabs = [];
  let selectedIndex = -1;
  let currentQuery = "";
  let helpContentLoaded = false; // Flag to ensure help content is loaded only once
  let settingsContentLoaded = false; // Flag to ensure settings content is loaded only once

  // Default settings
  const defaultSettings = {
    webNavigatorEnabled: true,
    searchOnNoResults: true,
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

  // --- View Management ---
  const ViewManager = (() => {
    let activeView = "tabSearch"; // Default view

    const viewElements = {
      tabSearch: { container: searchArea, content: tabList, info: infoText },
      settings: {
        container: settingsContentContainer,
        content: settingsContentContainer,
      }, // Updated container
      help: { container: helpContentContainer, content: helpContentContainer },
      harpoon: { container: harpoonSection, content: harpoonSection },
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

    const showView = (viewName) => {
      if (!viewElements[viewName]) {
        console.warn(`Attempted to show unknown view: ${viewName}`);
        return;
      }

      hideAllViews();
      activeView = viewName;

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
        // Re-render tabs to ensure scrollable-content is applied correctly
        renderTabs(filteredTabs, selectedIndex);
      } else {
        // Clear search input when switching away from tabSearch
        currentQuery = "";
        searchInput.value = "";
        filteredTabs = [];
        renderTabs(filteredTabs); // Render an empty list or "no matching tabs"
      }
    };

    const toggleView = async (viewName, loadContentFn = null) => {
      if (activeView === viewName) {
        showView("tabSearch"); // If already on this view, go back to tab search
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

  // Function to get references to settings DOM elements after content is loaded
  const getSettingsDOMElements = () => {
    enableWebNavigatorCheckbox = settingsContentContainer.querySelector(
      "#enableWebNavigator",
    );
    searchOnNoResultsCheckbox =
      settingsContentContainer.querySelector("#searchOnNoResults");
    customTabInputs = [];
    customTabExactMatchCheckboxes = [];
    for (let i = 1; i <= 7; i++) {
      customTabInputs.push(
        settingsContentContainer.querySelector(`#customTab${i}Url`),
      );
      customTabExactMatchCheckboxes.push(
        settingsContentContainer.querySelector(`#customTab${i}ExactMatch`),
      );
    }
    return {
      enableWebNavigatorCheckbox,
      searchOnNoResultsCheckbox,
      customTabInputs,
      customTabExactMatchCheckboxes,
    };
  };

  // Function to load settings into the UI fields
  const loadSettings = async () => {
    const storedSettings = await chrome.storage.local.get(defaultSettings);
    currentSettings = { ...defaultSettings, ...storedSettings };

    // Ensure elements exist before trying to set their values
    if (enableWebNavigatorCheckbox) {
      enableWebNavigatorCheckbox.checked = currentSettings.webNavigatorEnabled;
    }
    if (searchOnNoResultsCheckbox) {
      searchOnNoResultsCheckbox.checked = currentSettings.searchOnNoResults;
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

  // Function to save settings from the UI fields
  const saveSettings = async () => {
    // Ensure elements exist before trying to get their values
    if (enableWebNavigatorCheckbox) {
      currentSettings.webNavigatorEnabled = enableWebNavigatorCheckbox.checked;
    }
    if (searchOnNoResultsCheckbox) {
      currentSettings.searchOnNoResults = searchOnNoResultsCheckbox.checked;
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
  };

  // Function to attach event listeners to settings elements
  const attachSettingsEventListeners = () => {
    if (enableWebNavigatorCheckbox) {
      enableWebNavigatorCheckbox.addEventListener("change", saveSettings);
    }
    if (searchOnNoResultsCheckbox) {
      searchOnNoResultsCheckbox.addEventListener("change", saveSettings);
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

  // Function to load settings content dynamically
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
          console.log("Settings content loaded successfully.");

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

  // --- Tab Management & UI Rendering ---
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

  const fetchAndDisplayTabs = (preferredIndex = 0) => {
    chrome.tabs.query({}, (tabs) => {
      allTabs = tabs;
      filteredTabs = fuzzySearch(currentQuery, allTabs);
      renderTabs(filteredTabs, preferredIndex);
      if (ViewManager.getActive() === "tabSearch") {
        // Only focus if tab search is the active view
        searchInput.focus();
      }
    });
  };

  const renderTabs = (tabsToRender, suggestedIndex = 0) => {
    tabList.innerHTML = "";
    tabCounter.textContent = `${tabsToRender.length} tabs`;

    // Only display "No matching tabs found" if we are in the 'tabSearch' view
    if (tabsToRender.length === 0) {
      if (ViewManager.getActive() === "tabSearch") {
        // <--- Condition to prevent message in other views
        const noResults = document.createElement("li");
        noResults.textContent = "No matching tabs found.";
        noResults.className = "no-results";
        tabList.appendChild(noResults);
      }
      selectedIndex = -1;
      tabList.classList.remove("scrollable-content");
      return;
    } else {
      tabList.classList.add("scrollable-content");
    }

    tabsToRender.forEach((tab, index) => {
      const listItem = document.createElement("li");
      listItem.dataset.tabId = tab.id;
      listItem.dataset.windowId = tab.windowId;
      listItem.dataset.index = index;

      const faviconSrc = tab.favIconUrl || chrome.runtime.getURL("icon.png"); // Fallback to extension icon
      const favicon = document.createElement("img");
      favicon.src = faviconSrc;
      favicon.alt = "favicon";
      favicon.classList.add("favicon");
      listItem.appendChild(favicon);

      const titleSpan = document.createElement("span");
      titleSpan.classList.add("tab-title");
      titleSpan.innerHTML = highlightText(tab.title || "", currentQuery);
      listItem.appendChild(titleSpan);

      const urlSpan = document.createElement("span");
      urlSpan.classList.add("tab-url");
      urlSpan.innerHTML = highlightText(tab.url || "", currentQuery);
      listItem.appendChild(urlSpan);

      listItem.addEventListener("click", () => switchTab(tab.id, tab.windowId));
      tabList.appendChild(listItem);
    });

    selectedIndex = Math.min(suggestedIndex, tabsToRender.length - 1);
    selectedIndex = Math.max(-1, selectedIndex); // Ensure selectedIndex is not less than -1

    if (selectedIndex !== -1) {
      highlightSelectedItem();
    }
  };

  const fuzzySearch = (query, tabs) => {
    if (!query) return tabs;
    const lowerCaseQuery = query.toLowerCase();
    const queryWords = lowerCaseQuery.split(" ").filter(Boolean);

    const titleMatches = [];
    const urlMatches = [];
    const processedTabIds = new Set();

    tabs.forEach((tab) => {
      const tabTitle = (tab.title || "").toLowerCase();
      const tabUrl = (tab.url || "").toLowerCase();

      const matchesTitle = queryWords.every((word) => tabTitle.includes(word));
      const matchesUrl = queryWords.every((word) => tabUrl.includes(word));

      if (matchesTitle) {
        titleMatches.push(tab);
        processedTabIds.add(tab.id);
      } else if (matchesUrl && !processedTabIds.has(tab.id)) {
        urlMatches.push(tab);
        processedTabIds.add(tab.id);
      }
    });
    return [...titleMatches, ...urlMatches];
  };

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

  const deleteSelectedTab = async () => {
    if (selectedIndex !== -1 && filteredTabs[selectedIndex]) {
      const tabToDelete = filteredTabs[selectedIndex];
      const oldSelectedIndex = selectedIndex;

      await chrome.tabs.remove(tabToDelete.id);

      chrome.tabs.query({}, (tabs) => {
        allTabs = tabs;
        filteredTabs = fuzzySearch(currentQuery, allTabs);

        let newSelectedIndex = -1;
        if (filteredTabs.length === 0) {
          newSelectedIndex = -1;
        } else if (oldSelectedIndex < filteredTabs.length) {
          newSelectedIndex = oldSelectedIndex;
        } else {
          newSelectedIndex = filteredTabs.length - 1;
        }
        newSelectedIndex = Math.max(-1, newSelectedIndex);

        renderTabs(filteredTabs, newSelectedIndex);
        searchInput.focus();
      });
    }
  };

  const deleteAllFilteredTabs = async () => {
    if (filteredTabs.length > 0) {
      const tabIdsToDelete = filteredTabs.map((tab) => tab.id);
      await chrome.tabs.remove(tabIdsToDelete);
      chrome.tabs.query({}, (tabs) => {
        allTabs = tabs;
        filteredTabs = fuzzySearch(currentQuery, allTabs);
        if (filteredTabs.length === 0) {
          renderTabs(filteredTabs, -1);
        } else {
          renderTabs(filteredTabs, 0);
        }
        searchInput.focus();
      });
    }
  };

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
          console.log("Help content loaded successfully.");
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

  // --- Event Listeners ---

  // Global keyboard shortcuts for view switching
  document.addEventListener("keydown", async (e) => {
    if (e.key === "F1") {
      e.preventDefault();
      await ViewManager.toggle("settings", loadSettingsContent); // Pass loadSettingsContent
    } else if (e.key === "F2") {
      e.preventDefault();
      await ViewManager.toggle("help", loadHelpContent);
    } else if (e.key === "F3") {
      e.preventDefault();
      // Assuming harpoonSection will load its content separately if needed
      await ViewManager.toggle("harpoon");
    } else if (e.key === "F4") {
      e.preventDefault();
      const url =
        typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
          ? "chrome://extensions/shortcuts" // Chromium
          : "about:addons"; // Firefox
      chrome.tabs.create({ url: url });
      window.close();
    } else if (e.key >= "1" && e.key <= "4" && e.altKey) {
      e.preventDefault();
      const index = parseInt(e.key) - 1;
      chrome.runtime
        .sendMessage({
          action: "executeMoveTabCommand",
          command: "moveCurrentTabToPosition",
          index: index,
        })
        .then(() => fetchAndDisplayTabs(selectedIndex))
        .catch(console.error);
    } else if (e.key === "ArrowLeft" && e.altKey) {
      e.preventDefault();
      chrome.runtime
        .sendMessage({
          action: "executeMoveTabCommand",
          command: "moveCurrentTabLeft",
        })
        .then(() => fetchAndDisplayTabs(selectedIndex))
        .catch(console.error);
    } else if (e.key === "ArrowRight" && e.altKey) {
      e.preventDefault();
      chrome.runtime
        .sendMessage({
          action: "executeMoveTabCommand",
          command: "moveCurrentTabRight",
        })
        .then(() => fetchAndDisplayTabs(selectedIndex))
        .catch(console.error);
    }
  });

  // Keyboard navigation within the main tab search view
  searchInput.addEventListener("keydown", (e) => {
    // Only process navigation keys if the tabSearch view is active
    if (ViewManager.getActive() !== "tabSearch") {
      return;
    }

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
      if (selectedIndex !== -1 && filteredTabs[selectedIndex]) {
        const selectedTab = filteredTabs[selectedIndex];
        switchTab(selectedTab.id, selectedTab.windowId);
      } else if (currentQuery.length > 0 && filteredTabs.length === 0) {
        if (currentSettings.searchOnNoResults) {
          const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(currentQuery)}`;
          chrome.tabs.create({ url: googleSearchUrl }, () => window.close());
        }
      } else {
        window.close(); // Close if no selection and no query
      }
    } else if (e.key === "Delete" || (e.ctrlKey && e.key === "d")) {
      e.preventDefault();
      deleteSelectedTab();
    } else if (e.ctrlKey && e.shiftKey && e.key === "D") {
      e.preventDefault();
      deleteAllFilteredTabs();
    }
  });

  // Handle search input for the main tab search view
  searchInput.addEventListener("input", () => {
    if (ViewManager.getActive() === "tabSearch") {
      currentQuery = searchInput.value.trim();
      filteredTabs = fuzzySearch(currentQuery, allTabs);
      renderTabs(filteredTabs);
    }
  });

  // --- Initialization ---
  // Initial fetch and display of tabs for the default 'tabSearch' view
  fetchAndDisplayTabs();
  ViewManager.show("tabSearch"); // Ensure tabSearch is the initial active view
});
