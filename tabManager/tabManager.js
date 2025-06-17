// tabManager/tabManager.js

// Define a global initialization function that popup.js can call
// AFTER the tabManager.html content is loaded into the DOM.
// It now accepts the container element directly.
window.initTabManagerFeature = async (containerElement) => {
  // Use the passed containerElement directly
  const tabManagerContent = containerElement;

  if (!tabManagerContent) {
    console.error(
      "Tab Management feature: Container element not provided to initTabManagerFeature.",
    );
    return;
  }

  console.log("Tab Management feature initialized with container:", containerElement);

  /**
   * Handles keyboard events specific to the Tab Management view.
   * This function is attached/detached by popup.js when switching views.
   * @param {KeyboardEvent} e The keyboard event.
   */
  const tabManagerKeydownHandler = (e) => {
    console.log("tabManager.js: Keydown event detected in Tab Management view:", e.key, "KeyCode:", e.keyCode);

    // For moving the current tab to a specific position (1-9 keys)
    const keyCode = e.keyCode; // ASCII value of the key pressed
    // Check if the key is a number from 1 to 9 (Key codes 49-57 for 1-9)
    if (keyCode >= 49 && keyCode <= 57) { // Keys '1' through '9'
      e.preventDefault(); // Prevent default browser action (e.g., typing in a search box if one existed)

      const targetPosition = keyCode - 49; // Convert ASCII to 0-indexed position (0 for '1', ..., 8 for '9')

      console.log(`tabManager.js: Attempting to move current tab to position ${targetPosition + 1}. Sending message to background.`);

      // Send a message to the background script to move the current tab
      chrome.runtime.sendMessage({
        action: "moveCurrentTabToSpecificPosition",
        targetIndex: targetPosition,
      })
      .then(response => {
        if (response && response.success) {
          console.log(`tabManager.js: Message sent successfully. Current tab moved.`);
          // IMPORTANT: Removed window.close() here as requested.
        } else {
          console.error("tabManager.js: Failed to move tab:", response?.error || "Unknown error");
          // Optionally, display a transient message to the user in the popup
        }
      })
      .catch(error => {
        console.error("tabManager.js: Error sending message to move tab:", error);
      });
    } else if (e.key === 'h' || e.key === 'H') {
      e.preventDefault(); // Prevent default browser actions
      console.log("tabManager.js: 'H' pressed. Sending message to move tab left.");
      chrome.runtime.sendMessage({ action: "moveCurrentTabLeft" })
        .then(response => {
          if (response && response.success) {
            console.log("tabManager.js: Tab moved left successfully.");
          } else {
            console.error("tabManager.js: Failed to move tab left:", response?.error || "Unknown error");
          }
        })
        .catch(error => {
          console.error("tabManager.js: Error sending message to move tab left:", error);
        });
    } else if (e.key === 'l' || e.key === 'L') {
      e.preventDefault(); // Prevent default browser actions
      console.log("tabManager.js: 'L' pressed. Sending message to move tab right.");
      chrome.runtime.sendMessage({ action: "moveCurrentTabRight" })
        .then(response => {
          if (response && response.success) {
            console.log("tabManager.js: Tab moved right successfully.");
          } else {
            console.error("tabManager.js: Failed to move tab right:", response?.error || "Unknown error");
          }
        })
        .catch(error => {
          console.error("tabManager.js: Error sending message to move tab right:", error);
        });
    }
    // Add other tab management specific keybindings here later
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

  // Initial setup when feature is initialized (e.g., refreshing content)
  // No content to refresh yet, but this is where you'd put it.
};
