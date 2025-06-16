// Marks/marks.js

// This file contains the main logic for the Marks feature,
// handling bookmark addition, removal, and persistence.

// Define a global initialization function that popup.js can call
// AFTER the marks.html content is loaded into the DOM.
window.initMarksFeature = async (defaultUrl = "", defaultTitle = "") => {
  // DOM Element References - these will only exist AFTER marks.html has been loaded
  // and its content injected into the #marksSection by popup.js.
  const urlNameInput = document.getElementById("urlNameInput");
  const urlInput = document.getElementById("urlInput");
  const exactMatchCheckbox = document.getElementById("exactMatchCheckbox");
  const addMarkButton = document.getElementById("addMarkButton");
  const marksListContainer = document.getElementById("marksList");
  const noMarksMessage = marksListContainer.querySelector(".no-marks-message");
  const marksSearchContainer = document.getElementById("marksSearchContainer"); // NEW
  const marksSearchInput = document.getElementById("marksSearchInput"); // NEW

  // Exit if essential elements are not found, indicating an issue with HTML injection.
  if (
    !urlNameInput ||
    !urlInput ||
    !exactMatchCheckbox ||
    !addMarkButton ||
    !marksListContainer ||
    !marksSearchContainer ||
    !marksSearchInput
  ) {
    console.error(
      "Marks feature: Essential DOM elements not found after initMarksFeature call.",
    );
    return;
  }

  // Set the default URL input value to the current tab's URL
  urlInput.value = defaultUrl;
  // Set the default URL Name input value to the current tab's title
  urlNameInput.value = defaultTitle;

  // Key for storing bookmarks in chrome.storage.local
  const STORAGE_KEY = "fuzzyTabSearch_bookmarks";

  // Array to hold the current bookmarks (full, unfiltered list)
  let bookmarks = [];
  // To track the currently selected bookmark in the list for keyboard navigation
  let selectedMarkIndex = -1;

  // NEW: State for the Marks search feature
  let isMarksSearchActive = false;
  let currentMarksSearchQuery = "";
  let filteredMarksResults = []; // Stores the currently filtered results for rendering

  /**
   * Highlights the query in the text. (Copied from popup.js for self-containment)
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
   * Performs a fuzzy search on a given list of items. (Copied from popup.js for self-containment)
   * Items are expected to have 'name' and 'url' properties.
   * Prioritizes name matches over URL matches.
   * @param {Array<Object>} items The array of items (marks) to search within.
   * @param {string} query The search query.
   * @param {string} nameKey The key for the name property (e.g., 'name' for marks).
   * @returns {Array<Object>} The filtered and sorted list of items.
   */
  const fuzzySearchItems = (items, query, nameKey) => {
    // Corrected parameter order
    if (!query) return items;
    const lowerCaseQuery = query.toLowerCase();
    const queryWords = lowerCaseQuery.split(" ").filter(Boolean);

    const nameMatches = [];
    const urlMatches = [];
    const processedUrls = new Set(); // To prevent duplicates

    items.forEach((item) => {
      const itemName = (item[nameKey] || "").toLowerCase();
      const itemUrl = (item.url || "").toLowerCase();

      const matchesName = queryWords.every((word) => itemName.includes(word));
      const matchesUrl = queryWords.every((word) => itemUrl.includes(word));

      if (matchesName) {
        nameMatches.push(item);
        processedUrls.add(item.url);
      } else if (matchesUrl && !processedUrls.has(item.url)) {
        urlMatches.push(item);
        processedUrls.add(item.url);
      }
    });
    return [...nameMatches, ...urlMatches];
  };

  /**
   * Highlights the currently selected item in the marks list.
   * Applies the 'selected' class and scrolls into view.
   */
  const highlightMarkItem = () => {
    const items = marksListContainer.querySelectorAll(".mark-item");
    items.forEach((item, index) => {
      if (index === selectedMarkIndex) {
        item.classList.add("selected");
        item.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else {
        item.classList.remove("selected");
      }
    });
  };

  /**
   * Navigates the interactive elements in the Marks view (input fields, add button, search input, bookmark list).
   * This function manages the focus and the `selectedMarkIndex` for the list.
   * @param {string} direction "up" or "down".
   */
  const navigateMarksList = (direction) => {
    const items = marksListContainer.querySelectorAll(".mark-item");
    let focusableElements = [urlNameInput, urlInput, addMarkButton];

    // Only add search input to focusable elements if it's currently active/visible
    if (isMarksSearchActive) {
      focusableElements.push(marksSearchInput);
    }
    focusableElements.push(...Array.from(items)); // Add bookmark items last

    let currentFocusIndex = -1;

    // Determine which element currently has focus
    const activeElement = document.activeElement;
    if (activeElement === urlNameInput) {
      currentFocusIndex = 0;
    } else if (activeElement === urlInput) {
      currentFocusIndex = 1;
    } else if (activeElement === addMarkButton) {
      currentFocusIndex = 2;
    } else if (activeElement === marksSearchInput && isMarksSearchActive) {
      currentFocusIndex = focusableElements.indexOf(marksSearchInput); // Find its dynamic index
    } else {
      // Check if focus is on a mark item
      const focusedItem = activeElement.closest(".mark-item");
      if (focusedItem) {
        currentFocusIndex = focusableElements.indexOf(focusedItem);
      }
    }

    let newFocusIndex = currentFocusIndex;

    if (direction === "down") {
      if (
        currentFocusIndex === -1 ||
        currentFocusIndex === focusableElements.length - 1
      ) {
        newFocusIndex = 0; // Cycle to the first focusable element
      } else {
        newFocusIndex++;
      }
    } else if (direction === "up") {
      if (currentFocusIndex === -1 || currentFocusIndex === 0) {
        newFocusIndex = focusableElements.length - 1; // Cycle to the last focusable element
      } else {
        newFocusIndex--;
      }
    }

    // Apply new focus
    if (newFocusIndex !== -1 && focusableElements[newFocusIndex]) {
      focusableElements[newFocusIndex].focus();

      // Update selectedMarkIndex if a bookmark item is focused
      if (focusableElements[newFocusIndex].classList.contains("mark-item")) {
        selectedMarkIndex = Array.from(items).indexOf(
          focusableElements[newFocusIndex],
        );
      } else {
        selectedMarkIndex = -1; // No mark item is selected
      }
    } else {
      selectedMarkIndex = -1; // No focusable elements, or no item selected
    }
    highlightMarkItem(); // Update visual highlight based on selectedMarkIndex
  };

  /**
   * Activates (opens URL) the currently selected bookmark item.
   * It uses window.focusOrCreateTabByUrl (provided by popup.js) to handle opening or switching tabs.
   */
  const activateSelectedMarkItem = () => {
    if (selectedMarkIndex !== -1 && filteredMarksResults[selectedMarkIndex]) {
      // Use filtered results
      const selectedItem = filteredMarksResults[selectedMarkIndex]; // Use filtered results
      if (typeof window.focusOrCreateTabByUrl === "function") {
        window.focusOrCreateTabByUrl(selectedItem.url, selectedItem.exactMatch);
      } else {
        console.error(
          "focusOrCreateTabByUrl is not available. Cannot open bookmark.",
        );
      }
    }
  };

  /**
   * Moves the currently highlighted bookmark up or down in the list.
   * This function is called by keymaps and from the UI up/down buttons.
   * It relies on `selectedMarkIndex` being set correctly before calling.
   * Introduces a visual animation for the moved item.
   * @param {string} direction "up" or "down".
   */
  const moveMarkItem = async (direction) => {
    // We only move items in the *unfiltered* list.
    // If search is active, this action is disabled or has a different effect.
    if (isMarksSearchActive) {
      console.log("Cannot reorder bookmarks while search is active.");
      return;
    }

    if (selectedMarkIndex === -1 || bookmarks.length <= 1) {
      return; // Nothing to move or only one item
    }

    let newIndex = selectedMarkIndex;
    if (direction === "up") {
      if (selectedMarkIndex === 0) {
        return; // Cannot move up from the first position
      }
      newIndex--;
    } else if (direction === "down") {
      if (selectedMarkIndex === bookmarks.length - 1) {
        return; // Cannot move down from the last position
      }
      newIndex++;
    }

    // Only perform move if the index actually changes
    if (newIndex !== selectedMarkIndex) {
      // Store the URL of the item being moved to identify it after re-render
      const movedItemUrl = bookmarks[selectedMarkIndex].url;

      // Perform the swap using array destructuring for cleaner code
      [bookmarks[selectedMarkIndex], bookmarks[newIndex]] = [
        bookmarks[newIndex],
        bookmarks[selectedMarkIndex],
      ];

      selectedMarkIndex = newIndex; // Update the selected index to the new position

      await saveBookmarks();
      renderBookmarks(); // Re-render the entire list

      // Find the moved item's new DOM element and apply the highlight class
      const movedElement = marksListContainer.querySelector(
        `.mark-item[data-url="${movedItemUrl}"]`,
      );
      if (movedElement) {
        movedElement.classList.add("moved-highlight");
        // Remove the 'moved-highlight' class after a short delay
        setTimeout(() => {
          movedElement.classList.remove("moved-highlight");
        }, 400); // Duration matches CSS transition for smooth fade-out
      }

      // Ensure the newly moved item stays focused/selected
      const items = marksListContainer.querySelectorAll(".mark-item");
      if (items[selectedMarkIndex]) {
        items[selectedMarkIndex].focus(); // Re-focus the moved item
      }

      highlightMarkItem(); // Re-highlight the item in its new position
    }
  };

  /**
   * Loads bookmarks from Chrome's local storage.
   * @returns {Promise<Array>} A promise that resolves with the loaded bookmarks array.
   */
  const loadBookmarks = async () => {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      // Ensure bookmarks is always an array, and default exactMatch to false if not present
      bookmarks = Array.isArray(result[STORAGE_KEY])
        ? result[STORAGE_KEY].map((mark) => ({
            ...mark,
            exactMatch: mark.exactMatch ?? false,
          }))
        : [];

      // On initial load, set filteredMarksResults to the full list
      if (!isMarksSearchActive || currentMarksSearchQuery === "") {
        filteredMarksResults = [...bookmarks];
      } else {
        // If search was active when reloading, re-filter
        performMarksSearch(currentMarksSearchQuery); // This will update filteredMarksResults
      }

      renderBookmarks(); // Render immediately after loading
    } catch (error) {
      console.error("Error loading bookmarks:", error);
      bookmarks = []; // Fallback to empty array on error
      filteredMarksResults = []; // Also reset filtered results
      renderBookmarks();
    }
  };

  /**
   * Saves the current bookmarks array to Chrome's local storage.
   */
  const saveBookmarks = async () => {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: bookmarks });
    } catch (error) {
      console.error("Error saving bookmarks:", error);
    }
  };

  /**
   * Renders the list of bookmarks in the UI.
   * It uses `filteredMarksResults` if a search is active, otherwise `bookmarks`.
   * It also attaches click listeners for activation, removal, and reordering.
   */
  const renderBookmarks = () => {
    marksListContainer.innerHTML = ""; // Clear existing list

    const listToRender = isMarksSearchActive ? filteredMarksResults : bookmarks;

    if (listToRender.length === 0) {
      // Display 'No bookmarks' message if the list is empty
      if (noMarksMessage) {
        marksListContainer.appendChild(noMarksMessage);
        noMarksMessage.classList.remove("hidden"); // Ensure it's visible
      } else {
        // If the message element wasn't found initially (e.g., first render), create it
        const msg = document.createElement("p");
        msg.classList.add("no-marks-message");
        msg.textContent = isMarksSearchActive
          ? "No matching bookmarks found."
          : "No bookmarks added yet.";
        marksListContainer.appendChild(msg);
      }
      // Ensure no item is selected when list is empty
      selectedMarkIndex = -1;
      return;
    } else {
      // Hide the 'No bookmarks' message if present and there are bookmarks
      if (noMarksMessage) {
        noMarksMessage.classList.add("hidden");
      }
    }

    listToRender.forEach((mark, index) => {
      const markItem = document.createElement("div");
      markItem.classList.add("mark-item");
      markItem.dataset.index = index; // Store index for removal (relative to filtered list)
      markItem.dataset.url = mark.url; // Store URL for identifying after re-render (for move animation)
      markItem.tabIndex = 0; // Make list item focusable

      const markInfo = document.createElement("div");
      markInfo.classList.add("mark-info");

      const markName = document.createElement("span");
      markName.classList.add("mark-name");
      markName.innerHTML = highlightText(
        mark.name || "",
        currentMarksSearchQuery,
      ); // Highlight name

      const markUrl = document.createElement("a");
      markUrl.classList.add("mark-url");
      markUrl.href = mark.url;
      markUrl.innerHTML = highlightText(
        mark.url || "",
        currentMarksSearchQuery,
      ); // Highlight URL
      markUrl.target = "_blank"; // Open in a new tab
      // Prevent default navigation for the URL link within the item
      markUrl.addEventListener("click", (e) => {
        e.preventDefault(); // Stop default browser action (opening URL)
        e.stopPropagation(); // Stop event from bubbling up to the markItem click listener
      });

      // Display exact match status
      const exactMatchStatus = document.createElement("span");
      exactMatchStatus.classList.add("exact-match-status");
      exactMatchStatus.textContent = mark.exactMatch ? " [Exact Match]" : "";
      exactMatchStatus.style.fontWeight = "bold";
      exactMatchStatus.style.color = mark.exactMatch ? "#98c379" : "#a0a0a0"; // Green for exact, grey for partial

      markInfo.appendChild(markName);
      markInfo.appendChild(markUrl);
      markInfo.appendChild(exactMatchStatus); // Append status

      const actionButtonsContainer = document.createElement("div");
      actionButtonsContainer.classList.add("marks-action-buttons"); // Use marks-specific class

      // Up button
      const upButton = document.createElement("button");
      upButton.classList.add("marks-move-button", "marks-move-up"); // Use marks-specific class
      upButton.innerHTML = "&#9650;"; // Up arrow character
      upButton.title = "Move Up";
      upButton.setAttribute("aria-label", "Move Bookmark Up"); // Accessibility
      upButton.addEventListener("click", async (e) => {
        e.stopPropagation(); // Prevent item selection
        selectedMarkIndex = index; // Set index before moving
        highlightMarkItem(); // Highlight immediately
        await moveMarkItem("up");
      });
      actionButtonsContainer.appendChild(upButton);

      // Down button
      const downButton = document.createElement("button");
      downButton.classList.add("marks-move-button", "marks-move-down"); // Use marks-specific class
      downButton.innerHTML = "&#9660;"; // Down arrow character
      downButton.title = "Move Down";
      downButton.setAttribute("aria-label", "Move Bookmark Down"); // Accessibility
      downButton.addEventListener("click", async (e) => {
        e.stopPropagation(); // Prevent item selection
        selectedMarkIndex = index; // Set index before moving
        highlightMarkItem(); // Highlight immediately
        await moveMarkItem("down");
      });
      actionButtonsContainer.appendChild(downButton);

      // Remove button
      const removeButton = document.createElement("button");
      removeButton.classList.add("remove-mark-button");
      removeButton.innerHTML = "✕"; // X icon
      removeButton.title = "Remove Bookmark";
      removeButton.setAttribute("aria-label", "Remove Bookmark"); // Accessibility
      removeButton.addEventListener("click", async (e) => {
        e.stopPropagation(); // Prevent item selection
        await removeBookmark(index); // This index is relative to the filtered list now!
        // After removal, adjust selected index if necessary
        if (selectedMarkIndex >= filteredMarksResults.length) {
          // Check filtered length
          selectedMarkIndex =
            filteredMarksResults.length > 0
              ? filteredMarksResults.length - 1
              : -1;
        }
        highlightMarkItem();
      });
      actionButtonsContainer.appendChild(removeButton);

      markItem.appendChild(markInfo);
      markItem.appendChild(actionButtonsContainer); // Append action buttons container

      // Main click listener for the entire mark item
      markItem.addEventListener("click", () => {
        selectedMarkIndex = index; // Update selected index on click
        highlightMarkItem();
        activateSelectedMarkItem();
      });

      marksListContainer.appendChild(markItem);
    });

    // Ensure selection remains valid after re-render or new load
    if (selectedMarkIndex >= listToRender.length) {
      // Use listToRender length
      selectedMarkIndex =
        listToRender.length > 0 ? listToRender.length - 1 : -1;
    }
    highlightMarkItem();
  };

  /**
   * Adds a new bookmark to the list.
   */
  const addBookmark = async () => {
    console.log("addBookmark called!"); // Debugging log

    const name = urlNameInput.value.trim();
    let url = urlInput.value.trim();
    const exactMatch = exactMatchCheckbox.checked; // Get exact match state

    // Remove error classes before validation
    urlNameInput.classList.remove("input-error");
    urlInput.classList.remove("input-error");

    if (!name || !url) {
      if (!name) urlNameInput.classList.add("input-error");
      if (!url) urlInput.classList.add("input-error");
      return;
    }

    // Add new bookmark with exactMatch property
    bookmarks.push({ name, url, exactMatch });
    await saveBookmarks();

    // After adding, clear any active search and refresh the full list
    clearMarksSearchState();
    urlNameInput.focus(); // Keep focus on the name input
    // loadBookmarks() will be called by clearMarksSearchState() which re-renders

    selectedMarkIndex = -1; // Clear selection after adding new item
    highlightMarkItem();
  };

  /**
   * Removes a bookmark from the list by its index.
   * Note: This index is the *displayed* index (from filteredMarksResults).
   * We need to find the original index in `bookmarks` to remove it.
   * @param {number} displayedIndex The index of the bookmark to remove from the currently displayed list.
   */
  const removeBookmark = async (displayedIndex) => {
    if (displayedIndex > -1 && displayedIndex < filteredMarksResults.length) {
      const markToRemove = filteredMarksResults[displayedIndex];
      // Find the index of this mark in the original, unfiltered 'bookmarks' array
      const originalIndex = bookmarks.findIndex(
        (mark) =>
          mark.url === markToRemove.url && mark.name === markToRemove.name,
      );

      if (originalIndex > -1) {
        bookmarks.splice(originalIndex, 1); // Remove the item from the original list
        await saveBookmarks();

        // If search is active, re-filter the list; otherwise, just re-render the full list
        if (isMarksSearchActive) {
          performMarksSearch(currentMarksSearchQuery);
        } else {
          filteredMarksResults = [...bookmarks]; // Sync filtered results with full list
          renderBookmarks();
        }
      }
    }
  };

  /**
   * Removes the currently selected bookmark item from the list permanently.
   */
  const removeSelectedMarkItem = async () => {
    if (selectedMarkIndex !== -1 && filteredMarksResults[selectedMarkIndex]) {
      const indexToRemove = selectedMarkIndex;
      await removeBookmark(indexToRemove); // Use existing removeBookmark function

      // After removal, adjust selected index if necessary
      if (filteredMarksResults.length === 0) {
        selectedMarkIndex = -1;
      } else if (indexToRemove < filteredMarksResults.length) {
        selectedMarkIndex = indexToRemove;
      } else {
        selectedMarkIndex = filteredMarksResults.length - 1;
      }
      selectedMarkIndex = Math.max(-1, selectedMarkIndex); // Ensure it's not less than -1

      highlightMarkItem();
    }
  };

  /**
   * NEW: Performs a search on the bookmarks and updates the displayed list.
   * @param {string} query The search query.
   */
  const performMarksSearch = (query) => {
    currentMarksSearchQuery = query.trim();
    if (currentMarksSearchQuery === "") {
      filteredMarksResults = [...bookmarks]; // If query is empty, show all bookmarks
    } else {
      // Pass the items first, then the query, then the key
      filteredMarksResults = fuzzySearchItems(
        bookmarks,
        currentMarksSearchQuery,
        "name",
      );
    }
    selectedMarkIndex = filteredMarksResults.length > 0 ? 0 : -1; // Select first result if any
    renderBookmarks();
    highlightMarkItem();
  };

  /**
   * NEW: Clears the Marks search state and reverts the list to its full, unfiltered state.
   */
  const clearMarksSearchState = () => {
    isMarksSearchActive = false;
    currentMarksSearchQuery = "";
    marksSearchInput.value = "";
    marksSearchContainer.classList.add("hidden"); // Hide the search input
    filteredMarksResults = [...bookmarks]; // Show all bookmarks
    selectedMarkIndex = -1; // Clear list selection
    renderBookmarks();
  };

  /**
   * Handles keyboard events specific to the Marks view.
   * This function is attached/detached by popup.js when switching views.
   * @param {KeyboardEvent} e The keyboard event.
   */
  const marksKeydownHandler = (e) => {
    const activeElement = document.activeElement;
    const items = marksListContainer.querySelectorAll(".mark-item");

    // Allow j/k to be typed normally in inputs if Alt is NOT pressed
    if (
      !e.altKey &&
      (activeElement === urlNameInput ||
        activeElement === urlInput ||
        activeElement === marksSearchInput)
    ) {
      if (e.key === "j" || e.key === "k") {
        // Allow j/k to be typed normally in inputs
        return;
      }
    }

    if (e.key === "ArrowDown" || e.key === "j" || (e.altKey && e.key === "j")) {
      e.preventDefault();
      // Order of navigation: Name Input -> URL Input -> Add Button -> Search Input -> Bookmark List
      if (activeElement === urlNameInput) {
        urlInput.focus();
      } else if (activeElement === urlInput) {
        addMarkButton.focus();
      } else if (activeElement === addMarkButton) {
        if (isMarksSearchActive) {
          marksSearchInput.focus();
          selectedMarkIndex = -1; // Ensure no list item is selected visually initially
        } else if (items.length > 0) {
          selectedMarkIndex = 0;
          items[selectedMarkIndex].focus();
        }
      } else if (activeElement === marksSearchInput && isMarksSearchActive) {
        // If on search input, navigate to first bookmark item IF there are results
        if (filteredMarksResults.length > 0) {
          selectedMarkIndex = 0;
          items[selectedMarkIndex].focus();
        }
        // Else, if no results, stay focused on marksSearchInput. Don't move to urlNameInput.
      } else if (selectedMarkIndex !== -1) {
        // Navigate within the list
        selectedMarkIndex = (selectedMarkIndex + 1) % items.length;
        items[selectedMarkIndex].focus();
      } else if (items.length > 0) {
        // If nothing focused or first time pressing down, select first mark item
        selectedMarkIndex = 0;
        items[selectedMarkIndex].focus();
      } else {
        // If no items, and not on input/button/search, cycle to name input
        urlNameInput.focus();
        selectedMarkIndex = -1;
      }
      highlightMarkItem();
    } else if (
      e.key === "ArrowUp" ||
      e.key === "k" ||
      (e.altKey && e.key === "k")
    ) {
      e.preventDefault();
      // Order of navigation: Bookmark List -> Search Input -> Add Button -> URL Input -> Name Input
      if (selectedMarkIndex !== -1) {
        // Navigate within the list, or jump back to search/add button if at first item
        if (selectedMarkIndex === 0) {
          if (isMarksSearchActive) {
            marksSearchInput.focus();
          } else {
            addMarkButton.focus();
          }
          selectedMarkIndex = -1; // No item selected in list
        } else {
          selectedMarkIndex =
            (selectedMarkIndex - 1 + items.length) % items.length;
          items[selectedMarkIndex].focus();
        }
      } else if (activeElement === marksSearchInput && isMarksSearchActive) {
        addMarkButton.focus();
      } else if (activeElement === addMarkButton) {
        urlInput.focus();
      } else if (activeElement === urlInput) {
        urlNameInput.focus();
      } else if (activeElement === urlNameInput) {
        // If on name input, cycle to last list item (or search/add button if empty)
        if (items.length > 0) {
          selectedMarkIndex = items.length - 1;
          items[selectedMarkIndex].focus();
        } else if (isMarksSearchActive) {
          marksSearchInput.focus();
        } else {
          addMarkButton.focus();
        }
      } else {
        // If no specific element is focused, try to focus the last focusable element
        if (items.length > 0) {
          selectedMarkIndex = items.length - 1;
          items[selectedMarkIndex].focus();
        } else if (isMarksSearchActive) {
          marksSearchInput.focus();
        } else if (addMarkButton) {
          addMarkButton.focus();
        } else if (urlInput) {
          urlInput.focus();
        } else if (urlNameInput) {
          urlNameInput.focus();
        }
      }
      highlightMarkItem();
    } else if (e.key === "Enter") {
      e.preventDefault(); // Prevent default browser behavior for Enter key

      if (document.activeElement === addMarkButton) {
        addBookmark(); // Directly call addBookmark if the button is focused
      } else if (
        document.activeElement === urlNameInput ||
        document.activeElement === urlInput
      ) {
        addBookmark(); // Directly call addBookmark if an input field is focused
      } else if (activeElement === marksSearchInput && isMarksSearchActive) {
        // If on search input and enter is pressed, and there are results, activate the first one
        if (filteredMarksResults.length > 0) {
          selectedMarkIndex = 0; // Ensure first item is selected for activation
          activateSelectedMarkItem();
        } else {
          // No search results, maybe perform a google search or just stay
          console.log("No search results for marks to activate.");
        }
      } else if (
        selectedMarkIndex !== -1 &&
        document.activeElement.closest(".mark-item")
      ) {
        // If a bookmark item is selected/focused, activate it
        activateSelectedMarkItem();
      }
    } else if (
      e.key === "/" &&
      !isMarksSearchActive &&
      activeElement !== urlNameInput &&
      activeElement !== urlInput &&
      activeElement !== addMarkButton
    ) {
      // NEW: Trigger search mode on '/'
      e.preventDefault(); // Prevent typing '/'
      isMarksSearchActive = true;
      marksSearchContainer.classList.remove("hidden");
      marksSearchInput.focus();
      selectedMarkIndex = -1; // Clear current selection visually
      highlightMarkItem(); // Update highlight
      performMarksSearch(currentMarksSearchQuery); // Re-render with existing (empty) query
    } else if (e.key === "Escape" && isMarksSearchActive) {
      // NEW: Exit search mode on Escape key
      e.preventDefault();
      clearMarksSearchState();
      addMarkButton.focus(); // Return focus to the add button
    } else if ((e.altKey && e.key === "p") || (e.altKey && e.key === "P")) {
      e.preventDefault();
      moveMarkItem("up");
    } else if (e.altKey && (e.key === "n" || e.key === "N")) {
      e.preventDefault();
      moveMarkItem("down");
    } else if (e.ctrlKey && e.key === "d") {
      e.preventDefault();
      removeSelectedMarkItem();
    }
  };

  /**
   * Attaches keyboard event listeners for the Marks view.
   * Called when the Marks view becomes active.
   */
  const attachMarksListeners = () => {
    document.addEventListener("keydown", marksKeydownHandler);
    // Initial focus when the Marks view is opened
    addMarkButton.focus(); // Focus the add bookmark button as requested
    selectedMarkIndex = -1; // Reset selected index visually
    highlightMarkItem(); // Ensure no highlight initially on list
    clearMarksSearchState(); // Ensure search is cleared when view is opened
  };

  /**
   * Detaches keyboard event listeners for the Marks view.
   * Called when the Marks view becomes inactive.
   */
  const detachMarksListeners = () => {
    document.removeEventListener("keydown", marksKeydownHandler);
    clearMarksSearchState(); // Clear search state when view becomes inactive
  };

  // Initial load of bookmarks when the initMarksFeature function is called
  await loadBookmarks();

  // NEW: Add event listener for marks search input
  marksSearchInput.addEventListener("input", () => {
    performMarksSearch(marksSearchInput.value);
  });

  // NEW: Add a click listener to the document to detect clicks outside the marks container
  // and clear the search if active.
  document.addEventListener("click", (e) => {
    // Check if the click occurred outside the marks-content area AND marks search is active
    const marksContent = document.querySelector(".marks-content");
    if (
      isMarksSearchActive &&
      marksContent &&
      !marksContent.contains(e.target)
    ) {
      clearMarksSearchState();
    }
  });

  // Expose functions to the global window object for popup.js
  window.refreshMarks = loadBookmarks; // Allow popup.js to refresh the marks list
  window.attachMarksListeners = attachMarksListeners;
  window.detachMarksListeners = detachMarksListeners;
  window.getAllBookmarks = () => bookmarks; // Ensure this is always available after initialization

  // Ensure the addMarkButton's direct click listener is robustly set.
  addMarkButton.addEventListener("click", addBookmark);
};
