// Harpoon/harpoon.js

// Define a global initialization function that popup.js can call
// AFTER the harpoon.html content is loaded into the DOM.
window.initHarpoonFeature = async () => {
    // DOM Element References
    const harpoonListContainer = document.getElementById("harpoonList");
    const noHarpoonedMessage = harpoonListContainer.querySelector(".no-harpooned-message");

    // State variable for the currently selected item in the harpoon list
    let selectedHarpoonIndex = -1;
    let harpoonedTabs = []; // Array to hold the current harpooned tabs

    // Exit if essential elements are not found, indicating an issue with HTML injection.
    if (!harpoonListContainer) {
        console.error("Harpoon feature: Essential DOM elements not found after initHarpoonFeature call.");
        return;
    }

    /**
     * Highlights the currently selected item in the harpoon list.
     * Scrolls the selected item into view if it's not already visible.
     */
    const highlightHarpoonItem = () => {
        const items = harpoonListContainer.querySelectorAll(".harpoon-item");
        items.forEach((item, index) => {
            if (index === selectedHarpoonIndex) {
                item.classList.add("selected");
                item.scrollIntoView({ block: "nearest", behavior: "smooth" });
            } else {
                item.classList.remove("selected");
            }
        });
    };

    /**
     * Navigates the harpoon list up or down.
     * @param {string} direction "up" or "down".
     */
    const navigateHarpoonList = (direction) => {
        const items = harpoonListContainer.querySelectorAll(".harpoon-item");
        if (items.length === 0) {
            selectedHarpoonIndex = -1;
            return;
        }

        if (direction === "down") {
            selectedHarpoonIndex = (selectedHarpoonIndex + 1) % items.length;
        } else if (direction === "up") {
            selectedHarpoonIndex = (selectedHarpoonIndex - 1 + items.length) % items.length;
        }
        highlightHarpoonItem();
    };

    /**
     * Activates the currently selected harpooned tab.
     * It sends a message to the background script (or popup.js) to handle
     * focusing an existing tab or creating a new one.
     */
    const activateSelectedHarpoonItem = async () => {
        if (selectedHarpoonIndex !== -1 && harpoonedTabs[selectedHarpoonIndex]) {
            const selectedItem = harpoonedTabs[selectedHarpoonIndex];
            try {
                // Send a message to popup.js (or background.js) to handle the tab switch/creation
                // Given the existing focusOrCreateTabByUrl in popup.js, it's best to call it directly.
                // We assume popup.js's functions are available globally if harpoon.js is loaded into the same context.
                // If not, we'd need to message the background script. For this scenario, direct call is simpler.
                if (typeof window.focusOrCreateTabByUrl === "function") {
                    window.focusOrCreateTabByUrl(selectedItem.url, false); // Harpooned tabs are generally not exact match
                } else {
                    console.error("focusOrCreateTabByUrl is not available in popup.js context.");
                    // Fallback to sending a message to background script if direct call fails
                    await chrome.runtime.sendMessage({
                        action: "openTabOrSwitch",
                        url: selectedItem.url,
                        exactMatch: false
                    });
                }
            } catch (error) {
                console.error("Error activating harpooned tab:", error);
            }
        }
    };


    /**
     * Loads harpooned tabs from the background script (which gets them from local storage).
     * After loading, it renders them and sets initial focus.
     */
    const loadHarpoonedTabs = async () => {
        try {
            const response = await chrome.runtime.sendMessage({
                action: "harpoonCommand",
                command: "getHarpoonedTabs"
            });
            if (response && response.success) {
                harpoonedTabs = response.tabs;
                renderHarpoonedTabs();
                // Set initial focus to the first item if the list is not empty
                if (harpoonedTabs.length > 0) {
                    selectedHarpoonIndex = 0;
                    highlightHarpoonItem();
                } else {
                    selectedHarpoonIndex = -1;
                }
            } else {
                console.error("Failed to load harpooned tabs:", response?.error || "Unknown error");
                harpoonedTabs = []; // Fallback to empty array on error
                renderHarpoonedTabs();
                selectedHarpoonIndex = -1;
            }
        } catch (error) {
            console.error("Error communicating with background script to load harpooned tabs:", error);
            harpoonedTabs = [];
            renderHarpoonedTabs();
            selectedHarpoonIndex = -1;
        }
    };

    /**
     * Renders the list of harpooned tabs in the UI.
     * It also attaches click listeners for activation and removal.
     */
    const renderHarpoonedTabs = () => {
        harpoonListContainer.innerHTML = ""; // Clear existing list

        if (harpoonedTabs.length === 0) {
            if (noHarpoonedMessage) {
                harpoonListContainer.appendChild(noHarpoonedMessage);
                noHarpoonedMessage.classList.remove("hidden");
            } else {
                const msg = document.createElement("p");
                msg.classList.add("no-harpooned-message");
                msg.textContent = "No tabs harpooned yet.";
                harpoonListContainer.appendChild(msg);
            }
            return;
        } else {
            if (noHarpoonedMessage) {
                noHarpoonedMessage.classList.add("hidden");
            }
        }

        harpoonedTabs.forEach((harpoonedTab, index) => {
            const harpoonItem = document.createElement("div");
            harpoonItem.classList.add("harpoon-item");
            harpoonItem.dataset.index = index; // Store index for direct access

            const favicon = document.createElement("img");
            favicon.classList.add("favicon");
            favicon.alt = "icon";
            favicon.src = harpoonedTab.favIconUrl || chrome.runtime.getURL("img/SGN256.png"); // Fallback icon

            const harpoonInfo = document.createElement("div");
            harpoonInfo.classList.add("harpoon-info");

            const harpoonTitle = document.createElement("span");
            harpoonTitle.classList.add("harpoon-title");
            harpoonTitle.textContent = harpoonedTab.title;

            const harpoonUrl = document.createElement("a");
            harpoonUrl.classList.add("harpoon-url");
            harpoonUrl.href = harpoonedTab.url;
            harpoonUrl.textContent = harpoonedTab.url;
            harpoonUrl.target = "_blank"; // Open in a new tab

            harpoonInfo.appendChild(harpoonTitle);
            harpoonInfo.appendChild(harpoonUrl);

            const removeButton = document.createElement("button");
            removeButton.classList.add("remove-harpoon-button");
            removeButton.innerHTML = '✕'; // X icon
            removeButton.title = "Remove Harpooned Tab";
            removeButton.addEventListener("click", (e) => {
                e.stopPropagation(); // Prevent item activation when clicking remove button
                removeHarpoonedTabFromList(harpoonedTab.url);
            });

            harpoonItem.appendChild(favicon);
            harpoonItem.appendChild(harpoonInfo);
            harpoonItem.appendChild(removeButton);

            // Add click listener for activating the harpooned tab
            harpoonItem.addEventListener("click", () => {
                selectedHarpoonIndex = index; // Update selected index on click
                highlightHarpoonItem();
                activateSelectedHarpoonItem();
            });

            harpoonListContainer.appendChild(harpoonItem);
        });
    };

    /**
     * Removes a harpooned tab from the list via the background script.
     * @param {string} urlToRemove The URL of the tab to remove.
     */
    const removeHarpoonedTabFromList = async (urlToRemove) => {
        try {
            const response = await chrome.runtime.sendMessage({
                action: "harpoonCommand",
                command: "removeHarpoonedTab",
                url: urlToRemove
            });
            if (response && response.success) {
                // Re-load and re-render the list after successful removal
                await loadHarpoonedTabs();
            } else {
                console.error("Failed to remove harpooned tab:", response?.error || "Unknown error");
            }
        } catch (error) {
            console.error("Error communicating with background script to remove harpooned tab:", error);
        }
    };

    // Initial load of harpooned tabs when the initHarpoonFeature function is called
    await loadHarpoonedTabs();

    console.log("Harpoon.js initialization complete!");

    // Expose functions to the global window object for popup.js to interact with
    window.refreshHarpoonedTabs = loadHarpoonedTabs;
    window.navigateHarpoonList = navigateHarpoonList;
    window.activateSelectedHarpoonItem = activateSelectedHarpoonItem;
};

// Add a dummy `focusOrCreateTabByUrl` if it's not defined by `popup.js`
// This helps prevent errors during development if `harpoon.js` is tested in isolation,
// but in the actual extension, it should be provided by `popup.js`.
if (typeof window.focusOrCreateTabByUrl === "undefined") {
    window.focusOrCreateTabByUrl = (url, exactMatch) => {
        console.warn(`Simulating focusOrCreateTabByUrl for URL: ${url}, exactMatch: ${exactMatch}`);
        // In a real scenario, this would involve chrome.tabs.query and chrome.tabs.create
        // For testing, you might open a new tab directly:
        // window.open(url, '_blank');
    };
}
