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

  // Example: You might load initial data or set up specific UI elements here later
  console.log("Tab Management feature initialized with container:", containerElement);

  /**
   * Handles keyboard events specific to the Tab Management view.
   * This function is attached/detached by popup.js when switching views.
   * @param {KeyboardEvent} e The keyboard event.
   */
  const tabManagerKeydownHandler = (e) => {
    // For now, this is empty as no specific keyboard actions are defined.
    // In the future, you'd add logic here for navigating lists, performing actions, etc.
    console.log("Tab Manager Keydown:", e.key);
  };

  /**
   * Attaches keyboard event listeners for the Tab Management view.
   * Called when the Tab Management view becomes active.
   */
  const attachTabManagerListeners = () => {
    document.addEventListener("keydown", tabManagerKeydownHandler);
    console.log("Tab Management listeners attached.");
  };

  /**
   * Detaches keyboard event listeners for the Tab Management view.
   * Called when the Tab Management view becomes inactive.
   */
  const detachTabManagerListeners = () => {
    document.removeEventListener("keydown", tabManagerKeydownHandler);
    console.log("Tab Management listeners detached.");
  };

  // Expose functions to the global window object for popup.js
  window.attachTabManagerListeners = attachTabManagerListeners;
  window.detachTabManagerListeners = detachTabManagerListeners;

  // Initial setup when feature is initialized (e.g., refreshing content)
  // No content to refresh yet, but this is where you'd put it.
  // window.refreshTabManagementContent = () => { /* ... */ };
};
