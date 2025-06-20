// Define a global initialization function that popup.js can call
// AFTER the harpoon.html content is loaded into the DOM.
window.initHarpoonFeature = async () => {
  // DOM Element References
  const harpoonListContainer = document.getElementById("harpoonList");
  const workListSection = document.getElementById("workListSection");
  const workListContainer = document.getElementById("workList");
  const funListSection = document.getElementById("funListSection");
  const funListContainer = document.getElementById("funList");
  const harpoonInfoText = document.querySelector("#harpoonSection .settings-hint");


  if (!harpoonListContainer || !workListContainer || !funListContainer || !workListSection || !funListSection) {
    console.error(
      "Harpoon feature: Essential DOM elements not found after initHarpoonFeature call.",
    );
    return;
  }

  // Messages for empty lists (already exist in HTML)
  const noHarpoonedMessage = harpoonListContainer.querySelector(
    ".no-harpooned-message",
  );
  const noWorkMessage = workListContainer.querySelector(
    ".no-harpooned-message",
  ); // Reusing class
  const noFunMessage = funListContainer.querySelector(
    ".no-harpooned-message",
  ); // Reusing class

  // State Variables
  let selectedHarpoonIndex = -1; // For the main harpoon list
  let selectedWorkIndex = -1; // New
  let selectedFunIndex = -1; // New

  let harpoonedTabs = [];
  let workTabs = []; // New
  let funTabs = []; // New

  let workListVisible = true; // New: Default visibility state
  let funListVisible = true; // New: Default visibility state


  // Storage Keys (from background.js constants, ensure consistency)
  const LS_HARPOONED_TABS_KEY = "fuzzyTabSearch_harpoonedTabs";
  const LS_WORK_TABS_KEY = "fuzzyTabSearch_workTabs"; // New key
  const LS_FUN_TABS_KEY = "fuzzyTabSearch_funTabs"; // New key
  const LS_WORK_LIST_VISIBLE_KEY = "fuzzyTabSearch_workListVisible"; // New key for visibility
  const LS_FUN_LIST_VISIBLE_KEY = "fuzzyTabSearch_funListVisible"; // New key for visibility

  const INITIAL_HARPOON_URL_KEY = "fuzzyTabSearch_initialHarpoonUrl"; // Corrected variable name

  const MAX_HARPOON_LINKS = 4; // Consistent with background.js
  const MAX_WORK_LINKS = 4; // Max items for work list
  const MAX_FUN_LINKS = 4; // Max items for fun list

  /**
   * Highlights the currently selected item in the specified list.
   * Applies the 'selected' class and scrolls into view.
   * @param {HTMLElement} listContainer The container of the list (e.g., harpoonListContainer, workListContainer).
   * @param {number} index The index of the item to highlight.
   */
  const highlightItem = (listContainer, index) => {
    const items = listContainer.querySelectorAll(".harpoon-item");
    items.forEach((item, i) => {
      if (i === index) {
        item.classList.add("selected");
        item.focus(); // Ensure the actual DOM element is focused for keyboard navigation
        item.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else {
        item.classList.remove("selected");
      }
    });
  };

  /**
   * Navigates within a single list.
   * @param {string} direction "up" or "down".
   * @param {Array<Object>} list The array representing the list.
   * @param {number} currentIndex The current selected index for that list.
   * @returns {{newIndex: number, movedBeyondBounds: boolean}} The new index and if it moved beyond list bounds.
   */
  const navigateSingleList = (direction, list, currentIndex) => {
    if (list.length === 0) {
      return { newIndex: -1, movedBeyondBounds: true };
    }

    let newIndex = currentIndex;
    let movedBeyondBounds = false;

    if (newIndex === -1) {
      newIndex = direction === "down" ? 0 : list.length - 1;
    } else if (direction === "down") {
      newIndex++;
      if (newIndex >= list.length) {
        newIndex = -1; // Indicates moved past the end
        movedBeyondBounds = true;
      }
    } else if (direction === "up") {
      newIndex--;
      if (newIndex < 0) {
        newIndex = -1; // Indicates moved past the beginning
        movedBeyondBounds = true;
      }
    }
    return { newIndex, movedBeyondBounds };
  };

  /**
   * Cycles through all visible lists continuously.
   * @param {string} direction "up" or "down".
   * @returns {void} Updates the global selected indices.
   */
  const cycleThroughAllVisibleLists = (direction) => {
    const allLists = [];
    if (harpoonedTabs.length > 0) allLists.push({ type: 'harpoon', data: harpoonedTabs, selectedIndex: selectedHarpoonIndex, container: harpoonListContainer });
    if (workListVisible && workTabs.length > 0) allLists.push({ type: 'work', data: workTabs, selectedIndex: selectedWorkIndex, container: workListContainer });
    if (funListVisible && funTabs.length > 0) allLists.push({ type: 'fun', data: funTabs, selectedIndex: selectedFunIndex, container: funListContainer });

    if (allLists.length === 0) {
      selectedHarpoonIndex = selectedWorkIndex = selectedFunIndex = -1;
      highlightAllLists();
      return;
    }

    // Find the currently active list
    let activeListIndex = -1;
    if (selectedHarpoonIndex !== -1) activeListIndex = allLists.findIndex(l => l.type === 'harpoon');
    else if (selectedWorkIndex !== -1) activeListIndex = allLists.findIndex(l => l.type === 'work');
    else if (selectedFunIndex !== -1) activeListIndex = allLists.findIndex(l => l.type === 'fun');

    // If nothing is selected, start at the beginning/end of the first/last list
    if (activeListIndex === -1) {
        if (direction === "down") {
            activeListIndex = 0;
            updateSelectedIndices(allLists[activeListIndex].type, 0);
        } else { // "up"
            activeListIndex = allLists.length - 1;
            updateSelectedIndices(allLists[activeListIndex].type, allLists[activeListIndex].data.length - 1);
        }
        highlightAllLists();
        return;
    }

    let currentList = allLists[activeListIndex];
    let currentIndexInList = currentList.selectedIndex;

    let { newIndex, movedBeyondBounds } = navigateSingleList(direction, currentList.data, currentIndexInList);

    if (movedBeyondBounds) {
      let nextListIndex;
      if (direction === "down") {
        nextListIndex = (activeListIndex + 1) % allLists.length;
      } else { // "up"
        nextListIndex = (activeListIndex - 1 + allLists.length) % allLists.length;
      }

      let nextList = allLists[nextListIndex];
      let newIndexInNextList = direction === "down" ? 0 : nextList.data.length - 1;
      updateSelectedIndices(nextList.type, newIndexInNextList);
    } else {
      updateSelectedIndices(currentList.type, newIndex);
    }
    highlightAllLists();
  };

  /**
   * Helper to update the correct global selected index and clear others.
   */
  const updateSelectedIndices = (type, index) => {
    selectedHarpoonIndex = -1;
    selectedWorkIndex = -1;
    selectedFunIndex = -1;

    if (type === 'harpoon') selectedHarpoonIndex = index;
    else if (type === 'work') selectedWorkIndex = index;
    else if (type === 'fun') selectedFunIndex = index;
  };

  /**
   * Helper to highlight all lists (will de-highlight previously selected, highlight new).
   */
  const highlightAllLists = () => {
    highlightItem(harpoonListContainer, selectedHarpoonIndex);
    highlightItem(workListContainer, selectedWorkIndex);
    highlightItem(funListContainer, selectedFunIndex);
  };


  /**
   * Activates the specified tab/link.
   * @param {Object} item The item object (harpooned tab, work link, fun link).
   */
  const activateItem = async (item) => {
    try {
      // We assume window.focusOrCreateTabByUrl is available from popup.js
      if (typeof window.focusOrCreateTabByUrl === "function") {
        window.focusOrCreateTabByUrl(item.url, false); // Harpooned tabs are generally not exact match
      } else {
        console.error(
          "focusOrCreateTabByUrl is not available in popup.js context. Falling back to background message.",
        );
        // Fallback to sending a message to background script if direct call fails
        await chrome.runtime.sendMessage({
          action: "openTabOrSwitch",
          url: item.url,
          exactMatch: false,
        });
      }
    } catch (error) {
      console.error("Error activating harpooned tab:", error);
    }
  };

  /**
   * Moves the currently highlighted harpooned tab up or down in the list (non-cycling).
   * This function is specific to the main harpoon list.
   * @param {string} direction "up" or "down".
   */
  const moveHarpoonItem = async (direction) => {
    if (selectedHarpoonIndex === -1 || harpoonedTabs.length <= 1) {
      return; // Nothing to move or only one item
    }

    let newIndex = selectedHarpoonIndex;
    if (direction === "up") {
      if (selectedHarpoonIndex === 0) {
        return; // Cannot move up from the first position
      }
      newIndex--;
    } else if (direction === "down") {
      if (selectedHarpoonIndex === harpoonedTabs.length - 1) {
        return; // Cannot move down from the last position
      }
      newIndex++;
    }

    // Only perform move if the index actually changes
    if (newIndex !== selectedHarpoonIndex) {
      // Store the URL of the item being moved to identify it after re-render
      const movedItemUrl = harpoonedTabs[selectedHarpoonIndex].url;

      // Perform the swap using array destructuring for cleaner code
      [harpoonedTabs[selectedHarpoonIndex], harpoonedTabs[newIndex]] = [
        harpoonedTabs[newIndex],
        harpoonedTabs[selectedHarpoonIndex],
      ];

      selectedHarpoonIndex = newIndex; // Update the selected index to the new position

      await saveHarpoonedTabs();
      renderHarpoonedTabs(); // Re-render the entire list

      // Find the moved item's new DOM element and apply the highlight class
      const movedElement = harpoonListContainer.querySelector(
        `.harpoon-item[data-url="${movedItemUrl}"]`,
      );
      if (movedElement) {
        movedElement.classList.add("moved-highlight");
        // Remove the 'moved-highlight' class after a short delay
        setTimeout(() => {
          movedElement.classList.remove("moved-highlight");
        }, 400); // Duration matches CSS transition for smooth fade-out
      }

      highlightItem(harpoonListContainer, selectedHarpoonIndex); // Re-highlight the item in its new position
    }
  };

  /**
   * Saves the current list of harpooned tabs to chrome.storage.local.
   */
  const saveHarpoonedTabs = async () => {
    try {
      await chrome.storage.local.set({
        [LS_HARPOONED_TABS_KEY]: harpoonedTabs,
      });
    } catch (error) {
      console.error("Error saving harpooned tabs to local storage:", error);
    }
  };

  /**
   * Loads harpooned tabs from chrome.storage.local.
   */
  const loadHarpoonedTabsFromStorage = async () => {
    try {
      const result = await chrome.storage.local.get(LS_HARPOONED_TABS_KEY);
      return result[LS_HARPOONED_TABS_KEY] || [];
    } catch (error) {
      console.error("Error loading harpooned tabs from local storage:", error);
      return [];
    }
  };

  // --- New Work/Fun List Storage Functions ---
  const saveWorkTabs = async () => {
    try {
      await chrome.storage.local.set({ [LS_WORK_TABS_KEY]: workTabs });
    } catch (error) {
      console.error("Error saving work tabs to local storage:", error);
    }
  };

  const loadWorkTabsFromStorage = async () => {
    try {
      const result = await chrome.storage.local.get(LS_WORK_TABS_KEY);
      return result[LS_WORK_TABS_KEY] || [];
    } catch (error) {
      console.error("Error loading work tabs from local storage:", error);
      return [];
    }
  };

  const saveFunTabs = async () => {
    try {
      await chrome.storage.local.set({ [LS_FUN_TABS_KEY]: funTabs });
    } catch (error) {
      console.error("Error saving fun tabs to local storage:", error);
    }
  };

  const loadFunTabsFromStorage = async () => {
    try {
      const result = await chrome.storage.local.get(LS_FUN_TABS_KEY);
      return result[LS_FUN_TABS_KEY] || [];
    } catch (error) {
      console.error("Error loading fun tabs from local storage:", error);
      return [];
    }
  };

  // --- New: Visibility State Storage Functions ---
  const saveWorkListVisibility = async (isVisible) => {
    try {
      await chrome.storage.local.set({ [LS_WORK_LIST_VISIBLE_KEY]: isVisible });
    } catch (error) {
      console.error("Error saving work list visibility:", error);
    }
  };

  const loadWorkListVisibility = async () => {
    try {
      const result = await chrome.storage.local.get({ [LS_WORK_LIST_VISIBLE_KEY]: true }); // Default to visible
      return result[LS_WORK_LIST_VISIBLE_KEY];
    } catch (error) {
      console.error("Error loading work list visibility:", error);
      return true;
    }
  };

  const saveFunListVisibility = async (isVisible) => {
    try {
      await chrome.storage.local.set({ [LS_FUN_LIST_VISIBLE_KEY]: isVisible });
    } catch (error) {
      console.error("Error saving fun list visibility:", error);
    }
  };

  const loadFunListVisibility = async () => {
    try {
      const result = await chrome.storage.local.get({ [LS_FUN_LIST_VISIBLE_KEY]: true }); // Default to visible
      return result[LS_FUN_LIST_VISIBLE_KEY];
    } catch (error) {
      console.error("Error loading fun list visibility:", error);
      return true;
    }
  };

  /**
   * Creates a single harpoon-like list item element.
   * @param {Object} item The item data (url, title, favIconUrl).
   * @param {number} index The index of the item in its list.
   * @param {string} listType 'harpoon', 'work', or 'fun'.
   * @returns {HTMLElement} The created list item div.
   */
  const createHarpoonItemElement = (item, index, listType) => {
    const harpoonItem = document.createElement("div");
    harpoonItem.classList.add("harpoon-item");
    harpoonItem.dataset.index = index; // Store index for direct access
    harpoonItem.dataset.url = item.url; // Store URL for identifying after re-render
    harpoonItem.dataset.listType = listType; // Store list type for removal
    harpoonItem.tabIndex = 0; // Make item focusable for keyboard navigation

    const favicon = document.createElement("img");
    favicon.classList.add("favicon");
    favicon.alt = "icon";
    favicon.src = item.favIconUrl || chrome.runtime.getURL("img/icon.png"); // Fallback icon

    const harpoonInfo = document.createElement("div");
    harpoonInfo.classList.add("harpoon-info");

    const harpoonTitle = document.createElement("span");
    harpoonTitle.classList.add("harpoon-title");
    harpoonTitle.textContent = item.title;

    const harpoonUrl = document.createElement("a");
    harpoonUrl.classList.add("harpoon-url");
    harpoonUrl.href = item.url;
    harpoonUrl.textContent = item.url;
    harpoonUrl.target = "_blank"; // Open in a new tab
    // Prevent default navigation for the URL link within the item
    harpoonUrl.addEventListener("click", (e) => {
      e.preventDefault(); // Stop default browser action (opening URL)
      e.stopPropagation(); // Stop event from bubbling up to the harpoonItem click listener
    });

    harpoonInfo.appendChild(harpoonTitle);
    harpoonInfo.appendChild(harpoonUrl);

    const actionButtonsContainer = document.createElement("div");
    actionButtonsContainer.classList.add("harpoon-action-buttons");

    // Add specific buttons based on list type
    if (listType === "harpoon") {
      // Up button (only for main harpoon list)
      const upButton = document.createElement("button");
      upButton.classList.add("harpoon-move-button", "harpoon-move-up");
      upButton.innerHTML = "▲"; // Up arrow character
      upButton.title = "Move Up";
      upButton.setAttribute("aria-label", "Move Harpooned Tab Up"); // Accessibility
      upButton.addEventListener("click", async (e) => {
        e.stopPropagation();
        selectedHarpoonIndex = index; // Set index before moving
        highlightItem(harpoonListContainer, selectedHarpoonIndex); // Highlight immediately
        await moveHarpoonItem("up");
      });
      actionButtonsContainer.appendChild(upButton);

      // Down button (only for main harpoon list)
      const downButton = document.createElement("button");
      downButton.classList.add("harpoon-move-button", "harpoon-move-down");
      downButton.innerHTML = "▼"; // Down arrow character
      downButton.title = "Move Down";
      downButton.setAttribute("aria-label", "Move Harpooned Tab Down"); // Accessibility
      downButton.addEventListener("click", async (e) => {
        e.stopPropagation();
        selectedHarpoonIndex = index; // Set index before moving
        highlightItem(harpoonListContainer, selectedHarpoonIndex); // Highlight immediately
        await moveHarpoonItem("down");
      });
      actionButtonsContainer.appendChild(downButton);
    }

    // Remove button (for all list types)
    const removeButton = document.createElement("button");
    removeButton.classList.add("remove-harpoon-button");
    removeButton.innerHTML = "✕"; // X icon
    removeButton.title = `Remove ${listType} Link`;
    removeButton.setAttribute("aria-label", `Remove ${listType} Link`); // Accessibility
    removeButton.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (listType === "harpoon") {
        await removeHarpoonedTabFromList(item.url);
        // After removal, adjust selected index if necessary
        if (selectedHarpoonIndex >= harpoonedTabs.length) {
          selectedHarpoonIndex =
            harpoonedTabs.length > 0 ? harpoonedTabs.length - 1 : -1;
        }
        highlightItem(harpoonListContainer, selectedHarpoonIndex);
      } else if (listType === "work") {
        await removeWorkItem(item.url);
        if (selectedWorkIndex >= workTabs.length) {
          selectedWorkIndex = workTabs.length > 0 ? workTabs.length - 1 : -1;
        }
        highlightItem(workListContainer, selectedWorkIndex);
      } else if (listType === "fun") {
        await removeFunItem(item.url);
        if (selectedFunIndex >= funTabs.length) {
          selectedFunIndex = funTabs.length > 0 ? funTabs.length - 1 : -1;
        }
        highlightItem(funListContainer, selectedFunIndex);
      }
    });
    actionButtonsContainer.appendChild(removeButton);

    harpoonItem.appendChild(favicon);
    harpoonItem.appendChild(harpoonInfo);
    harpoonItem.appendChild(actionButtonsContainer);

    harpoonItem.addEventListener("click", () => {
      // Set the appropriate selected index based on the list type
      if (listType === "harpoon") {
        selectedHarpoonIndex = index;
        selectedWorkIndex = -1; // Deselect other lists
        selectedFunIndex = -1;
      } else if (listType === "work") {
        selectedWorkIndex = index;
        selectedHarpoonIndex = -1; // Deselect other lists
        selectedFunIndex = -1;
      } else if (listType === "fun") {
        selectedFunIndex = index;
        selectedHarpoonIndex = -1; // Deselect other lists
        selectedWorkIndex = -1;
      }
      // Highlight all lists (this will correctly highlight only the newly selected one)
      highlightAllLists();

      activateItem(item);
    });

    return harpoonItem;
  };

  /**
   * Renders the list of harpooned tabs in the UI.
   */
  const renderHarpoonedTabs = () => {
    harpoonListContainer.innerHTML = ""; // Clear existing list

    if (harpoonedTabs.length === 0) {
      noHarpoonedMessage.classList.remove("hidden");
      harpoonListContainer.appendChild(noHarpoonedMessage);
      return;
    } else {
      noHarpoonedMessage.classList.add("hidden");
    }

    harpoonedTabs.forEach((harpoonedTab, index) => {
      const itemElement = createHarpoonItemElement(
        harpoonedTab,
        index,
        "harpoon",
      );
      harpoonListContainer.appendChild(itemElement);
    });
  };

  // --- New: Render Functions for Work/Fun Lists ---
  const renderWorkTabs = () => {
    workListContainer.innerHTML = ""; // Clear existing list

    if (workTabs.length === 0) {
      noWorkMessage.classList.remove("hidden");
      workListContainer.appendChild(noWorkMessage);
      return;
    } else {
      noWorkMessage.classList.add("hidden");
    }

    workTabs.forEach((workItem, index) => {
      const itemElement = createHarpoonItemElement(workItem, index, "work");
      workListContainer.appendChild(itemElement);
    });
  };

  const renderFunTabs = () => {
    funListContainer.innerHTML = ""; // Clear existing list

    if (funTabs.length === 0) {
      noFunMessage.classList.remove("hidden");
      funListContainer.appendChild(noFunMessage);
      return;
    } else {
      noFunMessage.classList.add("hidden");
    }

    funTabs.forEach((funItem, index) => {
      const itemElement = createHarpoonItemElement(funItem, index, "fun");
      funListContainer.appendChild(itemElement);
    });
  };

  /**
   * Removes a harpooned tab from the list by updating chrome.storage.local directly.
   * This will also trigger a re-render.
   * @param {string} urlToRemove The URL of the tab to remove.
   */
  const removeHarpoonedTabFromList = async (urlToRemove) => {
    harpoonedTabs = harpoonedTabs.filter((tab) => tab.url !== urlToRemove);
    await saveHarpoonedTabs();
    renderHarpoonedTabs();
  };

  // --- New: Remove Functions for Work/Fun Lists ---
  const removeWorkItem = async (urlToRemove) => {
    workTabs = workTabs.filter((item) => item.url !== urlToRemove);
    await saveWorkTabs();
    renderWorkTabs();
  };

  const removeFunItem = async (urlToRemove) => {
    funTabs = funTabs.filter((item) => item.url !== urlToRemove);
    await saveFunTabs();
    renderFunTabs();
  };

  /**
   * Removes the currently selected item from ANY of the harpoon lists.
   * It determines which list is active based on the selectedIndex variable for each list.
   */
  const removeSelectedItem = async () => {
    if (selectedHarpoonIndex !== -1 && harpoonedTabs[selectedHarpoonIndex]) {
      const urlToRemove = harpoonedTabs[selectedHarpoonIndex].url;
      await removeHarpoonedTabFromList(urlToRemove);
      if (harpoonedTabs.length === 0) {
        selectedHarpoonIndex = -1;
      } else if (selectedHarpoonIndex >= harpoonedTabs.length) {
        selectedHarpoonIndex = harpoonedTabs.length - 1;
      }
      highlightItem(harpoonListContainer, selectedHarpoonIndex);
    } else if (selectedWorkIndex !== -1 && workTabs[selectedWorkIndex]) {
      const urlToRemove = workTabs[selectedWorkIndex].url;
      await removeWorkItem(urlToRemove);
      if (workTabs.length === 0) {
        selectedWorkIndex = -1;
      } else if (selectedWorkIndex >= workTabs.length) {
        selectedWorkIndex = workTabs.length - 1;
      }
      highlightItem(workListContainer, selectedWorkIndex);
    } else if (selectedFunIndex !== -1 && funTabs[selectedFunIndex]) {
      const urlToRemove = funTabs[selectedFunIndex].url;
      await removeFunItem(urlToRemove);
      if (funTabs.length === 0) {
        selectedFunIndex = -1;
      } else if (selectedFunIndex >= funTabs.length) {
        selectedFunIndex = funTabs.length - 1;
      }
      highlightItem(funListContainer, selectedFunIndex);
    }
  };

  // --- New: Add Selected Harpoon Item to Work/Fun List ---

  const addItemToTargetList = async (targetList, targetListKey, maxCapacity) => {
    if (selectedHarpoonIndex === -1 || !harpoonedTabs[selectedHarpoonIndex]) {
      console.warn("No harpoon item selected to add to list.");
      return;
    }

    const itemToAdd = harpoonedTabs[selectedHarpoonIndex];

    // Check for duplicates
    const isDuplicate = targetList.some((item) => item.url === itemToAdd.url);
    if (isDuplicate) {
      console.log("Item already exists in target list.");
      return;
    }

    const newItem = {
      url: itemToAdd.url,
      title: itemToAdd.title,
      favIconUrl: itemToAdd.favIconUrl,
    };

    if (targetList.length >= maxCapacity) {
      targetList.shift(); // Remove the oldest item if capacity is reached
    }
    targetList.push(newItem); // Add new item to the end

    // Save and re-render the target list
    if (targetListKey === LS_WORK_TABS_KEY) {
      await saveWorkTabs();
      renderWorkTabs();
      selectedWorkIndex = targetList.length - 1; // Select the newly added item
      highlightItem(workListContainer, selectedWorkIndex);
      selectedHarpoonIndex = -1; // Deselect from harpoon list
      highlightItem(harpoonListContainer, selectedHarpoonIndex); // Ensure main harpoon list is de-highlighted
    } else if (targetListKey === LS_FUN_TABS_KEY) {
      await saveFunTabs();
      renderFunTabs();
      selectedFunIndex = targetList.length - 1; // Select the newly added item
      highlightItem(funListContainer, selectedFunIndex);
      selectedHarpoonIndex = -1; // Deselect from harpoon list
      highlightItem(harpoonListContainer, selectedHarpoonIndex); // Ensure main harpoon list is de-highlighted
    }
  };

  /**
   * Overwrites the main harpoon list with items from a source list (Work or Fun).
   * The source list remains intact.
   * @param {Array<Object>} sourceList The list to copy items from (workTabs or funTabs).
   * @param {string} sourceListKey The storage key for the source list (used for saving).
   */
  const overwriteHarpoonList = async (sourceList, sourceListKey) => {
    // Copy items from sourceList to harpoonedTabs
    harpoonedTabs = [...sourceList]; // Create a shallow copy

    // Do NOT clear the source list as per new requirement

    // Save the updated harpoonedTabs to storage
    await saveHarpoonedTabs();
    // No need to save sourceList here as it wasn't modified, but if it were, save it too:
    // if (sourceListKey === LS_WORK_TABS_KEY) {
    //   await saveWorkTabs();
    // } else if (sourceListKey === LS_FUN_TABS_KEY) {
    //   await saveFunTabs();
    // }

    // Re-render all lists to update the UI
    renderHarpoonedTabs();
    renderWorkTabs();
    renderFunTabs();

    // Reset selection to the first item of the now updated harpoon list
    selectedHarpoonIndex = harpoonedTabs.length > 0 ? 0 : -1;
    selectedWorkIndex = -1;
    selectedFunIndex = -1;
    highlightAllLists();
  };


  /**
   * Toggles the visibility of a specified list section (Work or Fun) and persists the state.
   * @param {string} listType 'work' or 'fun'.
   */
  const toggleListVisibility = async (listType) => {
    let sectionElement;
    let isVisible;
    let selectedIndexToClear;
    let listContainer;

    if (listType === 'work') {
      sectionElement = workListSection;
      workListVisible = !workListVisible;
      isVisible = workListVisible;
      await saveWorkListVisibility(isVisible);
      selectedIndexToClear = selectedWorkIndex;
      listContainer = workListContainer;
    } else if (listType === 'fun') {
      sectionElement = funListSection;
      funListVisible = !funListVisible;
      isVisible = funListVisible;
      await saveFunListVisibility(isVisible);
      selectedIndexToClear = selectedFunIndex;
      listContainer = funListContainer;
    } else {
      console.warn('Invalid list type for toggleVisibility:', listType);
      return;
    }

    if (isVisible) {
      sectionElement.classList.remove("hidden-list-section");
    } else {
      sectionElement.classList.add("hidden-list-section");
      // If a list becomes hidden, clear its selection and de-highlight it
      if (listType === 'work') {
          selectedWorkIndex = -1;
          highlightItem(workListContainer, selectedWorkIndex);
      } else if (listType === 'fun') {
          selectedFunIndex = -1;
          highlightItem(funListContainer, selectedFunIndex);
      }
    }
    // Re-evaluate current selection based on new visibility state
    // This ensures only visible lists have a selection
    // if a list gets hidden, and it was the selected one, selection moves to next visible list.
    let currentActiveListSelected = false;
    if (selectedHarpoonIndex !== -1) currentActiveListSelected = true;
    if (workListVisible && selectedWorkIndex !== -1) currentActiveListSelected = true;
    if (funListVisible && selectedFunIndex !== -1) currentActiveListSelected = true;

    // If no list was selected, or the selected list became hidden, find a new default selection
    if (!currentActiveListSelected) {
        if (harpoonedTabs.length > 0) {
            selectedHarpoonIndex = 0;
        } else if (workListVisible && workTabs.length > 0) {
            selectedWorkIndex = 0;
        } else if (funListVisible && funTabs.length > 0) {
            selectedFunIndex = 0;
        }
    }
    highlightAllLists(); // Re-apply highlights after state change
  };


  /**
   * Handles keyboard events specific to the Harpoon view.
   * This function is attached/detached by popup.js when switching views.
   * @param {KeyboardEvent} e The keyboard event.
   */
  const harpoonKeydownHandler = (e) => {
    // Universal navigation for j/k (and arrow keys, Alt+j/k)
    if (e.key === "ArrowDown" || e.key === "j" || (e.altKey && e.key === "j")) {
        e.preventDefault();
        cycleThroughAllVisibleLists("down");
    } else if (e.key === "ArrowUp" || e.key === "k" || (e.altKey && e.key === "k")) {
        e.preventDefault();
        cycleThroughAllVisibleLists("up");
    }
    // Activation (Enter key)
    else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedHarpoonIndex !== -1 && harpoonedTabs[selectedHarpoonIndex]) {
        activateItem(harpoonedTabs[selectedHarpoonIndex]);
      } else if (selectedWorkIndex !== -1 && workTabs[selectedWorkIndex]) {
        activateItem(workTabs[selectedWorkIndex]);
      } else if (selectedFunIndex !== -1 && funTabs[selectedFunIndex]) {
        activateItem(funTabs[selectedFunIndex]);
      }
    }
    // Moving items within the main Harpoon list (Shift+K/J) - Only applies to main Harpoon
    else if (e.shiftKey && e.key === "K" && selectedHarpoonIndex !== -1) {
      e.preventDefault();
      moveHarpoonItem("up");
    } else if (e.shiftKey && e.key === "J" && selectedHarpoonIndex !== -1) {
      e.preventDefault();
      moveHarpoonItem("down");
    }
    // Delete item from currently selected list (Ctrl+D, Delete, or d)
    else if (
      (e.ctrlKey && e.key === "d") ||
      e.key === "Delete" ||
      (e.key === "d" && !e.ctrlKey && !e.shiftKey) // Ensure 'd' alone also works, but not for Ctrl+D or Shift+D if those are used elsewhere
    ) {
      e.preventDefault();
      removeSelectedItem(); // This now removes from any selected list
    }
    // Changed: Add to Work List (Ctrl+1) - ONLY if a main harpoon item is selected and not Ctrl+Alt+1
    else if (e.ctrlKey && e.key === "1" && !e.altKey) {
      e.preventDefault();
      if (selectedHarpoonIndex !== -1) {
        addItemToTargetList(workTabs, LS_WORK_TABS_KEY, MAX_WORK_LINKS);
      }
    }
    // Changed: Add to Fun List (Ctrl+2) - ONLY if a main harpoon item is selected and not Ctrl+Alt+2
    else if (e.ctrlKey && e.key === "2" && !e.altKey) {
      e.preventDefault();
      if (selectedHarpoonIndex !== -1) {
        addItemToTargetList(funTabs, LS_FUN_TABS_KEY, MAX_FUN_LINKS);
      }
    }
    // Changed: Overwrite Harpoon with Work List (Ctrl+Alt+1)
    else if (e.ctrlKey && e.altKey && e.key === "1") {
        e.preventDefault();
        overwriteHarpoonList(workTabs, LS_WORK_TABS_KEY);
    }
    // Changed: Overwrite Harpoon with Fun List (Ctrl+Alt+2)
    else if (e.ctrlKey && e.altKey && e.key === "2") {
        e.preventDefault();
        overwriteHarpoonList(funTabs, LS_FUN_TABS_KEY);
    }
    // New: Toggle Work/Fun Lists Visibility (Ctrl+T)
    else if (e.ctrlKey && e.key === "t") {
        e.preventDefault();
        toggleListVisibility('work');
        toggleListVisibility('fun');
        // Update info text dynamically
        harpoonInfoText.innerHTML = `Press F3 again to hide Harpoon. J/K to move items. C-d to delete. <b>Ctrl+T to ${workListVisible || funListVisible ? 'hide' : 'show'} Work/Fun lists.</b>`;
    }
  };

  /**
   * Attaches keyboard event listeners for the Harpoon view.
   * Called when the Harpoon view becomes active.
   */
  const attachHarpoonListeners = () => {
    document.addEventListener("keydown", harpoonKeydownHandler);
    // Set initial focus when the Harpoon view becomes active, prioritizing main harpoon list
    if (harpoonedTabs.length > 0) {
      if (selectedHarpoonIndex === -1) {
        selectedHarpoonIndex = 0;
      }
      highlightItem(harpoonListContainer, selectedHarpoonIndex);
    } else if (workListVisible && workTabs.length > 0) { // Only set focus if list is visible
        selectedWorkIndex = 0;
        highlightItem(workListContainer, selectedWorkIndex);
    } else if (funListVisible && funTabs.length > 0) { // Only set focus if list is visible
        selectedFunIndex = 0;
        highlightItem(funListContainer, selectedFunIndex);
    }

    // Set the initial info text
    harpoonInfoText.innerHTML = `Press F3 again to hide Harpoon. J/K to move items. C-d to delete. <b>Ctrl+T to ${workListVisible || funListVisible ? 'hide' : 'show'} Work/Fun lists.</b>`;
  };

  /**
   * Detaches keyboard event listeners for the Harpoon view.
   * Called when the Harpoon view becomes inactive.
   */
  const detachHarpoonListeners = () => {
    document.removeEventListener("keydown", harpoonKeydownHandler);
    // Clear all selections when detaching listeners
    selectedHarpoonIndex = -1;
    selectedWorkIndex = -1;
    selectedFunIndex = -1;
    highlightItem(harpoonListContainer, selectedHarpoonIndex);
    highlightItem(workListContainer, selectedWorkIndex);
    highlightItem(funListContainer, selectedFunIndex);
    // Reset info text
    harpoonInfoText.innerHTML = `Press F3 again to hide Harpoon. J/K to move items up and down the list. j/k to move around the list. C-d to delete a tab.`;
  };

  /**
   * Loads all harpoon-related lists and their visibility states,
   * then renders them and sets initial focus.
   * This is the main refresh function.
   */
  const loadAllHarpoonLists = async () => {
    harpoonedTabs = await loadHarpoonedTabsFromStorage();
    workTabs = await loadWorkTabsFromStorage(); // New
    funTabs = await loadFunTabsFromStorage(); // New

    // Load visibility states and apply them
    workListVisible = await loadWorkListVisibility();
    funListVisible = await loadFunListVisibility();

    if (workListVisible) {
      workListSection.classList.remove("hidden-list-section");
    } else {
      workListSection.classList.add("hidden-list-section");
    }

    if (funListVisible) {
      funListSection.classList.remove("hidden-list-section");
    } else {
      funListSection.classList.add("hidden-list-section");
    }

    renderHarpoonedTabs();
    renderWorkTabs(); // New
    renderFunTabs(); // New

    // Check for a specific URL to focus from session storage (set by background.js)
    const { [INITIAL_HARPOON_URL_KEY]: urlToFocus } =
      await chrome.storage.session.get(INITIAL_HARPOON_URL_KEY);

    let initialFocusSet = false;

    if (urlToFocus) {
      const foundIndex = harpoonedTabs.findIndex(
        (tab) => tab.url === urlToFocus,
      );
      if (foundIndex !== -1) {
        selectedHarpoonIndex = foundIndex;
        highlightItem(harpoonListContainer, selectedHarpoonIndex);
        initialFocusSet = true;
      }
      // Clear the session storage key after using it
      await chrome.storage.session.remove(INITIAL_HARPOON_URL_KEY);
    }

    if (!initialFocusSet) {
        // If no specific URL to focus, and there are items, default to the first in main harpoon list
        if (harpoonedTabs.length > 0) {
            if (selectedHarpoonIndex === -1) {
                selectedHarpoonIndex = 0;
            }
            highlightItem(harpoonListContainer, selectedHarpoonIndex);
            initialFocusSet = true;
        } else if (workListVisible && workTabs.length > 0) { // Only set focus if list is visible
            selectedWorkIndex = 0;
            highlightItem(workListContainer, selectedWorkIndex);
            initialFocusSet = true;
        } else if (funListVisible && funTabs.length > 0) { // Only set focus if list is visible
            selectedFunIndex = 0;
            highlightItem(funListContainer, selectedFunIndex);
            initialFocusSet = true;
        }
    }

    if (!initialFocusSet) {
        selectedHarpoonIndex = -1; // No items, no selection
        selectedWorkIndex = -1;
        selectedFunIndex = -1;
    }
  };


  // Initial load of harpooned tabs when the initHarpoonFeature function is called
  await loadAllHarpoonLists();

  // Expose functions to the global window object for popup.js
  window.refreshHarpoonedTabs = loadAllHarpoonLists; // Renamed to reflect all lists
  // Keep navigation functions exposed for potential future use or debugging
  window.navigateHarpoonList = (direction) => {
    selectedHarpoonIndex = navigateList(direction, harpoonedTabs, selectedHarpoonIndex);
    highlightItem(harpoonListContainer, selectedHarpoonIndex);
  };
  window.activateSelectedHarpoonItem = () => {
    if (selectedHarpoonIndex !== -1) activateItem(harpoonedTabs[selectedHarpoonIndex]);
  };
  window.moveHarpoonItem = moveHarpoonItem; // Still specific to main harpoon
  window.removeSelectedHarpoonItem = removeSelectedItem; // Now universal delete

  // Expose listener control functions
  window.attachHarpoonListeners = attachHarpoonListeners;
  window.detachHarpoonListeners = detachHarpoonListeners;
};
