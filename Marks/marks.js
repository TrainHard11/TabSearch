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

  // Exit if essential elements are not found, indicating an issue with HTML injection.
  if (
    !urlNameInput ||
    !urlInput ||
    !exactMatchCheckbox ||
    !addMarkButton ||
    !marksListContainer
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

  // Array to hold the current bookmarks
  let bookmarks = [];
  // To track the currently selected bookmark in the list for keyboard navigation
  let selectedMarkIndex = -1;

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
   * Navigates the interactive elements in the Marks view (input fields, add button, bookmark list).
   * This function manages the focus and the `selectedMarkIndex` for the list.
   * @param {string} direction "up" or "down".
   */
  const navigateMarksList = (direction) => {
    const items = marksListContainer.querySelectorAll(".mark-item");
    // Define all focusable elements in logical order
    // The list items need to be actual elements to be focused programmatically,
    // so we'll make them focusable via tabindex.
    const focusableElements = [
      urlNameInput,
      urlInput,
      addMarkButton,
      ...Array.from(items),
    ];

    let currentFocusIndex = -1;

    // Determine which element currently has focus
    if (document.activeElement === urlNameInput) {
      currentFocusIndex = 0;
    } else if (document.activeElement === urlInput) {
      currentFocusIndex = 1;
    } else if (document.activeElement === addMarkButton) {
      currentFocusIndex = 2;
    } else {
      // Check if focus is on a mark item (and calculate its index relative to focusableElements)
      const focusedItem = document.activeElement.closest(".mark-item");
      if (focusedItem) {
        currentFocusIndex = Array.from(items).indexOf(focusedItem) + 3; // +3 for the inputs and button
      }
    }

    let newFocusIndex = currentFocusIndex;

    if (direction === "down") {
      if (
        currentFocusIndex === -1 ||
        currentFocusIndex === focusableElements.length - 1
      ) {
        // If nothing focused or last item, cycle to first focusable
        newFocusIndex = 0;
      } else {
        newFocusIndex++;
      }
    } else if (direction === "up") {
      if (currentFocusIndex === -1 || currentFocusIndex === 0) {
        // If nothing focused or first item, cycle to last focusable
        newFocusIndex = focusableElements.length - 1;
      } else {
        newFocusIndex--;
      }
    }

    // Apply new focus
    if (newFocusIndex !== -1 && focusableElements[newFocusIndex]) {
      focusableElements[newFocusIndex].focus();

      // If the newly focused element is a mark item, update selectedMarkIndex
      if (
        newFocusIndex >= 3 &&
        focusableElements[newFocusIndex].classList.contains("mark-item")
      ) {
        selectedMarkIndex = newFocusIndex - 3; // Adjust index relative to the bookmark list
      } else {
        selectedMarkIndex = -1; // No mark item is selected in the list area
      }
    } else {
      // If there are no focusable items (e.g., empty list), ensure no selection
      selectedMarkIndex = -1;
    }
    highlightMarkItem(); // Update visual highlight based on selectedMarkIndex
  };

  /**
   * Activates (opens URL) the currently selected bookmark item.
   * It uses window.focusOrCreateTabByUrl (provided by popup.js) to handle opening or switching tabs.
   */
  const activateSelectedMarkItem = () => {
    if (selectedMarkIndex !== -1 && bookmarks[selectedMarkIndex]) {
      const selectedItem = bookmarks[selectedMarkIndex];
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
    // Only allow moving if a mark is selected and there's more than one mark
    if (selectedMarkIndex === -1 || bookmarks.length <= 1) {
      return;
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
      renderBookmarks(); // Render immediately after loading
    } catch (error) {
      console.error("Error loading bookmarks:", error);
      bookmarks = []; // Fallback to empty array on error
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
   * It also attaches click listeners for activation, removal, and reordering.
   */
  const renderBookmarks = () => {
    marksListContainer.innerHTML = ""; // Clear existing list

    if (bookmarks.length === 0) {
      // Display 'No bookmarks' message if the list is empty
      if (noMarksMessage) {
        marksListContainer.appendChild(noMarksMessage);
        noMarksMessage.classList.remove("hidden"); // Ensure it's visible
      } else {
        // If the message element wasn't found initially (e.g., first render), create it
        const msg = document.createElement("p");
        msg.classList.add("no-marks-message");
        msg.textContent = "No bookmarks added yet.";
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

    bookmarks.forEach((mark, index) => {
      const markItem = document.createElement("div");
      markItem.classList.add("mark-item");
      markItem.dataset.index = index; // Store index for removal
      markItem.dataset.url = mark.url; // Store URL for identifying after re-render (for move animation)
      markItem.tabIndex = 0; // Make list item focusable

      const markInfo = document.createElement("div");
      markInfo.classList.add("mark-info");

      const markName = document.createElement("span");
      markName.classList.add("mark-name");
      markName.textContent = mark.name;

      const markUrl = document.createElement("a");
      markUrl.classList.add("mark-url");
      markUrl.href = mark.url;
      markUrl.textContent = mark.url;
      markUrl.target = "_blank"; // Open in a new tab
      markUrl.addEventListener("click", (e) => e.stopPropagation()); // Prevent item selection when clicking URL

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
        await removeBookmark(index);
        // After removal, adjust selected index if necessary
        if (selectedMarkIndex >= bookmarks.length) {
          selectedMarkIndex = bookmarks.length > 0 ? bookmarks.length - 1 : -1;
        }
        highlightMarkItem();
      });
      actionButtonsContainer.appendChild(removeButton);

      markItem.appendChild(markInfo);
      markItem.appendChild(actionButtonsContainer); // Append action buttons container

      markItem.addEventListener("click", () => {
        selectedMarkIndex = index; // Update selected index on click
        highlightMarkItem();
        activateSelectedMarkItem();
      });

      marksListContainer.appendChild(markItem);
    });

    // Ensure selection remains valid after re-render or new load
    if (selectedMarkIndex >= bookmarks.length) {
      selectedMarkIndex = bookmarks.length > 0 ? bookmarks.length - 1 : -1;
    }
    highlightMarkItem();
  };

  /**
   * Adds a new bookmark to the list.
   */
  const addBookmark = async () => {
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
    renderBookmarks(); // Re-render the list with the new item

    // Clear input fields and reset checkbox after adding
    urlNameInput.value = "";
    urlInput.value = "";
    exactMatchCheckbox.checked = false; // Reset to default (unchecked)
    urlNameInput.focus(); // Keep focus on the name input
    selectedMarkIndex = -1; // Clear selection after adding new item
    highlightMarkItem();
  };

  /**
   * Removes a bookmark from the list by its index.
   * @param {number} index The index of the bookmark to remove.
   */
  const removeBookmark = async (index) => {
    if (index > -1 && index < bookmarks.length) {
      bookmarks.splice(index, 1); // Remove the item
      await saveBookmarks();
      renderBookmarks(); // Re-render the list
    }
  };

  /**
   * Removes the currently selected bookmark item from the list permanently.
   */
  const removeSelectedMarkItem = async () => {
    if (selectedMarkIndex !== -1 && bookmarks[selectedMarkIndex]) {
      const indexToRemove = selectedMarkIndex;
      await removeBookmark(indexToRemove); // Use existing removeBookmark function

      // After removal, adjust selected index if necessary
      if (bookmarks.length === 0) {
        selectedMarkIndex = -1;
      } else if (indexToRemove < bookmarks.length) {
        selectedMarkIndex = indexToRemove;
      } else {
        selectedMarkIndex = bookmarks.length - 1;
      }
      selectedMarkIndex = Math.max(-1, selectedMarkIndex); // Ensure it's not less than -1

      highlightMarkItem();
    }
  };

  /**
   * Handles keyboard events specific to the Marks view.
   * This function is attached/detached by popup.js when switching views.
   * @param {KeyboardEvent} e The keyboard event.
   */
  const marksKeydownHandler = (e) => {
    const activeElement = document.activeElement;
    const items = marksListContainer.querySelectorAll(".mark-item");

    if (e.key === "ArrowDown" || e.key === "j" || (e.altKey && e.key === "j")) {
      e.preventDefault();
      if (activeElement === urlNameInput) {
        urlInput.focus();
      } else if (activeElement === urlInput) {
        addMarkButton.focus();
      } else if (activeElement === addMarkButton) {
        // If on button, jump to first mark item (if any)
        if (items.length > 0) {
          selectedMarkIndex = 0;
          items[selectedMarkIndex].focus(); // Focus the DOM element
        }
      } else if (selectedMarkIndex !== -1) {
        // Navigate within the list
        selectedMarkIndex = (selectedMarkIndex + 1) % items.length;
        items[selectedMarkIndex].focus(); // Focus the DOM element
      } else if (items.length > 0) {
        // If nothing focused or first time pressing down, select first mark item
        selectedMarkIndex = 0;
        items[selectedMarkIndex].focus();
      }
      highlightMarkItem();
    } else if (
      e.key === "ArrowUp" ||
      e.key === "k" ||
      (e.altKey && e.key === "k")
    ) {
      e.preventDefault();
      if (selectedMarkIndex !== -1) {
        // Navigate within the list, or jump back to add button if at first item
        if (selectedMarkIndex === 0) {
          addMarkButton.focus();
          selectedMarkIndex = -1; // No item selected in list
        } else {
          selectedMarkIndex =
            (selectedMarkIndex - 1 + items.length) % items.length;
          items[selectedMarkIndex].focus(); // Focus the DOM element
        }
      } else if (activeElement === addMarkButton) {
        urlInput.focus();
      } else if (activeElement === urlInput) {
        urlNameInput.focus();
      } else if (activeElement === urlNameInput) {
        // Stay on urlNameInput or cycle to last item/button if desired. For now, stay.
      } else {
        // If no specific element is focused, try to focus the last mark item, or add button, then url inputs
        if (items.length > 0) {
          selectedMarkIndex = items.length - 1;
          items[selectedMarkIndex].focus();
        } else if (addMarkButton) {
          addMarkButton.focus(); // Fallback to add button if no marks
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
      } else if (
        selectedMarkIndex !== -1 &&
        document.activeElement.closest(".mark-item")
      ) {
        // If a bookmark item is selected/focused, activate it
        activateSelectedMarkItem();
      }
    } else if ((e.altKey && e.key === "p") || (e.altKey && e.key === "P")) {
      e.preventDefault();
      moveMarkItem("up");
    } else if ((e.altKey && e.key === "n") || (e.altKey && e.key === "N")) {
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
  };

  /**
   * Detaches keyboard event listeners for the Marks view.
   * Called when the Marks view becomes inactive.
   */
  const detachMarksListeners = () => {
    document.removeEventListener("keydown", marksKeydownHandler);
  };

  // Initial load of bookmarks when the initMarksFeature function is called
  await loadBookmarks();

  // Expose functions to the global window object for popup.js
  window.refreshMarks = loadBookmarks; // Allow popup.js to refresh the marks list
  window.attachMarksListeners = attachMarksListeners;
  window.detachMarksListeners = detachMarksListeners;
  window.getAllBookmarks = () => bookmarks; // Ensure this is always available after initialization
};
