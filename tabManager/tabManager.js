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
  const windowsListElement = tabManagerMainContainer.querySelector("#windowsList");
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
    windowsListElement.innerHTML = '<li class="loading-message">Loading windows...</li>';
    try {
      // Identify the active tab/window where the popup itself is running
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab) {
        currentActiveTabId = activeTab.id;
        currentActiveWindowId = activeTab.windowId;
      } else {
        console.warn("Tab Manager: Could not determine active tab/window.");
      }

      // Get all windows and populate them with their tabs
      const allRawWindows = await chrome.windows.getAll({ populate: true });

      let otherWindows = [];
      let currentWindow = null;

      allRawWindows.forEach(win => {
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
          tabs: []
        });
      }

      // 2. Other Windows (not the current one)
      allWindowsData.push(...otherWindows);

      renderWindowList(); // Render the list after fetching data
      selectWindow(0); 
    } catch (error) {
      console.error("Tab Manager: Error fetching window data:", error);
      windowsListElement.innerHTML = '<li class="loading-message">Failed to load windows. Please check extension permissions.</li>';
    }
  };

  /**
   * Renders the list of windows and their tabs.
   */
  const renderWindowList = () => {
    windowsListElement.innerHTML = ''; // Clear previous content

    if (allWindowsData.length === 0) {
      windowsListElement.innerHTML = '<li class="loading-message">No active windows found.</li>';
      return;
    }

    allWindowsData.forEach((win, index) => {
      const windowItem = document.createElement('li');
      windowItem.classList.add('window-item');
      windowItem.dataset.windowId = win.id; 
      windowItem.dataset.windowType = win.type || 'standard'; 

      const windowHeader = document.createElement('div');
      windowHeader.classList.add('window-header');

      let windowTitleText = `Window #${index + 1}`;

      if (win.type === "newWindow") {
        windowHeader.innerHTML = `
          <img src="${chrome.runtime.getURL('img/newWindow.png')}" alt="New Window" class="window-icon">
          <span>${win.title}</span>
        `;
        windowItem.classList.add('new-window-option');
      } else {
        // Adjust numbering for non-new-window items if new window is first
        const actualWindowIndex = allWindowsData.filter(w => w.type !== 'newWindow').indexOf(win);
        windowTitleText = `Window #${actualWindowIndex + 1}`;

        windowHeader.innerHTML = `
          <img src="${chrome.runtime.getURL('img/browser.png')}" alt="Window" class="window-icon">
          <span>${windowTitleText} (${win.tabs.length} tabs)</span>
        `;
      }

      windowItem.appendChild(windowHeader);

      const tabListHorizontal = document.createElement('ul');
      tabListHorizontal.classList.add('tab-list-horizontal');

      // Only render tabs for actual windows, not the "New Empty Window" option
      if (win.tabs && win.tabs.length > 0 && win.type !== "newWindow") {
        win.tabs.forEach(tab => {
          const tabItem = document.createElement('li');
          tabItem.classList.add('tab-item-horizontal');

          const favicon = document.createElement('img');
          favicon.classList.add('favicon-small');
          favicon.alt = 'favicon';
          favicon.src = tab.favIconUrl || (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) ? chrome.runtime.getURL('img/icon.png') : `chrome://favicon/${tab.url}`);

          const tabTitle = document.createElement('span');
          tabTitle.classList.add('tab-title-small');
          tabTitle.textContent = tab.title || tab.url || 'Untitled Tab';

          tabItem.appendChild(favicon);
          tabItem.appendChild(tabTitle);
          tabListHorizontal.appendChild(tabItem);
        });
      } else if (win.type !== "newWindow") { // For empty existing windows
        const noTabsItem = document.createElement('li');
        noTabsItem.classList.add('tab-item-horizontal');
        noTabsItem.textContent = 'No tabs in this window.';
        tabListHorizontal.appendChild(noTabsItem);
      } else { // For the "New Empty Window" option itself
        const hintItem = document.createElement('li');
        hintItem.classList.add('tab-item-horizontal');
        // hintItem.textContent = 'Move active tab here to create a new window.';
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
    const windowItems = windowsListElement.querySelectorAll('.window-item');
    windowItems.forEach((item, index) => {
      if (index === selectedWindowIndex) {
        item.classList.add('selected');
        // Scroll the selected window into view
        item.scrollIntoView({ block: "nearest", behavior: "auto" });
      } else {
        item.classList.remove('selected');
      }
    });
  };

  /**
   * Selects a window by index. Ensures the index is within bounds.
   * @param {number} index The index of the window to select.
   */
  const selectWindow = (index) => {
    selectedWindowIndex = Math.max(0, Math.min(index, allWindowsData.length - 1));
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

    if (e.key === 'ArrowUp' || e.key === 'k') { 
      e.preventDefault();
      selectWindow(selectedWindowIndex - 1);
      return;
    } else if (e.key === 'ArrowDown' || e.key === 'j') { 
      e.preventDefault();
      selectWindow(selectedWindowIndex + 1);
      return;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentActiveTabId !== null && selectedWindowIndex !== -1 && targetWindow) {
        if (targetWindow.type === "newWindow") {
          chrome.runtime.sendMessage({
              action: "createWindowAndMoveTab", 
              tabId: currentActiveTabId
            })
            .then(response => {
              if (response && response.success) {
                fetchWindowsData(); // Re-fetch to show the new window in the list
              } else {
                console.error("Tab Manager: Failed to move tab to new window:", response?.error || "Unknown error");
              }
            })
            .catch(error => {
              console.error("Tab Manager: Error sending message to create new window and move tab:", error);
            });
        } else { // Existing window
          chrome.runtime.sendMessage({
              action: "moveActiveTabToWindow",
              tabId: currentActiveTabId,
              targetWindowId: targetWindow.id
            })
            .then(response => {
              if (response && response.success) {
                fetchWindowsData(); // Re-fetch data to update the UI
              } else {
                console.error("Tab Manager: Failed to move tab to selected window:", response?.error || "Unknown error");
              }
            })
            .catch(error => {
              console.error("Tab Manager: Error sending message to move tab:", error);
            });
        }
      } else {
        console.warn("Tab Manager: Cannot move tab. Either no active tab, or no window selected, or selected window data missing.");
      }
      return; 
    }
    // Check if the key is a number from 1 to 9 (Key codes 49-57 for 1-9)
    else if (keyCode >= 49 && keyCode <= 57) { // Keys '1' through '9'
      e.preventDefault(); 

      const targetPosition = keyCode - 49;

      // Send a message to the background script to move the current tab
      chrome.runtime.sendMessage({
          action: "moveCurrentTabToSpecificPosition",
          targetIndex: targetPosition,
        })
        .then(response => {
          if (response && response.success) {
            console.log(`tabManager.js: Message sent successfully. Current tab moved. Popup should remain open.`);
          } else {
            console.error("tabManager.js: Failed to move tab (response error):", response?.error || "Unknown error");
          }
        })
        .catch(error => {
          console.error("tabManager.js: Error sending message to move tab (catch block):", error);
        });
      return; // Crucial: Add return here to ensure no further processing for these specific keys
    } else if (e.key === 'h' || e.key === 'H') {
      e.preventDefault(); // Prevent default browser actions
      console.log("tabManager.js: 'H' pressed. Sending message to move tab left.");
      chrome.runtime.sendMessage({
          action: "moveCurrentTabLeft"
        })
        .then(response => {
          if (response && response.success) {
            console.log("tabManager.js: Tab moved left successfully. Popup should remain open.");
          } else {
            console.error("tabManager.js: Failed to move tab left (response error):", response?.error || "Unknown error");
          }
        })
        .catch(error => {
          console.error("tabManager.js: Error sending message to move tab left (catch block):", error);
        });
      return; // Ensure no further processing
    } else if (e.key === 'l' || e.key === 'L') {
      e.preventDefault(); // Prevent default browser actions
      console.log("tabManager.js: 'L' pressed. Sending message to move tab right.");
      chrome.runtime.sendMessage({
          action: "moveCurrentTabRight"
        })
        .then(response => {
          if (response && response.success) {
            console.log("tabManager.js: Tab moved right successfully. Popup should remain open.");
          } else {
            console.error("tabManager.js: Failed to move tab right (response error):", response?.error || "Unknown error");
          }
        })
        .catch(error => {
          console.error("tabManager.js: Error sending message to move tab right (catch block):", error);
        });
      return; // Ensure no further processing
    }
    // If none of the above conditions are met, log it as an unhandled key.
    console.log("tabManager.js: Unhandled key in Tab Management view. Event might bubble:", e.key);
  };


  /**
   * Attaches keyboard event listeners for the Tab Management view.
   * Called when the Tab Management view becomes active.
   */
  const attachTabManagerListeners = () => {
    document.addEventListener("keydown", tabManagerKeydownHandler);
    console.log("tabManager.js: Tab Management listeners attached.");
  };

  /**
   * Detaches keyboard event listeners for the Tab Management view.
   * Called when the Tab Management view becomes inactive.
   */
  const detachTabManagerListeners = () => {
    document.removeEventListener("keydown", tabManagerKeydownHandler);
    console.log("tabManager.js: Tab Management listeners detached.");
  };

  // Expose functions to the global window object for popup.js
  window.attachTabManagerListeners = attachTabManagerListeners;
  window.detachTabManagerListeners = detachTabManagerListeners;

  // Initial data fetch and rendering when the feature is initialized
  await fetchWindowsData();
};
