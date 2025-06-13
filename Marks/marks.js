// This file contains the main logic for the Marks feature,
// handling bookmark addition, removal, and persistence.

// Define a global initialization function that popup.js can call
// AFTER the marks.html content is loaded into the DOM.
window.initMarksFeature = async (defaultUrl = '', defaultTitle = '') => {
    // DOM Element References - these will only exist AFTER marks.html has been loaded
    // and its content injected into the #marksSection by popup.js.
    const urlNameInput = document.getElementById("urlNameInput");
    const urlInput = document.getElementById("urlInput");
    const addMarkButton = document.getElementById("addMarkButton");
    const marksListContainer = document.getElementById("marksList");
    const noMarksMessage = marksListContainer.querySelector(".no-marks-message");

    // Exit if essential elements are not found, indicating an issue with HTML injection.
    if (!urlNameInput || !urlInput || !addMarkButton || !marksListContainer) {
        console.error("Marks feature: Essential DOM elements not found after initMarksFeature call.");
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

    /**
     * Loads bookmarks from Chrome's local storage.
     * @returns {Promise<Array>} A promise that resolves with the loaded bookmarks array.
     */
    const loadBookmarks = async () => {
        try {
            const result = await chrome.storage.local.get(STORAGE_KEY);
            // Ensure bookmarks is always an array
            bookmarks = Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
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

            markInfo.appendChild(markName);
            markInfo.appendChild(markUrl);

            const removeButton = document.createElement("button");
            removeButton.classList.add("remove-mark-button");
            removeButton.innerHTML = '&#x2715;'; // X icon
            removeButton.title = "Remove Bookmark";
            removeButton.addEventListener("click", () => removeBookmark(index));

            markItem.appendChild(markInfo);
            markItem.appendChild(removeButton);
            marksListContainer.appendChild(markItem);
        });
    };

    /**
     * Adds a new bookmark to the list.
     */
    const addBookmark = async () => {
        const name = urlNameInput.value.trim();
        let url = urlInput.value.trim();

        // Remove error classes before validation
        urlNameInput.classList.remove("input-error");
        urlInput.classList.remove("input-error");

        if (!name || !url) {
            if (!name) urlNameInput.classList.add("input-error");
            if (!url) urlInput.classList.add("input-error");
            return;
        }

        // Simple URL validation: prepend 'https://' if no protocol specified
        if (!/^https?:\/\//i.test(url)) {
            url = `https://${url}`;
        }

        bookmarks.push({ name, url });
        await saveBookmarks();
        renderBookmarks(); // Re-render the list with the new item

        // Clear input fields after adding
        urlNameInput.value = "";
        urlInput.value = "";
        urlNameInput.focus(); // Keep focus on the name input
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

    // Event Listeners
    addMarkButton.addEventListener("click", addBookmark);

    // Allow adding bookmark with Enter key in input fields
    urlNameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault(); // Prevent new line in input
            addBookmark();
        }
    });

    urlInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault(); // Prevent new line in input
            addBookmark();
        }
    });

    // Remove error class on input
    urlNameInput.addEventListener("input", () => {
        urlNameInput.classList.remove("input-error");
    });
    urlInput.addEventListener("input", () => {
        urlInput.classList.remove("input-error");
    });

    // Initial load of bookmarks when the initMarksFeature function is called
    await loadBookmarks();

    console.log("Marks.js initialization complete!");
};
