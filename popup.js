document.addEventListener("DOMContentLoaded", () => {
	// --- Constants and DOM Element References ---
	const LS_PREFIX = "fuzzyTabSearch_"; // Local storage prefix for all keys
	const LS_LAST_QUERY_PERSISTENT = `${LS_PREFIX}lastQueryPersistent`; // For short-term memory
	const LS_LAST_QUERY_TIMESTAMP = `${LS_PREFIX}lastQueryTimestamp`; // For short-term memory

	// Constants for view state management (using sessionStorage for current session)
	const SS_LAST_QUERY_SESSION = `${LS_PREFIX}lastQuerySession`;
	const SS_FILTERED_TABS_SESSION = `${LS_PREFIX}filteredTabsSession`;
	const SS_SELECTED_INDEX_SESSION = `${LS_PREFIX}selectedIndexSession`;
	const SS_LAST_VIEW = `${LS_PREFIX}lastView`;

	const SEARCH_MEMORY_DURATION_MS = 20 * 1000; // 20 seconds

	const searchInput = document.getElementById("searchInput");
	const tabList = document.getElementById("tabList");
	const tabCounter = document.getElementById("tabCounter");
	const helpContentContainer = document.getElementById("helpContentContainer");
	const harpoonSection = document.getElementById("harpoonSection"); // Harpoon Section reference
	const infoText = document.querySelector(".info-text");
	const searchArea = document.querySelector(".search-area");
	const settingsContentContainer = document.getElementById(
		"settingsContentContainer",
	);

	// Variables for settings elements, populated after settings.html is loaded
	let enableWebNavigatorCheckbox;
	let searchOnNoResultsCheckbox;
	let customTabInputs = [];
	let customTabExactMatchCheckboxes = [];

	// --- State Variables ---
	let allTabs = [];
	let filteredTabs = [];
	let selectedIndex = -1;
	let currentQuery = "";
	let helpContentLoaded = false;
	let settingsContentLoaded = false;
	let harpoonContentLoaded = false; // New state variable for Harpoon content

	// Default settings
	const defaultSettings = {
		webNavigatorEnabled: true,
		searchOnNoResults: true,
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
	 * Performs a fuzzy search on tabs.
	 * Prioritizes title matches over URL matches.
	 * @param {string} query The search query.
	 * @param {Array<chrome.tabs.Tab>} tabs The array of tabs to search within.
	 * @returns {Array<chrome.tabs.Tab>} The filtered and sorted list of tabs.
	 */
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
	 * Stores the current search state (query, filtered tabs, selected index) in sessionStorage.
	 * This is used to preserve state when switching between different views within the same popup session.
	 */
	const saveSessionSearchState = () => {
		try {
			sessionStorage.setItem(SS_LAST_QUERY_SESSION, currentQuery);
			sessionStorage.setItem(
				SS_FILTERED_TABS_SESSION,
				JSON.stringify(filteredTabs),
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
			const tabs = JSON.parse(sessionStorage.getItem(SS_FILTERED_TABS_SESSION));
			const index = parseInt(
				sessionStorage.getItem(SS_SELECTED_INDEX_SESSION),
				10,
			);

			if (query !== null && tabs !== null && !isNaN(index)) {
				return { query, tabs, index };
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
		sessionStorage.removeItem(SS_FILTERED_TABS_SESSION);
		sessionStorage.removeItem(SS_SELECTED_INDEX_SESSION);
	};

	// --- Persistent Short-Term Search Memory (for re-opening popup) ---

	/**
	 * Saves the current query and a timestamp to localStorage.
	 * This is for the 20-second "remember last search" feature,
	 * only if there are 2 or more filtered tabs.
	 */
	const savePersistentLastQuery = () => {
		try {
			// Only save if there are 2 or more filtered tabs.
			// This implements the rule: "if the search query resulted in only one tab from beginning it doesn't make sense to keep the history".
			if (filteredTabs.length > 1) {
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
			harpoon: { container: harpoonSection, content: harpoonSection }, // Harpoon view element
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
				// The renderTabs function will be called by fetchAndDisplayTabs which handles restoring.
			} else {
				// Clear search input and visual list when switching away from tabSearch
				searchInput.value = "";
				renderTabs([]); // Render an empty list
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
				await fetchAndDisplayTabs(); // Re-fetch tabs and re-apply current query
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
	 * Loads Harpoon content dynamically from Harpoon/harpoon.html.
	 * This is new for the Harpoon feature.
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
					// Assuming the main content is within a div with class 'harpoon-content' or similar
					const harpoonHtmlContent =
						doc.querySelector(".harpoon-content").innerHTML;
					harpoonSection.innerHTML = harpoonHtmlContent;
					harpoonContentLoaded = true;
				} else {
					console.error(
						"Failed to load Harpoon/harpoon.html:",
						response.statusText,
					);
					harpoonSection.innerHTML = "<p>Error loading Harpoon content.</p>";
				}
			} catch (error) {
				console.error("Error fetching Harpoon/harpoon.html:", error);
				harpoonSection.innerHTML = "<p>Error fetching Harpoon content.</p>";
			}
		}
	};

	// --- Tab Management & UI Rendering ---

	/**
	 * Fetches all current tabs and updates the display.
	 * Prioritizes restoring session state if returning to tabSearch.
	 * If not restoring session state, checks for persistent short-term memory.
	 * @param {number} [preferredIndex=0] The index to prefer if no state is restored.
	 */
	const fetchAndDisplayTabs = (preferredIndex = 0) => {
		chrome.tabs.query({}, (tabs) => {
			allTabs = tabs;
			let loadedQuery = "";
			let loadedTabs = [];
			let loadedIndex = -1;

			// 1. Try to restore previous session state (for view switching)
			const lastActiveView = sessionStorage.getItem(SS_LAST_VIEW);
			const sessionState = loadSessionSearchState();

			if (lastActiveView === "tabSearch" && sessionState) {
				loadedQuery = sessionState.query;
				loadedTabs = sessionState.tabs;
				loadedIndex = sessionState.index;
			} else {
				// 2. If not restoring session state, check for persistent short-term memory
				loadedQuery = loadPersistentLastQuery();
				if (loadedQuery) {
					// If a query was loaded, re-filter tabs based on current `allTabs`
					loadedTabs = fuzzySearch(loadedQuery, allTabs);
					loadedIndex = 0; // Default to first item if restoring via persistent memory
				} else {
					// 3. No state to restore, start fresh
					loadedQuery = "";
					loadedTabs = fuzzySearch(loadedQuery, allTabs);
					loadedIndex = preferredIndex;
				}
			}

			currentQuery = loadedQuery;
			filteredTabs = loadedTabs;
			selectedIndex = loadedIndex;
			searchInput.value = currentQuery; // Set input value

			renderTabs(filteredTabs, selectedIndex);

			if (ViewManager.getActive() === "tabSearch") {
				searchInput.focus();
			}
		});
	};

	/**
	 * Renders the list of tabs in the UI.
	 * @param {Array<chrome.tabs.Tab>} tabsToRender The tabs to display.
	 * @param {number} suggestedIndex The index of the tab to highlight.
	 */
	const renderTabs = (tabsToRender, suggestedIndex = 0) => {
		tabList.innerHTML = "";
		tabCounter.textContent = `${tabsToRender.length} tabs`;

		if (tabsToRender.length === 0 && ViewManager.getActive() === "tabSearch") {
			const noResults = document.createElement("li");
			noResults.textContent = "No matching tabs found.";
			noResults.className = "no-results";
			tabList.appendChild(noResults);
			selectedIndex = -1;
			tabList.classList.remove("scrollable-content");
			return;
		} else if (tabsToRender.length > 0) {
			tabList.classList.add("scrollable-content");
		}

		tabsToRender.forEach((tab, index) => {
			const listItem = document.createElement("li");
			listItem.dataset.tabId = tab.id;
			listItem.dataset.windowId = tab.windowId;
			listItem.dataset.index = index;

			const favicon = document.createElement("img");
			favicon.classList.add("favicon");

			// Handle favicon for internal Chrome/about pages vs. regular URLs
			if (
				tab.url &&
				(tab.url.startsWith("chrome://") || tab.url.startsWith("about:"))
			) {
				// Use a generic Chrome icon for internal pages if favIconUrl is missing
				favicon.src =
					tab.favIconUrl || "chrome://branding/product/2x/logo_chrome_96dp.png";
			} else {
				// For regular web pages, use favIconUrl or fallback to chrome://favicon/
				favicon.src = tab.favIconUrl || "chrome://favicon/" + tab.url;
			}
			favicon.alt = "favicon";
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

	/**
	 * Highlights the currently selected tab item in the list.
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
	 * Deletes the currently selected tab.
	 */
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

	/**
	 * Deletes all currently filtered tabs.
	 */
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
			await ViewManager.toggle("harpoon", loadHarpoonContent);
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
				// Clear both session and persistent state on successful tab switch
				clearSessionSearchState();
				clearPersistentLastQuery();
			} else if (currentQuery.length > 0 && filteredTabs.length === 0) {
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
			deleteSelectedTab();
		} else if (e.ctrlKey && e.shiftKey && e.key === "D") {
			e.preventDefault();
			deleteAllFilteredTabs();
		}
	});

	// Handle search input for the main tabSearch view
	searchInput.addEventListener("input", () => {
		if (ViewManager.getActive() === "tabSearch") {
			currentQuery = searchInput.value.trim();
			filteredTabs = fuzzySearch(currentQuery, allTabs);
			renderTabs(filteredTabs);
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
	loadSettings().then(() => {
		// Determine the initial view based on sessionStorage, or default to tabSearch
		const initialView = sessionStorage.getItem(SS_LAST_VIEW) || "tabSearch";
		// Show the initial view (will handle session state restoration if tabSearch)
		ViewManager.show(initialView, initialView === "tabSearch");

		// Fetch and display tabs (will use restored session state or persistent memory if available)
		fetchAndDisplayTabs();
	});
});
