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

    let harpoonedTabs = []; // Array to hold the current harpooned tabs

    /**
     * Loads harpooned tabs from the background script (which gets them from local storage).
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
            } else {
                console.error("Failed to load harpooned tabs:", response?.error || "Unknown error");
                harpoonedTabs = []; // Fallback to empty array on error
                renderHarpoonedTabs();
            }
        } catch (error) {
            console.error("Error communicating with background script to load harpooned tabs:", error);
            harpoonedTabs = [];
            renderHarpoonedTabs();
        }
    };

    /**
     * Renders the list of harpooned tabs in the UI.
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

        harpoonedTabs.forEach((harpoonedTab) => {
            const harpoonItem = document.createElement("div");
            harpoonItem.classList.add("harpoon-item");

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
            removeButton.addEventListener("click", () => removeHarpoonedTabFromList(harpoonedTab.url));

            harpoonItem.appendChild(favicon);
            harpoonItem.appendChild(harpoonInfo);
            harpoonItem.appendChild(removeButton);
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

    // Expose a function to allow popup.js to trigger a re-render if needed (e.g., after an Alt+Q action)
    window.refreshHarpoonedTabs = loadHarpoonedTabs;
};
