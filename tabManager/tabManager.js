// Define a global initialization function that popup.js can call
window.initTabManagerFeature = async (containerElement) => {
  const tabManagerMainContainer = containerElement; // The main container for tab manager view

  if (!tabManagerMainContainer) {
    console.error(
      "Tab Management feature: Container element not provided to initTabManagerFeature.",
    );
    return;
  }

  // --- DOM Element References ---
  const windowsListElement =
    tabManagerMainContainer.querySelector("#windowsList");
  let currentActiveTabId = null; // Store the ID of the tab where the popup was opened
  let currentActiveWindowId = null; // Store the ID of the window where the popup was opened
  let currentWindowTabCount = 0; // Store the number of tabs in the current window

  // --- State Variables ---
  let allWindowsData = []; // Stores the data for all open Chrome windows and their tabs
  let selectedWindowIndex = 0; // Index of the currently highlighted window in the list

  // --- Utility Functions ---

  /**
   * Fetches all Chrome windows with their populated tabs.
   * Also identifies the active tab/window where the popup was opened.
   * Reorders the list: [New Empty Window, Other Windows, Current Window].
   */
  const fetchWindowsData = async () => {
    windowsListElement.innerHTML =
      '<li class="loading-message">Loading windows...</li>';
    try {
      // Identify the active tab/window where the popup itself is running
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (activeTab) {
        currentActiveTabId = activeTab.id;
        currentActiveWindowId = activeTab.windowId;
      } else {
        console.warn("Tab Manager: Could not determine active tab/window.");
      }

      // Get all windows and populate them with their tabs
      const allRawWindows = await chrome.windows.getAll({ populate: true });

      let otherWindows = [];
      let currentWindow = null; // This variable will store the current active window if found

      allRawWindows.forEach((win) => {
        if (win.id === currentActiveWindowId) {
          currentWindow = win;
          currentWindowTabCount = win.tabs.length;
        } else {
          otherWindows.push(win);
        }
      });

      // Construct allWindowsData in the desired order
      allWindowsData = [];

      // 1. New Empty Window option - only add if current window has more than one tab
      if (currentWindowTabCount > 1) {
        allWindowsData.push({
          id: "new-window-option",
          type: "newWindow",
          title: "New Empty Window",
          tabs: [], // No tabs for this virtual option
        });
      }

      // 2. Other Windows (not the current one)
      allWindowsData.push(...otherWindows);

      // 3. Current Window - Add it at the end of the list if it exists and wasn't filtered out
      //    (This ensures the current window is visible in the list if needed for e.g., re-ordering tabs within it)
      if (currentWindow) {
        allWindowsData.push(currentWindow);
      }

      renderWindowList(); // Render the list after fetching data
      // Ensure selectedWindowIndex is still valid after data changes
      selectedWindowIndex = Math.min(
        selectedWindowIndex,
        allWindowsData.length - 1,
      );
      selectWindow(selectedWindowIndex); // Re-select to ensure highlight and scroll are correct
    } catch (error) {
      console.error("Tab Manager: Error fetching window data:", error);
      windowsListElement.innerHTML =
        '<li class="loading-message">Failed to load windows. Please check extension permissions.</li>';
    }
  };

  /**
   * Renders the list of windows and their tabs.
   */
  const renderWindowList = () => {
    windowsListElement.innerHTML = ""; // Clear previous content

    if (allWindowsData.length === 0) {
      windowsListElement.innerHTML =
        '<li class="loading-message">No active windows found.</li>';
      return;
    }

    allWindowsData.forEach((win, index) => {
      const windowItem = document.createElement("li");
      windowItem.classList.add("window-item");
      windowItem.dataset.windowId = win.id;
      windowItem.dataset.windowType = win.type || "standard";

      const windowHeader = document.createElement("div");
      windowHeader.classList.add("window-header");

      let windowTitleText = `Window #${index + 1}`; // Default numbering

      if (win.type === "newWindow") {
        windowHeader.innerHTML = `
          <img src="${chrome.runtime.getURL("img/newWindow.png")}" alt="New Window" class="window-icon">
          <span>${win.title}</span>
        `;
        windowItem.classList.add("new-window-option");
      } else {
        // Adjust numbering for non-new-window items if new window is first
        const actualWindowIndex = allWindowsData
          .filter((w) => w.type !== "newWindow") // Filter out the "New Empty Window" option
          .indexOf(win); // Find the index of the current window in the filtered list

        // Only show "Current Window" if it's the active one and it's explicitly placed last
        const isCurrentActive = win.id === currentActiveWindowId;
        windowTitleText = isCurrentActive
          ? "Current Window"
          : `Window #${actualWindowIndex + 1}`;

        windowHeader.innerHTML = `
          <img src="${chrome.runtime.getURL("img/browser.png")}" alt="Window" class="window-icon">
          <span>${windowTitleText} (${win.tabs.length} tabs)</span>
        `;

        if (isCurrentActive) {
          windowItem.classList.add("current-active-window");
        }
      }

      windowItem.appendChild(windowHeader);

      const tabListHorizontal = document.createElement("ul");
      tabListHorizontal.classList.add("tab-list-horizontal");

      // Only render tabs for actual windows, not the "New Empty Window" option
      if (win.tabs && win.tabs.length > 0 && win.type !== "newWindow") {
        win.tabs.forEach((tab) => {
          const tabItem = document.createElement("li");
          tabItem.classList.add("tab-item-horizontal");
          if (
            tab.id === currentActiveTabId &&
            tab.windowId === currentActiveWindowId
          ) {
            tabItem.classList.add("current-active-tab");
          }

          const favicon = document.createElement("img");
          favicon.classList.add("favicon-small");
          favicon.alt = "favicon";
          favicon.src =
            tab.favIconUrl ||
            (tab.url &&
            (tab.url.startsWith("chrome://") || tab.url.startsWith("about:"))
              ? chrome.runtime.getURL("img/icon.png")
              : `chrome://favicon/${new URL(tab.url).hostname}`); // Improved favicon fallback for standard URLs

          // Handle potentially privileged URLs for display
          let displayUrl = tab.url;
          if (displayUrl.startsWith("chrome://")) {
            displayUrl = "Chrome Internal Page";
          } else if (displayUrl.startsWith("about:")) {
            displayUrl = "About Page";
          }

          const tabTitle = document.createElement("span");
          tabTitle.classList.add("tab-title-small");
          tabTitle.textContent = tab.title || displayUrl || "Untitled Tab"; // Prioritize title, then URL, then default

          tabItem.appendChild(favicon);
          tabItem.appendChild(tabTitle);
          tabListHorizontal.appendChild(tabItem);
        });
      } else if (win.type !== "newWindow") {
        // For empty existing windows
        const noTabsItem = document.createElement("li");
        noTabsItem.classList.add("tab-item-horizontal");
        noTabsItem.textContent = "No tabs in this window.";
        tabListHorizontal.appendChild(noTabsItem);
      } else {
        // For the "New Empty Window" option itself
        const hintItem = document.createElement("li");
        hintItem.classList.add("tab-item-horizontal");
        // hintItem.textContent = 'Move active tab here to create a new window.'; // Commented out as per original
        tabListHorizontal.appendChild(hintItem);
      }

      windowItem.appendChild(tabListHorizontal);
      windowsListElement.appendChild(windowItem);
    });

    highlightSelectedWindow();
  };

  /**
   * Highlights the currently selected window item in the list.
   */
  const highlightSelectedWindow = () => {
    const windowItems = windowsListElement.querySelectorAll(".window-item");
    windowItems.forEach((item, index) => {
      if (index === selectedWindowIndex) {
        item.classList.add("selected");
        // Scroll the selected window into view
        item.scrollIntoView({ block: "nearest", behavior: "auto" });
      } else {
        item.classList.remove("selected");
      }
    });
  };

  /**
   * Selects a window by index. Ensures the index is within bounds.
   * @param {number} index The index of the window to select.
   */
  const selectWindow = (index) => {
    selectedWindowIndex = Math.max(
      0,
      Math.min(index, allWindowsData.length - 1),
    );
    highlightSelectedWindow();
  };

  /**
   * Handles keyboard events specific to the Tab Management view.
   * This function is attached/detached by popup.js when switching views.
   * @param {KeyboardEvent} e The keyboard event.
   */
  const tabManagerKeydownHandler = (e) => {
    const keyCode = e.keyCode; // IMPORTANT: Declare keyCode here at the very beginning

    const targetWindow = allWindowsData[selectedWindowIndex];

    if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      selectWindow(selectedWindowIndex - 1);
      return;
    } else if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      selectWindow(selectedWindowIndex + 1);
      return;
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (
        currentActiveTabId !== null &&
        selectedWindowIndex !== -1 &&
        targetWindow
      ) {
        if (targetWindow.type === "newWindow") {
          chrome.runtime
            .sendMessage({
              action: "createWindowAndMoveTab",
              tabId: currentActiveTabId,
            })
            .then((response) => {
              if (response && response.success) {
                fetchWindowsData(); // Re-fetch to show the new window in the list
              } else {
                console.error(
                  "Tab Manager: Failed to move tab to new window:",
                  response?.error || "Unknown error",
                );
              }
            })
            .catch((error) => {
              console.error(
                "Tab Manager: Error sending message to create new window and move tab:",
                error,
              );
            });
        } else {
          // Existing window
          chrome.runtime
            .sendMessage({
              action: "moveActiveTabToWindow",
              tabId: currentActiveTabId,
              targetWindowId: targetWindow.id,
            })
            .then((response) => {
              if (response && response.success) {
                fetchWindowsData(); // Re-fetch data to update the UI
              } else {
                console.error(
                  "Tab Manager: Failed to move tab to selected window:",
                  response?.error || "Unknown error",
                );
              }
            })
            .catch((error) => {
              console.error(
                "Tab Manager: Error sending message to move tab:",
                error,
              );
            });
        }
      } else {
        console.warn(
          "Tab Manager: Cannot move tab. Either no active tab, or no window selected, or selected window data missing.",
        );
      }
      return;
    }
    // MODIFIED: Handle Ctrl+D to hide selected window immediately, then try to close it permanently
    else if (e.ctrlKey && e.key === "d") {
      e.preventDefault();
      if (targetWindow && targetWindow.type !== "newWindow") {
        const windowIdToClose = targetWindow.id;

        // 1. Optimistically remove the window from the local data and re-render
        // This gives immediate visual feedback.
        allWindowsData = allWindowsData.filter(
          (win) => win.id !== windowIdToClose,
        );
        // Adjust selected index if the removed item was before it
        if (selectedWindowIndex >= allWindowsData.length) {
          selectedWindowIndex = Math.max(0, allWindowsData.length - 1);
        }
        renderWindowList();
        selectWindow(selectedWindowIndex); // Re-highlight and scroll

        // 2. Send message to background script to close the actual Chrome window
        chrome.runtime
          .sendMessage({
            action: "closeWindow",
            windowId: windowIdToClose,
          })
          .then((response) => {
            if (response && response.success) {
              console.log(
                `Tab Manager: Successfully requested closure of window ${windowIdToClose}.`,
              );
              // No need to re-fetch here if the optimistic update worked and we trust the response.
              // If you ever find a discrepancy, uncomment fetchWindowsData() for a hard refresh.
              // fetchWindowsData();
            } else {
              console.error(
                "tabManager.js: Failed to close window (response error):",
                response?.error || "Unknown error",
              );
              // If actual closure failed, re-fetch to revert the UI state
              fetchWindowsData();
            }
          })
          .catch((error) => {
            console.error(
              "tabManager.js: Error sending message to close window (catch block):",
              error,
            );
            // If message sending failed, re-fetch to revert the UI state
            fetchWindowsData();
          });
      } else {
        console.warn(
          "Tab Manager: Cannot close 'New Empty Window' option or no window selected.",
        );
      }
      return;
    }
    // New: Handle '0' key for moving to the last position
    else if (keyCode === 48) {
      // Key '0'
      e.preventDefault();
      // An index of -1 tells chrome.tabs.move to put the tab at the end
      const targetPosition = -1;

      chrome.runtime
        .sendMessage({
          action: "moveCurrentTabToSpecificPosition",
          targetIndex: targetPosition,
        })
        .then((response) => {
          if (response && response.success) {
            // Optional: Re-fetch or re-render if you want immediate UI feedback
            // fetchWindowsData();
          } else {
            console.error(
              "tabManager.js: Failed to move tab to last position (response error):",
              response?.error || "Unknown error",
            );
          }
        })
        .catch((error) => {
          console.error(
            "tabManager.js: Error sending message to move tab to last position (catch block):",
            error,
          );
        });
      return;
    }
    // Check if the key is a number from 1 to 9 (Key codes 49-57 for 1-9)
    else if (keyCode >= 49 && keyCode <= 57) {
      // Keys '1' through '9'
      e.preventDefault();

      const targetPosition = keyCode - 49; // 0-indexed (0 for '1', 1 for '2', etc.)

      // Send a message to the background script to move the current tab
      chrome.runtime
        .sendMessage({
          action: "moveCurrentTabToSpecificPosition",
          targetIndex: targetPosition,
        })
        .then((response) => {
          if (response && response.success) {
            // Optionally, re-fetch window data if you want to see the tab move in the UI
            // However, for frequent moves, this might cause flicker.
            // fetchWindowsData();
          } else {
            console.error(
              "tabManager.js: Failed to move tab (response error):",
              response?.error || "Unknown error",
            );
          }
        })
        .catch((error) => {
          console.error(
            "tabManager.js: Error sending message to move tab (catch block):",
            error,
          );
        });
      return;
    } else if (e.key === "h" || e.key === "H") {
      e.preventDefault();
      chrome.runtime
        .sendMessage({
          action: "moveCurrentTabLeft",
        })
        .then((response) => {
          if (response && response.success) {
          } else {
            console.error(
              "tabManager.js: Failed to move tab left (response error):",
              response?.error || "Unknown error",
            );
          }
        })
        .catch((error) => {
          console.error(
            "tabManager.js: Error sending message to move tab left (catch block):",
            error,
          );
        });
      return;
    } else if (e.key === "l" || e.key === "L") {
      e.preventDefault();
      chrome.runtime
        .sendMessage({
          action: "moveCurrentTabRight",
        })
        .then((response) => {
          if (response && response.success) {
          } else {
            console.error(
              "tabManager.js: Failed to move tab right (response error):",
              response?.error || "Unknown error",
            );
          }
        })
        .catch((error) => {
          console.error(
            "tabManager.js: Error sending message to move tab right (catch block):",
            error,
          );
        });
      return;
    }
  };

  /**
   * Attaches keyboard event listeners for the Tab Management view.
   * Called when the Tab Management view becomes active.
   */
  const attachTabManagerListeners = () => {
    document.addEventListener("keydown", tabManagerKeydownHandler);
  };

  /**
   * Detaches keyboard event listeners for the Tab Management view.
   * Called when the Tab Management view becomes inactive.
   */
  const detachTabManagerListeners = () => {
    document.removeEventListener("keydown", tabManagerKeydownHandler);
  };

  // Expose functions to the global window object for popup.js
  window.attachTabManagerListeners = attachTabManagerListeners;
  window.detachTabManagerListeners = detachTabManagerListeners;

  // Initial data fetch and rendering when the feature is initialized
  await fetchWindowsData();
};
