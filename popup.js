document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("searchInput");
    const tabList = document.getElementById("tabList");
    const optionsSection = document.getElementById("optionsSection"); // NEW
    const enableWebNavigatorCheckbox = document.getElementById("enableWebNavigator"); // NEW
    const searchOnNoResultsCheckbox = document.getElementById("searchOnNoResults"); // NEW

    let allTabs = [];
    let filteredTabs = [];
    let selectedIndex = -1; // Index of the currently selected tab in the filtered list
    let currentQuery = ""; // Declare a variable to hold the current search query

    // Default settings
    const defaultSettings = {
        webNavigatorEnabled: true, // Default enabled
        searchOnNoResults: true // Default enabled
    };
    let currentSettings = {}; // Will hold loaded settings

    // Function to load settings
    const loadSettings = async () => {
        const storedSettings = await chrome.storage.local.get(defaultSettings);
        currentSettings = { ...defaultSettings, ...storedSettings }; // Merge with defaults
        enableWebNavigatorCheckbox.checked = currentSettings.webNavigatorEnabled;
        searchOnNoResultsCheckbox.checked = currentSettings.searchOnNoResults;
    };

    // Function to save settings
    const saveSettings = async () => {
        currentSettings.webNavigatorEnabled = enableWebNavigatorCheckbox.checked;
        currentSettings.searchOnNoResults = searchOnNoResultsCheckbox.checked;
        await chrome.storage.local.set(currentSettings);
    };

    // Helper function to highlight matching parts of the text
    const highlightText = (text, query) => {
        if (!text || !query) {
            return text;
        }

        let highlightedHtml = text;
        const lowerCaseQuery = query.toLowerCase();
        // Split the query into words and filter out any empty strings
        const queryWords = lowerCaseQuery.split(" ").filter(Boolean);

        queryWords.forEach((word) => {
            // Escape special characters in the word for use in RegExp
            const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            // Create a global, case-insensitive regular expression for each word
            const regex = new RegExp(`(${escapedWord})`, "gi");
            // Replace matches with a span tag
            highlightedHtml = highlightedHtml.replace(
                regex,
                (match) => `<span class="highlight">${match}</span>`,
            );
        });

        return highlightedHtml;
    };

    // Function to fetch and display tabs
    const fetchAndDisplayTabs = (preferredIndex = 0) => {
        chrome.tabs.query({}, (tabs) => {
            allTabs = tabs;
            filteredTabs = fuzzySearch(currentQuery, allTabs); // Re-apply filter on new data
            renderTabs(filteredTabs, preferredIndex); // Pass the preferred index
            searchInput.focus(); // Focus the search input when popup opens
        });
    };

    // Function to render tabs in the list
    const renderTabs = (tabsToRender, suggestedIndex = 0) => {
        tabList.innerHTML = ""; // Clear previous list
        if (tabsToRender.length === 0) {
            const noResults = document.createElement("li");
            noResults.textContent = "No matching tabs found.";
            noResults.style.textAlign = "center";
            noResults.style.color = "#888";
            noResults.style.padding = "10px"; // Add some padding for better appearance
            tabList.appendChild(noResults);
            selectedIndex = -1;
            return;
        }

        tabsToRender.forEach((tab, index) => {
            const listItem = document.createElement("li");
            listItem.dataset.tabId = tab.id;
            listItem.dataset.windowId = tab.windowId;
            listItem.dataset.index = index; // Store the index in the filtered list

            // Add favicon
            if (tab.favIconUrl) {
                const favicon = document.createElement("img");
                favicon.src = tab.favIconUrl;
                favicon.alt = "favicon";
                favicon.classList.add("favicon");
                listItem.appendChild(favicon);
            } else {
                // Placeholder for missing favicon
                const placeholder = document.createElement("span");
                placeholder.classList.add("favicon");
                placeholder.textContent = "📄"; // A simple document emoji
                listItem.appendChild(placeholder);
            }

            // Add title with highlighting
            const titleSpan = document.createElement("span");
            titleSpan.classList.add("tab-title");
            titleSpan.innerHTML = highlightText(tab.title || "", currentQuery);
            listItem.appendChild(titleSpan);

            // Add URL with highlighting
            const urlSpan = document.createElement("span");
            urlSpan.classList.add("tab-url");
            urlSpan.innerHTML = highlightText(tab.url || "", currentQuery);
            listItem.appendChild(urlSpan);

            listItem.addEventListener("click", () => {
                switchTab(tab.id, tab.windowId);
            });

            tabList.appendChild(listItem);
        });

        // Set selectedIndex based on suggestedIndex, with bounds checking
        selectedIndex = Math.min(suggestedIndex, tabsToRender.length - 1);
        selectedIndex = Math.max(-1, selectedIndex); // Ensure it's not negative unless list is truly empty

        // Highlight the item if a valid index is selected
        if (selectedIndex !== -1) {
            highlightSelectedItem();
        }
    };

    // Fuzzy search function - MODIFIED FOR PRIORITY
    const fuzzySearch = (query, tabs) => {
        if (!query) {
            return tabs; // If no query, return all tabs without sorting
        }

        const lowerCaseQuery = query.toLowerCase();
        const queryWords = lowerCaseQuery.split(" ").filter(Boolean);

        const titleMatches = [];
        const urlMatches = [];
        const processedTabIds = new Set(); // To avoid duplicates

        tabs.forEach((tab) => {
            const tabTitle = (tab.title || "").toLowerCase();
            const tabUrl = (tab.url || "").toLowerCase();

            // Check if all query words are in the title
            const matchesTitle = queryWords.every((word) => tabTitle.includes(word));
            // Check if all query words are in the URL
            const matchesUrl = queryWords.every((word) => tabUrl.includes(word));

            if (matchesTitle) {
                titleMatches.push(tab);
                processedTabIds.add(tab.id); // Mark this tab ID as processed for title match
            } else if (matchesUrl && !processedTabIds.has(tab.id)) {
                // If it didn't match the title, but matches the URL, and hasn't been added yet
                urlMatches.push(tab);
                processedTabIds.add(tab.id); // Mark this tab ID as processed for URL match
            }
        });

        // Combine results: title matches first, then URL matches
        return [...titleMatches, ...urlMatches];
    };

    // Handle search input
    searchInput.addEventListener("input", () => {
        currentQuery = searchInput.value.trim(); // Update the current query
        filteredTabs = fuzzySearch(currentQuery, allTabs);
        renderTabs(filteredTabs); // Render, starting from index 0 by default
    });

    // Highlight selected item
    const highlightSelectedItem = () => {
        const items = tabList.querySelectorAll("li");
        items.forEach((item, index) => {
            if (index === selectedIndex) {
                item.classList.add("selected");
                // Scroll the selected item into view if it's not already
                item.scrollIntoView({ block: "nearest", behavior: "auto" });
            } else {
                item.classList.remove("selected");
            }
        });
    };

    // Function to switch to a tab and close the popup
    const switchTab = (tabId, targetWindowId) => {
        chrome.windows.getCurrent((currentWindow) => {
            if (currentWindow.id === targetWindowId) {
                // If the target tab is in the current window, just activate the tab
                chrome.tabs.update(tabId, { active: true }, () => {
                    window.close(); // Close the popup
                });
            } else {
                // If the target tab is in a different window, first focus that window, then activate the tab
                chrome.windows.update(targetWindowId, { focused: true }, () => {
                    chrome.tabs.update(tabId, { active: true }, () => {
                        window.close(); // Close the popup
                    });
                });
            }
        });
    };

    // Function to delete the selected tab
    const deleteSelectedTab = async () => {
        if (selectedIndex !== -1 && filteredTabs[selectedIndex]) {
            const tabToDelete = filteredTabs[selectedIndex];
            const oldSelectedIndex = selectedIndex; // Store current index before deletion

            await chrome.tabs.remove(tabToDelete.id);

            // After deletion, re-fetch and display tabs to update the list
            // and recalculate the new selected index.
            chrome.tabs.query({}, (tabs) => {
                allTabs = tabs;
                filteredTabs = fuzzySearch(currentQuery, allTabs);

                let newSelectedIndex = -1;
                if (filteredTabs.length === 0) {
                    newSelectedIndex = -1; // No tabs left to select
                } else if (oldSelectedIndex < filteredTabs.length) {
                    // If there's still an item at the old index, select it (this covers non-last deletions)
                    newSelectedIndex = oldSelectedIndex;
                } else {
                    // If oldIndex was past the new length (i.e., the last item was deleted or items before it),
                    // select the new last item if the list is not empty.
                    newSelectedIndex = filteredTabs.length - 1;
                }
                newSelectedIndex = Math.max(-1, newSelectedIndex); // Ensure it's not negative unless list is empty.

                renderTabs(filteredTabs, newSelectedIndex); // Pass the new desired index
                searchInput.focus();
            });
        }
    };

    // Function to delete all filtered tabs
    const deleteAllFilteredTabs = async () => {
        if (filteredTabs.length > 0) {
            const tabIdsToDelete = filteredTabs.map(tab => tab.id);
            await chrome.tabs.remove(tabIdsToDelete);
            // After deletion, re-fetch and display tabs to update the list
            chrome.tabs.query({}, (tabs) => {
                allTabs = tabs;
                filteredTabs = fuzzySearch(currentQuery, allTabs);
                if (filteredTabs.length === 0) {
                    renderTabs(filteredTabs, -1); // No tabs left, no selection
                } else {
                    // If there are still tabs, default to the first one for mass delete.
                    renderTabs(filteredTabs, 0);
                }
                searchInput.focus();
            });
        }
    };

    // NEW: Toggle options section visibility
    document.addEventListener("keydown", (e) => {
        if (e.key === "F1") {
            e.preventDefault(); // Prevent default F1 behavior (e.g., opening help)
            optionsSection.classList.toggle("hidden");
            // If options are shown, hide tab list, otherwise show tab list
            if (!optionsSection.classList.contains("hidden")) {
                tabList.classList.add("hidden");
                searchInput.classList.add("hidden"); // Hide search input too for cleaner UI
            } else {
                tabList.classList.remove("hidden");
                searchInput.classList.remove("hidden");
                searchInput.focus(); // Focus search input when tab list is visible
            }
        }
    });

    // NEW: Event listeners for checkboxes
    enableWebNavigatorCheckbox.addEventListener("change", saveSettings);
    searchOnNoResultsCheckbox.addEventListener("change", saveSettings);

    // Handle keyboard navigation including new delete commands
    searchInput.addEventListener("keydown", (e) => {
        // Only process search input keydowns if options section is hidden
        if (!optionsSection.classList.contains("hidden")) {
            return; // Do nothing if options are visible
        }

        const items = tabList.querySelectorAll("li");

        if (e.key === "ArrowDown" || (e.altKey && e.key === "j")) {
            e.preventDefault(); // Prevent cursor movement in input
            if (items.length > 0) { // Only navigate if there are items
                selectedIndex = (selectedIndex + 1) % items.length;
                highlightSelectedItem();
            }
        } else if (e.key === "ArrowUp" || (e.altKey && e.key === "k")) {
            e.preventDefault(); // Prevent cursor movement in input
            if (items.length > 0) { // Only navigate if there are items
                selectedIndex = (selectedIndex - 1 + items.length) % items.length;
                highlightSelectedItem();
            }
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (selectedIndex !== -1 && filteredTabs[selectedIndex]) {
                // If a tab is selected, switch to it
                const selectedTab = filteredTabs[selectedIndex];
                switchTab(selectedTab.id, selectedTab.windowId);
            } else if (currentQuery.length > 0 && filteredTabs.length === 0) {
                // NEW: Check setting for "Search on Enter if no results"
                if (currentSettings.searchOnNoResults) {
                    // If no tabs are found and a query is typed, open a Google search
                    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(currentQuery)}`;
                    chrome.tabs.create({ url: googleSearchUrl }, () => {
                        window.close(); // Close the popup after opening the search tab
                    });
                }
            } else {
                // If no search results and no query, or simply no selection,
                // and Enter is pressed, close the popup (default behavior if no action)
                window.close();
            }
        } else if (e.ctrlKey && e.key === "d") { // Ctrl+D for deleting selected tab
            e.preventDefault();
            deleteSelectedTab();
        } else if (e.ctrlKey && e.shiftKey && e.key === "D") { // Ctrl+Shift+D for deleting all filtered tabs (e.key will be 'D' for Shift+d)
            e.preventDefault();
            deleteAllFilteredTabs();
        }
    });

    // Initial fetch and display of tabs + load settings
    loadSettings().then(() => {
        fetchAndDisplayTabs();
    });
});
