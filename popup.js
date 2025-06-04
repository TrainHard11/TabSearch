document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  const tabList = document.getElementById("tabList");
  let allTabs = [];
  let filteredTabs = [];
  let selectedIndex = -1; // Index of the currently selected tab in the filtered list
  let currentQuery = ""; // Declare a variable to hold the current search query

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
  const fetchAndDisplayTabs = () => {
    chrome.tabs.query({}, (tabs) => {
      allTabs = tabs;
      filteredTabs = [...allTabs]; // Initially, all tabs are filtered
      renderTabs(filteredTabs);
      searchInput.focus(); // Focus the search input when popup opens
    });
  };

  // Function to render tabs in the list
  const renderTabs = (tabsToRender) => {
    tabList.innerHTML = ""; // Clear previous list
    if (tabsToRender.length === 0) {
      const noResults = document.createElement("li");
      noResults.textContent = "No matching tabs found.";
      noResults.style.textAlign = "center";
      noResults.style.color = "#888";
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
      // Use innerHTML to render the highlighted text
      titleSpan.innerHTML = highlightText(tab.title || "", currentQuery);
      listItem.appendChild(titleSpan);

      // Add URL with highlighting (optional, can be hidden with CSS if too much)
      const urlSpan = document.createElement("span");
      urlSpan.classList.add("tab-url");
      // Use innerHTML to render the highlighted text
      urlSpan.innerHTML = highlightText(tab.url || "", currentQuery);
      listItem.appendChild(urlSpan);

      listItem.addEventListener("click", () => {
        switchTab(tab.id, tab.windowId);
      });

      tabList.appendChild(listItem);
    });

    // Highlight the first item if there are results
    if (tabsToRender.length > 0) {
      selectedIndex = 0;
      highlightSelectedItem();
    } else {
      selectedIndex = -1;
    }
  };

  // Fuzzy search function
  const fuzzySearch = (query, tabs) => {
    if (!query) {
      return tabs;
    }

    const lowerCaseQuery = query.toLowerCase();
    // Split the query into words, removing any empty strings that might result from multiple spaces
    const queryWords = lowerCaseQuery.split(" ").filter(Boolean);

    return tabs.filter((tab) => {
      const tabTitle = (tab.title || "").toLowerCase();
      const tabUrl = (tab.url || "").toLowerCase();

      // Check if ALL query words are present in either the tab's title or URL,
      // regardless of their order in the query.
      return queryWords.every(
        (queryWord) =>
          tabTitle.includes(queryWord) || tabUrl.includes(queryWord),
      );
    });
  };

  // Handle search input
  searchInput.addEventListener("input", () => {
    currentQuery = searchInput.value.trim(); // Update the current query
    filteredTabs = fuzzySearch(currentQuery, allTabs);
    renderTabs(filteredTabs);
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

  // Handle keyboard navigation for Arrow keys, Alt+J, and Alt+K
  searchInput.addEventListener("keydown", (e) => {
    const items = tabList.querySelectorAll("li");
    if (items.length === 0) return;

    if (e.key === "ArrowDown" || (e.altKey && e.key === "j")) {
      e.preventDefault(); // Prevent cursor movement in input
      selectedIndex = (selectedIndex + 1) % items.length;
      highlightSelectedItem();
    } else if (e.key === "ArrowUp" || (e.altKey && e.key === "k")) {
      e.preventDefault(); // Prevent cursor movement in input
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      highlightSelectedItem();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex !== -1 && filteredTabs[selectedIndex]) {
        const selectedTab = filteredTabs[selectedIndex];
        switchTab(selectedTab.id, selectedTab.windowId);
      }
    }
  });

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

  // Initial fetch and display of tabs
  fetchAndDisplayTabs();
});
