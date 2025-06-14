// Harpoon/harpoon.js

// Define a global initialization function that popup.js can call
// AFTER the harpoon.html content is loaded into the DOM.
window.initHarpoonFeature = async () => {
    // DOM Element References
    const harpoonListContainer = document.getElementById("harpoonList");
    const noHarpoonedMessage = harpoonListContainer.querySelector(".no-harpooned-message");

    // Exit if essential elements are not found, indicating an issue with HTML injection.
    if (!harpoonListContainer) {
        console.error("Harpoon feature: Essential DOM elements not found after initHarpoonFeature call.");
        return;
    }

    // State variable for the currently selected item in the harpoon list
    let selectedHarpoonIndex = -1;
    let harpoonedTabs = []; // Array to hold the current harpooned tabs

    // Local storage key for harpooned tabs (consistent with popup.js prefix)
    const LS_HARPOONED_TABS_KEY = "fuzzyTabSearch_harpoonedTabs";

    /**
     * Highlights the currently selected item in the harpoon list.
     * Scrolls the selected item into view if it's not already visible.
     */
    const highlightHarpoonItem = () => {
        const items = harpoonListContainer.querySelectorAll(".harpoon-item");
        console.log("highlightHarpoonItem called. Selected index:", selectedHarpoonIndex, "Visible items:", items.length);
        items.forEach((item, index) => {
            if (index === selectedHarpoonIndex) {
                item.classList.add("selected");
                item.scrollIntoView({ block: "nearest", behavior: "smooth" });
                console.log("Item at index", index, "highlighted.");
            } else {
                item.classList.remove("selected");
            }
        });
    };

    /**
     * Navigates the harpoon list up or down, with cycling.
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
                // We assume window.focusOrCreateTabByUrl is available from popup.js
                if (typeof window.focusOrCreateTabByUrl === "function") {
                    window.focusOrCreateTabByUrl(selectedItem.url, false); // Harpooned tabs are generally not exact match
                } else {
                    console.error("focusOrCreateTabByUrl is not available in popup.js context. Falling back to background message.");
                    // Fallback to sending a message to background script if direct call fails
                    await chrome.runtime.sendMessage({
                        action: "openTabOrSwitch",
                        url: selectedItem.url,
                        exactMatch: false
                    });
                }
                // The popup will close via focusOrCreateTabByUrl's callback
            } catch (error) {
                console.error("Error activating harpooned tab:", error);
            }
        }
    };

    /**
     * Moves the currently highlighted harpooned tab up or down in the list (non-cycling).
     * @param {string} direction "up" or "down".
     */
    const moveHarpoonItem = async (direction) => {
        console.log("moveHarpoonItem called. Current selectedIndex:", selectedHarpoonIndex, "Total tabs:", harpoonedTabs.length);
        if (selectedHarpoonIndex === -1 || harpoonedTabs.length <= 1) {
            console.log("Move conditions not met (no selection or 0/1 tabs).");
            return; // Nothing to move or only one item
        }

        let newIndex = selectedHarpoonIndex;
        if (direction === "up") {
            if (selectedHarpoonIndex === 0) {
                console.log("Cannot move up from first position.");
                return; // Cannot move up from the first position
            }
            newIndex--;
        } else if (direction === "down") {
            if (selectedHarpoonIndex === harpoonedTabs.length - 1) {
                console.log("Cannot move down from last position.");
                return; // Cannot move down from the last position
            }
            newIndex++;
        }

        // Only perform move if the index actually changes
        if (newIndex !== selectedHarpoonIndex) {
            console.log(`Attempting to move from ${selectedHarpoonIndex} to ${newIndex}.`);
            console.log("harpoonedTabs before splice:", JSON.stringify(harpoonedTabs.map(t => t.title)));

            const [movedItem] = harpoonedTabs.splice(selectedHarpoonIndex, 1);
            harpoonedTabs.splice(newIndex, 0, movedItem);

            console.log("harpoonedTabs after splice:", JSON.stringify(harpoonedTabs.map(t => t.title)));

            selectedHarpoonIndex = newIndex; // Update the selected index to the new position of the item
            console.log("New selectedHarpoonIndex:", selectedHarpoonIndex);

            await saveHarpoonedTabs(); // Persist the new order
            renderHarpoonedTabs(); // Re-render the list
            highlightHarpoonItem(); // Re-highlight the moved item at its new position
            console.log("Move and UI update complete.");
        } else {
            console.log("No index change, not moving.");
        }
    };

    /**
     * Saves the current list of harpooned tabs to chrome.storage.local.
     */
    const saveHarpoonedTabs = async () => {
        try {
            await chrome.storage.local.set({ [LS_HARPOONED_TABS_KEY]: harpoonedTabs });
            console.log("Harpooned tabs saved successfully. Current state:", harpoonedTabs);
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
            const loaded = result[LS_HARPOONED_TABS_KEY] || [];
            console.log("Harpooned tabs loaded from storage:", loaded);
            return loaded;
        } catch (error) {
            console.error("Error loading harpooned tabs from local storage:", error);
            return [];
        }
    };

    /**
     * Loads harpooned tabs, renders them, and sets initial focus.
     */
    const loadHarpoonedTabs = async () => {
        harpoonedTabs = await loadHarpoonedTabsFromStorage(); // Direct load from local storage
        renderHarpoonedTabs();
        // Set initial focus to the first item if the list is not empty
        if (harpoonedTabs.length > 0) {
            selectedHarpoonIndex = 0;
            highlightHarpoonItem();
        } else {
            selectedHarpoonIndex = -1;
        }
    };


    /**
     * Renders the list of harpooned tabs in the UI.
     * It also attaches click listeners for activation and removal.
     */
    const renderHarpoonedTabs = () => {
        console.log("renderHarpoonedTabs called. Harpooned tabs to render:", harpoonedTabs.length);
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
            console.log("No harpooned tabs, showing message.");
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
            removeButton.addEventListener("click", async (e) => {
                e.stopPropagation(); // Prevent item activation when clicking remove button
                await removeHarpoonedTabFromList(harpoonedTab.url);
                // After removal, adjust selected index if necessary
                if (selectedHarpoonIndex >= harpoonedTabs.length) {
                    selectedHarpoonIndex = harpoonedTabs.length > 0 ? harpoonedTabs.length - 1 : -1;
                }
                highlightHarpoonItem(); // Re-highlight after removal and index adjustment
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
        console.log("renderHarpoonedTabs completed. UI updated.");
    };

    /**
     * Removes a harpooned tab from the list by updating chrome.storage.local directly.
     * This will also trigger a re-render.
     * @param {string} urlToRemove The URL of the tab to remove.
     */
    const removeHarpoonedTabFromList = async (urlToRemove) => {
        harpoonedTabs = harpoonedTabs.filter(tab => tab.url !== urlToRemove);
        await saveHarpoonedTabs(); // Persist the new list
        renderHarpoonedTabs(); // Re-render the UI
        console.log("Tab removed from harpoon list and saved.");
    };


    // Initial load of harpooned tabs when the initHarpoonFeature function is called
    await loadHarpoonedTabs();

    console.log("Harpoon.js initialization complete!");

    // Expose functions to the global window object for popup.js to interact with
    window.refreshHarpoonedTabs = loadHarpoonedTabs;
    window.navigateHarpoonList = navigateHarpoonList;
    window.activateSelectedHarpoonItem = activateSelectedHarpoonItem;
    window.moveHarpoonItem = moveHarpoonItem; // NEW: Expose move function
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
