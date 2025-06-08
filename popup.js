document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("searchInput");
    const tabList = document.getElementById("tabList");
    const tabCounter = document.getElementById("tabCounter");
    const optionsSection = document.getElementById("optionsSection");
    const enableWebNavigatorCheckbox = document.getElementById("enableWebNavigator");
    const searchOnNoResultsCheckbox = document.getElementById("searchOnNoResults");

    // Custom tab input fields and checkboxes
    const customTabInputs = [];
    const customTabExactMatchCheckboxes = [];
    for (let i = 1; i <= 4; i++) {
        customTabInputs.push(document.getElementById(`customTab${i}Url`));
        customTabExactMatchCheckboxes.push(document.getElementById(`customTab${i}ExactMatch`));
    }


    let allTabs = [];
    let filteredTabs = [];
    let selectedIndex = -1;
    let currentQuery = "";

    // Default settings including custom tabs
    const defaultSettings = {
        webNavigatorEnabled: true,
        searchOnNoResults: true,
        customTab1Url: '', customTab1ExactMatch: false,
        customTab2Url: '', customTab2ExactMatch: false,
        customTab3Url: '', customTab3ExactMatch: false,
        customTab4Url: '', customTab4ExactMatch: false
    };
    let currentSettings = {};

    // Function to load settings
    const loadSettings = async () => {
        const storedSettings = await chrome.storage.local.get(defaultSettings);
        currentSettings = { ...defaultSettings, ...storedSettings };

        enableWebNavigatorCheckbox.checked = currentSettings.webNavigatorEnabled;
        searchOnNoResultsCheckbox.checked = currentSettings.searchOnNoResults;

        // Load custom tab settings
        for (let i = 0; i < 4; i++) {
            customTabInputs[i].value = currentSettings[`customTab${i + 1}Url`];
            customTabExactMatchCheckboxes[i].checked = currentSettings[`customTab${i + 1}ExactMatch`];
        }
    };

    // Function to save settings
    const saveSettings = async () => {
        currentSettings.webNavigatorEnabled = enableWebNavigatorCheckbox.checked;
        currentSettings.searchOnNoResults = searchOnNoResultsCheckbox.checked;

        // Save custom tab settings
        for (let i = 0; i < 4; i++) {
            currentSettings[`customTab${i + 1}Url`] = customTabInputs[i].value.trim();
            currentSettings[`customTab${i + 1}ExactMatch`] = customTabExactMatchCheckboxes[i].checked;
        }

        await chrome.storage.local.set(currentSettings);
    };

    // Helper function to highlight matching parts of the text
    const highlightText = (text, query) => {
        if (!text || !query) {
            return text;
        }

        let highlightedHtml = text;
        const lowerCaseQuery = query.toLowerCase();
        const queryWords = lowerCaseQuery.split(" ").filter(Boolean);

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

    // Function to fetch and display tabs
    const fetchAndDisplayTabs = (preferredIndex = 0) => {
        chrome.tabs.query({}, (tabs) => {
            allTabs = tabs;
            filteredTabs = fuzzySearch(currentQuery, allTabs);
            renderTabs(filteredTabs, preferredIndex);
            searchInput.focus();
        });
    };

    // Function to render tabs in the list
    const renderTabs = (tabsToRender, suggestedIndex = 0) => {
        tabList.innerHTML = "";
        tabCounter.textContent = `${tabsToRender.length} tabs`;

        if (tabsToRender.length === 0) {
            const noResults = document.createElement("li");
            noResults.textContent = "No matching tabs found.";
            noResults.style.textAlign = "center";
            noResults.style.color = "#888";
            noResults.style.padding = "10px";
            tabList.appendChild(noResults);
            selectedIndex = -1;
            return;
        }

        tabsToRender.forEach((tab, index) => {
            const listItem = document.createElement("li");
            listItem.dataset.tabId = tab.id;
            listItem.dataset.windowId = tab.windowId;
            listItem.dataset.index = index;

            if (tab.favIconUrl) {
                const favicon = document.createElement("img");
                favicon.src = tab.favIconUrl;
                favicon.alt = "favicon";
                favicon.classList.add("favicon");
                listItem.appendChild(favicon);
            } else {
                const placeholder = document.createElement("span");
                placeholder.classList.add("favicon");
                placeholder.textContent = "📄";
                listItem.appendChild(placeholder);
            }

            const titleSpan = document.createElement("span");
            titleSpan.classList.add("tab-title");
            titleSpan.innerHTML = highlightText(tab.title || "", currentQuery);
            listItem.appendChild(titleSpan);

            const urlSpan = document.createElement("span");
            urlSpan.classList.add("tab-url");
            urlSpan.innerHTML = highlightText(tab.url || "", currentQuery);
            listItem.appendChild(urlSpan);

            listItem.addEventListener("click", () => {
                switchTab(tab.id, tab.windowId);
            });

            tabList.appendChild(listItem);
        });

        selectedIndex = Math.min(suggestedIndex, tabsToRender.length - 1);
        selectedIndex = Math.max(-1, selectedIndex);

        if (selectedIndex !== -1) {
            highlightSelectedItem();
        }
    };

    // Fuzzy search function - MODIFIED FOR PRIORITY
    const fuzzySearch = (query, tabs) => {
        if (!query) {
            return tabs;
        }

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

    // Handle search input
    searchInput.addEventListener("input", () => {
        currentQuery = searchInput.value.trim();
        filteredTabs = fuzzySearch(currentQuery, allTabs);
        renderTabs(filteredTabs);
    });

    // Highlight selected item
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

    // Function to switch to a tab and close the popup
    const switchTab = (tabId, targetWindowId) => {
        chrome.windows.getCurrent((currentWindow) => {
            if (currentWindow.id === targetWindowId) {
                chrome.tabs.update(tabId, { active: true }, () => {
                    window.close();
                });
            } else {
                chrome.windows.update(targetWindowId, { focused: true }, () => {
                    chrome.tabs.update(tabId, { active: true }, () => {
                        window.close();
                    });
                });
            }
        });
    };

    // Function to delete the selected tab
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

    // Function to delete all filtered tabs
    const deleteAllFilteredTabs = async () => {
        if (filteredTabs.length > 0) {
            const tabIdsToDelete = filteredTabs.map(tab => tab.id);
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

    // Toggle options section visibility and help page
    document.addEventListener("keydown", (e) => {
        const searchArea = document.querySelector('.search-area');

        if (e.key === "F1") {
            e.preventDefault();
            optionsSection.classList.toggle("hidden");
            // Toggle visibility of other UI elements
            searchArea.classList.toggle('hidden', !optionsSection.classList.contains("hidden"));
            tabList.classList.toggle("hidden", !optionsSection.classList.contains("hidden"));

            if (optionsSection.classList.contains("hidden")) {
                searchInput.focus(); // Focus search input when tab list is visible
            } else {
                // When options are shown, clear search input and reset filtered tabs
                currentQuery = "";
                searchInput.value = "";
                filteredTabs = [];
                renderTabs(filteredTabs); // Render an empty list or "no matching tabs"
            }
        } else if (e.key === "F2") {
            e.preventDefault();
            // Open the help page in a new tab
            chrome.tabs.create({ url: "help.html" });
        }
    });

    // Event listeners for general settings checkboxes
    enableWebNavigatorCheckbox.addEventListener("change", saveSettings);
    searchOnNoResultsCheckbox.addEventListener("change", saveSettings);

    // Event listeners for custom tab inputs and checkboxes
    for (let i = 0; i < 4; i++) {
        customTabInputs[i].addEventListener("input", saveSettings);
        customTabExactMatchCheckboxes[i].addEventListener("change", saveSettings);
    }

    // Handle keyboard navigation including new delete commands
    searchInput.addEventListener("keydown", (e) => {
        if (!optionsSection.classList.contains("hidden")) {
            return; // Do nothing if options are visible
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
                    chrome.tabs.create({ url: googleSearchUrl }, () => {
                        window.close();
                    });
                }
            } else {
                window.close();
            }
        } else if (e.key === "Delete") {
            e.preventDefault();
            deleteSelectedTab();
        } else if (e.ctrlKey && e.key === "d") {
            e.preventDefault();
            deleteSelectedTab();
        } else if (e.ctrlKey && e.shiftKey && e.key === "D") {
            e.preventDefault();
            deleteAllFilteredTabs();
        }
    });

    // Initial fetch and display of tabs + load settings
    loadSettings().then(() => {
        fetchAndDisplayTabs();
    });
});
