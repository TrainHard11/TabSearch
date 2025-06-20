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
    const marksSearchContainer = document.getElementById("marksSearchContainer");
    const marksSearchInput = document.getElementById("marksSearchInput"); // marksMessageDiv is removed - no longer needed
    const addMarkSection = document.getElementById("addMarkSection"); // Add bookmark section container
    const marksContainer = document.querySelector(".marks-container"); // Reference to the main marks container

    if (
        !urlNameInput ||
        !urlInput ||
        !exactMatchCheckbox ||
        !addMarkButton ||
        !marksListContainer ||
        !marksSearchContainer ||
        !marksSearchInput ||
        !addMarkSection ||
        !marksContainer // Ensure marksContainer is found
    ) {
        console.error(
            "Marks feature: Essential DOM elements not found after initMarksFeature call.",
        );
        return;
    } // Set the default URL input value to the current tab's URL

    urlInput.value = defaultUrl; // Set the default URL Name input value to the current tab's title
    urlNameInput.value = defaultTitle; // Key for storing bookmarks in chrome.storage.local

    const STORAGE_KEY = "fuzzyTabSearch_bookmarks";
    // Key for commanding initial focus to a specific bookmark (used by background.js)
    const INITIAL_MARK_URL_KEY = "fuzzyTabSearch_initialMarkUrl"; // Array to hold the current bookmarks (full, unfiltered list)

    let bookmarks = []; // To track the currently selected bookmark in the list for keyboard navigation
    let selectedMarkIndex = -1;
    // NEW: State for tracking which bookmark is currently being renamed
    let editingMarkIndex = -1; // -1 means no bookmark is being edited

    // State for the Marks search feature
    let isMarksSearchActive = false; // True if search input is focused, regardless of always-visible setting
    let currentMarksSearchQuery = "";
    let filteredMarksResults = []; // Stores the currently filtered results for rendering
    // let messageTimeoutId = null; // Removed - no longer needed

    let alwaysShowSearchInput = false; // Local state for the setting
    // displayMessage function removed
    /**
     * Highlights the query in the text. (Copied from popup.js for self-containment)
     * @param {string} text The full text to highlight.
     * @param {string} query The search query.
     * @returns {string} HTML string with highlighted text.
     */

    const highlightText = (text, query) => {
        if (!text || !query) return text;
        const lowerCaseQuery = query.toLowerCase();
        const queryWords = lowerCaseQuery.split(" ").filter(Boolean);
        let highlightedHtml = text;
        queryWords.forEach((word) => {
            const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(`(${escapedWord})`, "gi");
            highlightedHtml = highlightedHtml.replace(
                regex,
                (match) => `<span class="highlight">${match}</span>`,
            );
        });
        return highlightedHtml;
    }; /**
     * Performs a fuzzy search on a given list of items. (Copied from popup.js for self-containment)
     * Items are expected to have 'name' and 'url' properties.
     * Prioritizes name matches over URL matches.
     * @param {Array<Object>} items The array of items (marks) to search within.
     * @param {string} query The search query.
     * @param {string} nameKey The key for the name property (e.g., 'name' for marks).
     * @returns {Array<Object>} The filtered and sorted list of items.
     */

    const fuzzySearchItems = (items, query, nameKey) => {
        // Corrected parameter order
        if (!query) return items;
        const lowerCaseQuery = query.toLowerCase();
        const queryWords = lowerCaseQuery.split(" ").filter(Boolean);

        const nameMatches = [];
        const urlMatches = [];
        const processedUrls = new Set(); // To prevent duplicates

        items.forEach((item) => {
            const itemName = (item[nameKey] || "").toLowerCase();
            const itemUrl = (item.url || "").toLowerCase();

            const matchesName = queryWords.every((word) => itemName.includes(word));
            const matchesUrl = queryWords.every((word) => itemUrl.includes(word));

            if (matchesName) {
                nameMatches.push(item);
                processedUrls.add(item.url);
            } else if (matchesUrl && !processedUrls.has(item.url)) {
                urlMatches.push(item);
                processedUrls.add(item.url);
            }
        });
        return [...nameMatches, ...urlMatches];
    }; /**
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
    }; /**
     * Navigates the interactive elements in the Marks view (input fields, add button, search input, bookmark list).
     * This function manages the focus and the `selectedMarkIndex` for the list.
     * @param {string} direction "up" or "down".
     */

    const navigateMarksList = (direction) => {
        // Prevent navigation if an item is currently being edited
        if (editingMarkIndex !== -1) {
            return;
        }

        const items = marksListContainer.querySelectorAll(".mark-item");
        let focusableElements = []; // Add elements based on their visibility

        if (!addMarkSection.classList.contains("hidden")) {
            focusableElements.push(urlNameInput, urlInput, addMarkButton);
        }
        if (alwaysShowSearchInput || isMarksSearchActive) {
            // Search input is always visible OR active
            focusableElements.push(marksSearchInput);
        }
        focusableElements.push(...Array.from(items));

        let currentFocusIndex = -1;
        const activeElement = document.activeElement; // Determine current focus index

        for (let i = 0; i < focusableElements.length; i++) {
            if (activeElement === focusableElements[i]) {
                currentFocusIndex = i;
                break;
            }
        }

        let newFocusIndex = currentFocusIndex;

        if (direction === "down") {
            if (
                currentFocusIndex === -1 ||
                currentFocusIndex === focusableElements.length - 1
            ) {
                newFocusIndex = 0; // Cycle to the first focusable element
            } else {
                newFocusIndex++;
            }
        } else if (direction === "up") {
            if (currentFocusIndex === -1 || currentFocusIndex === 0) {
                newFocusIndex = focusableElements.length - 1; // Cycle to the last focusable element
            } else {
                newFocusIndex--;
            }
        } // Apply new focus

        if (newFocusIndex !== -1 && focusableElements[newFocusIndex]) {
            focusableElements[newFocusIndex].focus(); // Update selectedMarkIndex if a bookmark item is focused

            if (focusableElements[newFocusIndex].classList.contains("mark-item")) {
                selectedMarkIndex = Array.from(items).indexOf(
                    focusableElements[newFocusIndex],
                );
            } else {
                selectedMarkIndex = -1; // No mark item is selected
            }
        } else {
            selectedMarkIndex = -1; // No focusable elements, or no item selected
        }
        highlightMarkItem(); // Update visual highlight based on selectedMarkIndex
    }; /**
     * Activates (opens URL) the currently selected bookmark item.
     * It uses window.focusOrCreateTabByUrl (provided by popup.js) to handle opening or switching tabs.
     */

    const activateSelectedMarkItem = () => {
        // Prevent activation if an item is currently being edited
        if (editingMarkIndex !== -1) {
            return;
        }
        if (selectedMarkIndex !== -1 && filteredMarksResults[selectedMarkIndex]) {
            // Use filtered results
            const selectedItem = filteredMarksResults[selectedMarkIndex]; // Use filtered results
            if (typeof window.focusOrCreateTabByUrl === "function") {
                window.focusOrCreateTabByUrl(selectedItem.url, selectedItem.exactMatch);
            } else {
                console.error(
                    "focusOrCreateTabByUrl is not available. Cannot open bookmark.",
                );
            }
        }
    }; /**
     * Moves the currently highlighted bookmark up or down in the list.
     * This function is called by keymaps and from the UI up/down buttons.
     * It relies on `selectedMarkIndex` being set correctly before calling.
     * Introduces a visual animation for the moved item.
     * @param {string} direction "up" or "down".
     */
    const moveMarkItem = async (direction) => {
        // Prevent movement if an item is currently being edited or search is active
        if (editingMarkIndex !== -1 || isMarksSearchActive) {
            return;
        }

        if (selectedMarkIndex === -1 || bookmarks.length <= 1) {
            return; // Nothing to move or only one item
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
        } // Only perform move if the index actually changes

        if (newIndex !== selectedMarkIndex) {
            // Store the URL of the item being moved to identify it after re-render
            const movedItemUrl = bookmarks[selectedMarkIndex].url; // Perform the swap using array destructuring for cleaner code

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
                movedElement.classList.add("moved-highlight"); // Remove the 'moved-highlight' class after a short delay
                setTimeout(() => {
                    movedElement.classList.remove("moved-highlight");
                }, 400); // Duration matches CSS transition for smooth fade-out
            } // Ensure the newly moved item stays focused/selected

            const items = marksListContainer.querySelectorAll(".mark-item");
            if (items[selectedMarkIndex]) {
                items[selectedMarkIndex].focus(); // Re-focus the moved item
            }

            highlightMarkItem(); // Re-highlight the item in its new position
        }
    }; /**
     * Loads bookmarks from Chrome's local storage.
     * @returns {Promise<Array>} A promise that resolves with the loaded bookmarks array.
     */

    const loadBookmarks = async () => {
        try {
            const result = await chrome.storage.local.get(STORAGE_KEY); // Ensure bookmarks is always an array, and default exactMatch to false if not present
            // Also, ensure `searchableInTabSearch` defaults to `false` for existing bookmarks without the property.
            bookmarks = Array.isArray(result[STORAGE_KEY])
                ? result[STORAGE_KEY].map((mark) => ({
                    ...mark,
                    exactMatch: mark.exactMatch ?? false,
                    searchableInTabSearch: mark.searchableInTabSearch ?? false,
                }))
                : []; // On initial load, set filteredMarksResults to the full list

            if (!isMarksSearchActive || currentMarksSearchQuery === "") {
                filteredMarksResults = [...bookmarks];
            } else {
                // If search was active when reloading, re-filter
                performMarksSearch(currentMarksSearchQuery); // This will update filteredMarksResults
            }

            renderBookmarks(); // Render immediately after loading
        } catch (error) {
            console.error("Error loading bookmarks:", error);
            bookmarks = []; // Fallback to empty array on error
            filteredMarksResults = []; // Also reset filtered results
            renderBookmarks();
        }
    }; /**
     * Saves the current bookmarks array to Chrome's local storage.
     */

    const saveBookmarks = async () => {
        try {
            await chrome.storage.local.set({ [STORAGE_KEY]: bookmarks });
        } catch (error) {
            console.error("Error saving bookmarks:", error); // displayMessage("Error saving bookmark.", "error"); // Removed
        }
    }; /**
     * Renders the list of bookmarks in the UI.
     * It uses `filteredMarksResults` if a search is active, otherwise `bookmarks`.
     * It also attaches click listeners for activation, removal, and reordering.
     */

    const renderBookmarks = () => {
        marksListContainer.innerHTML = ""; // Clear existing list

        // Update the editing class on the main container
        if (editingMarkIndex !== -1) {
            marksContainer.classList.add("editing");
        } else {
            marksContainer.classList.remove("editing");
        }

        const listToRender = isMarksSearchActive ? filteredMarksResults : bookmarks;

        if (listToRender.length === 0) {
            // Display 'No bookmarks' message if the list is empty
            if (noMarksMessage) {
                marksListContainer.appendChild(noMarksMessage);
                noMarksMessage.classList.remove("hidden"); // Ensure it's visible
            } else {
                // If the message element wasn't found initially (e.g., first render), create it
                const msg = document.createElement("p");
                msg.classList.add("no-marks-message");
                msg.textContent = isMarksSearchActive
                    ? "No matching bookmarks found."
                    : "No bookmarks added yet.";
                marksListContainer.appendChild(msg);
            } // Ensure no item is selected when list is empty
            selectedMarkIndex = -1;
            return;
        } else {
            // Hide the 'No bookmarks' message if present and there are bookmarks
            if (noMarksMessage) {
                noMarksMessage.classList.add("hidden");
            }
        }

        listToRender.forEach((mark, index) => {
            const markItem = document.createElement("div");
            markItem.classList.add("mark-item");
            markItem.dataset.index = index; // Store index for removal (relative to filtered list)
            markItem.dataset.url = mark.url; // Store URL for identifying after re-render (for move animation)
            markItem.tabIndex = 0; // Make list item focusable

            // Add 'selected' class if it's the currently selected item
            if (index === selectedMarkIndex) {
                markItem.classList.add("selected");
            }
            // Add 'editing' class if this item is being edited
            if (index === editingMarkIndex) {
                markItem.classList.add("editing");
            }


            const markInfo = document.createElement("div");
            markInfo.classList.add("mark-info");

            // NEW: Conditional rendering for mark name (span or input)
            if (index === editingMarkIndex) {
                const renameInput = document.createElement("input");
                renameInput.type = "text";
                renameInput.classList.add("marks-input", "marks-rename-input"); // Apply existing input styles
                renameInput.value = mark.name || "";
                renameInput.id = "markRenameInput"; // Give it a unique ID for easy access and focusing
                renameInput.setAttribute("aria-label", `Rename bookmark "${mark.name}"`);

                // Event listeners for the rename input
                renameInput.addEventListener("blur", () => {
                    // Save on blur only if it was the active editing input
                    if (editingMarkIndex === index) {
                        finishRenamingMark(renameInput.value);
                    }
                });
                renameInput.addEventListener("keydown", (e) => {
                    e.stopPropagation(); // Prevent keyboard events from bubbling up to document handler
                    if (e.key === "Enter") {
                        e.preventDefault(); // Prevent new line in input
                        finishRenamingMark(renameInput.value);
                    } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelRenamingMark();
                    }
                });

                markInfo.appendChild(renameInput);
            } else {
                // Original rendering as a span
                const markName = document.createElement("span");
                markName.classList.add("mark-name");
                markName.innerHTML = highlightText(
                    mark.name || "",
                    currentMarksSearchQuery,
                ); // Highlight name
                markInfo.appendChild(markName);
            }


            const markUrl = document.createElement("a");
            markUrl.classList.add("mark-url");
            markUrl.href = mark.url;
            markUrl.innerHTML = highlightText(
                mark.url || "",
                currentMarksSearchQuery,
            ); // Highlight URL
            markUrl.target = "_blank"; // Open in a new tab
            // Prevent default navigation for the URL link within the item
            markUrl.addEventListener("click", (e) => {
                e.preventDefault(); // Stop default browser action (opening URL)
                e.stopPropagation(); // Stop event from bubbling up to the markItem click listener
            }); // Display exact match status

            const exactMatchStatus = document.createElement("span");
            exactMatchStatus.classList.add("exact-match-status");
            exactMatchStatus.textContent = mark.exactMatch ? " [Exact Match]" : "";
            exactMatchStatus.style.fontWeight = "bold";
            exactMatchStatus.style.color = mark.exactMatch ? "#98c379" : "#a0a0a0"; // Green for exact, grey for partial

            // Only append URL and status if not currently editing (to keep layout clean during edit)
            if (index !== editingMarkIndex) {
                markInfo.appendChild(markUrl);
                markInfo.appendChild(exactMatchStatus); // Append status
            }

            // Searchable checkbox
            const searchableCheckboxContainer = document.createElement("div");
            searchableCheckboxContainer.classList.add(
                "searchable-checkbox-container",
            );

            const searchableCheckbox = document.createElement("input");
            searchableCheckbox.type = "checkbox";
            searchableCheckbox.id = `searchable-${mark.url.replace(/[^a-zA-Z0-9]/g, "")}-${index}`; // Unique ID
            searchableCheckbox.classList.add("marks-checkbox"); // Re-use existing checkbox style
            searchableCheckbox.checked = mark.searchableInTabSearch;
            searchableCheckbox.title = "Include in Tab Search";
            searchableCheckbox.setAttribute("aria-label", "Include in Tab Search"); // Accessibility
            // Event listener for the new searchable checkbox
            searchableCheckbox.addEventListener("change", async (e) => {
                e.stopPropagation(); // Prevent item selection and bubbling to markItem
                // Find the original bookmark object in the 'bookmarks' array
                // We use findIndex to get the original index, not the 'displayedIndex'
                const originalMarkIndex = bookmarks.findIndex(
                    (b) => b.url === mark.url && b.name === mark.name,
                );
                if (originalMarkIndex > -1) {
                    bookmarks[originalMarkIndex].searchableInTabSearch = e.target.checked;
                    await saveBookmarks(); // No need to re-render marks here, but popups.js will need to reload marks
                }
            }); // Crucially, stop click event propagation directly on the checkbox itself

            searchableCheckbox.addEventListener("click", (e) => {
                e.stopPropagation(); // Prevent this click from bubbling to markItem
            });

            const searchableLabel = document.createElement("label");
            searchableLabel.htmlFor = searchableCheckbox.id;
            searchableLabel.textContent = "Tab Search";
            searchableLabel.classList.add("checkbox-label"); // Re-use existing label style
            // Stop click event propagation directly on the label as well
            searchableLabel.addEventListener("click", (e) => {
                e.stopPropagation(); // Prevent this click from bubbling to markItem
            });

            searchableCheckboxContainer.appendChild(searchableCheckbox);
            searchableCheckboxContainer.appendChild(searchableLabel);

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
                // Prevent move if currently editing
                if (editingMarkIndex !== -1) return;

                selectedMarkIndex = index; // Set index before moving
                highlightMarkItem(); // Highlight immediately
                await moveMarkItem("up");
            });
            actionButtonsContainer.appendChild(upButton); // Down button

            const downButton = document.createElement("button");
            downButton.classList.add("marks-move-button", "marks-move-down"); // Use marks-specific class
            downButton.innerHTML = "&#9660;"; // Down arrow character
            downButton.title = "Move Down";
            downButton.setAttribute("aria-label", "Move Bookmark Down"); // Accessibility
            downButton.addEventListener("click", async (e) => {
                e.stopPropagation(); // Prevent item selection
                // Prevent move if currently editing
                if (editingMarkIndex !== -1) return;

                selectedMarkIndex = index; // Set index before moving
                highlightMarkItem(); // Highlight immediately
                await moveMarkItem("down");
            });
            actionButtonsContainer.appendChild(downButton); // Remove button

            const removeButton = document.createElement("button");
            removeButton.classList.add("remove-mark-button");
            removeButton.innerHTML = "✕"; // X icon
            removeButton.title = "Remove Bookmark";
            removeButton.setAttribute("aria-label", "Remove Bookmark"); // Accessibility
            removeButton.addEventListener("click", async (e) => {
                e.stopPropagation(); // Prevent item selection
                // Prevent removal if currently editing
                if (editingMarkIndex !== -1) return;

                await removeBookmark(index); // This index is relative to the filtered list now!
                // After removal, adjust selected index if necessary
                if (selectedMarkIndex >= filteredMarksResults.length) {
                    // Check filtered length
                    selectedMarkIndex =
                        filteredMarksResults.length > 0
                            ? filteredMarksResults.length - 1
                            : -1;
                }
                highlightMarkItem();
            });
            actionButtonsContainer.appendChild(removeButton); // Append searchable checkbox container before action buttons

            markItem.appendChild(markInfo);
            markItem.appendChild(searchableCheckboxContainer);
            markItem.appendChild(actionButtonsContainer); // Append action buttons container
            // Main click listener for the entire mark item

            markItem.addEventListener("click", () => {
                // Prevent activation if currently editing
                if (editingMarkIndex !== -1) return;

                selectedMarkIndex = index; // Update selected index on click
                highlightMarkItem();
                activateSelectedMarkItem();
            });

            marksListContainer.appendChild(markItem);
        }); // Ensure selection remains valid after re-render or new load

        if (selectedMarkIndex >= listToRender.length) {
            // Use listToRender length
            selectedMarkIndex =
                listToRender.length > 0 ? listToRender.length - 1 : -1;
        }
        highlightMarkItem();

        // If an item was just put into edit mode, focus the input field
        if (editingMarkIndex !== -1) {
            const renameInput = document.getElementById("markRenameInput");
            if (renameInput) {
                renameInput.focus();
                // Select all text in the input for easy renaming
                renameInput.select();
            }
        }
    };

    /**
     * Attempts to focus a bookmark item by its URL.
     * @param {string} urlToFocus The URL of the bookmark to find and focus.
     */
    const focusBookmarkByUrl = (urlToFocus) => {
        if (!urlToFocus) return;

        let foundIndex = -1;
        const listToSearch = isMarksSearchActive ? filteredMarksResults : bookmarks;

        for (let i = 0; i < listToSearch.length; i++) {
            if (listToSearch[i].url === urlToFocus) {
                foundIndex = i;
                break;
            }
        }

        if (foundIndex !== -1) {
            selectedMarkIndex = foundIndex;
            renderBookmarks(); // Re-render to apply selection class
            const items = marksListContainer.querySelectorAll(".mark-item");
            if (items[selectedMarkIndex]) {
                items[selectedMarkIndex].focus(); // Programmatically focus the DOM element
            }
        } else {
            console.warn(
                "Bookmark to focus not found in the current list:",
                urlToFocus,
            );
        }
    }; /**
     * Adds a new bookmark to the list.
     */

    const addBookmark = async () => {
        // Prevent adding if an item is currently being edited
        if (editingMarkIndex !== -1) {
            return;
        }

        const name = urlNameInput.value.trim();
        let url = urlInput.value.trim();
        const exactMatch = exactMatchCheckbox.checked; // Get exact match state
        // Remove error classes before validation

        urlNameInput.classList.remove("input-error");
        urlInput.classList.remove("input-error");

        if (!name || !url) {
            if (!name) {
                urlNameInput.classList.add("input-error");
            }
            if (!url) {
                urlInput.classList.add("input-error");
            }
            // No message, just visual feedback
            return;
        } // Validate for unique URL

        const existingMarkByUrl = bookmarks.find((mark) => mark.url === url);
        if (existingMarkByUrl) {
            urlInput.classList.add("input-error");
            focusBookmarkByUrl(url); // Focus existing bookmark
            return;
        } // Validate for unique name (case-insensitive for user experience)

        const existingMarkByName = bookmarks.find(
            (mark) => mark.name.toLowerCase() === name.toLowerCase(),
        );
        if (existingMarkByName) {
            urlNameInput.classList.add("input-error");
            focusBookmarkByUrl(existingMarkByName.url); // Focus existing bookmark by its URL
            return;
        } // Add new bookmark with exactMatch and searchableInTabSearch property (default to false)

        bookmarks.push({ name, url, exactMatch, searchableInTabSearch: false });
        await saveBookmarks(); // No success message needed here
        // Clear input fields and reset checkbox after successful addition
        urlNameInput.value = "";
        urlInput.value = "";
        exactMatchCheckbox.checked = false; // Reset to default (unchecked)
        // After adding, clear any active search and refresh the full list

        clearMarksSearchState();
        urlNameInput.focus(); // Keep focus on the name input
        // loadBookmarks() will be called by clearMarksSearchState() which re-renders
        selectedMarkIndex = -1; // Clear selection after adding new item
        highlightMarkItem();
    }; /**
     * Removes a bookmark from the list by its index.
     * Note: This index is the *displayed* index (from filteredMarksResults).
     * We need to find the original index in `bookmarks` to remove it.
     * @param {number} displayedIndex The index of the bookmark to remove from the currently displayed list.
     */

    const removeBookmark = async (displayedIndex) => {
        // Prevent removal if an item is currently being edited
        if (editingMarkIndex !== -1) {
            return;
        }

        if (displayedIndex > -1 && displayedIndex < filteredMarksResults.length) {
            const markToRemove = filteredMarksResults[displayedIndex]; // Find the index of this mark in the original, unfiltered 'bookmarks' array
            // Now comparing all properties to be safe after adding searchableInTabSearch
            const originalIndex = bookmarks.findIndex(
                (mark) =>
                    mark.url === markToRemove.url &&
                    mark.name === markToRemove.name &&
                    mark.exactMatch === markToRemove.exactMatch &&
                    mark.searchableInTabSearch === markToRemove.searchableInTabSearch,
            );

            if (originalIndex > -1) {
                bookmarks.splice(originalIndex, 1); // Remove the item from the original list
                await saveBookmarks(); // displayMessage("Bookmark removed.", "success"); // Removed
                // If search is active, re-filter the list; otherwise, just re-render the full list
                if (isMarksSearchActive) {
                    performMarksSearch(currentMarksSearchQuery);
                } else {
                    filteredMarksResults = [...bookmarks]; // Sync filtered results with full list
                    renderBookmarks();
                }
            }
        }
    }; /**
     * Removes the currently selected bookmark item from the list permanently.
     */

    const removeSelectedMarkItem = async () => {
        // Prevent removal if an item is currently being edited
        if (editingMarkIndex !== -1) {
            return;
        }

        if (selectedMarkIndex !== -1 && filteredMarksResults[selectedMarkIndex]) {
            const indexToRemove = selectedMarkIndex; // Use selectedIndex directly, as it refers to filteredMarksResults
            await removeBookmark(indexToRemove); // Use existing removeBookmark function
            // After removal, adjust selected index if necessary

            if (filteredMarksResults.length === 0) {
                selectedMarkIndex = -1;
            } else if (indexToRemove < filteredMarksResults.length) {
                selectedMarkIndex = indexToRemove;
            } else {
                selectedMarkIndex = filteredMarksResults.length - 1;
            }
            selectedMarkIndex = Math.max(-1, selectedMarkIndex); // Ensure it's not less than -1

            highlightMarkItem();
        }
    }; /**
     * Performs a search on the bookmarks and updates the displayed list.
     * @param {string} query The search query.
     */

    const performMarksSearch = (query) => {
        currentMarksSearchQuery = query.trim();
        if (currentMarksSearchQuery === "") {
            filteredMarksResults = [...bookmarks]; // If query is empty, show all bookmarks
        } else {
            // Pass the items first, then the query, then the key
            filteredMarksResults = fuzzySearchItems(
                bookmarks,
                currentMarksSearchQuery,
                "name",
            );
        }
        selectedMarkIndex = filteredMarksResults.length > 0 ? 0 : -1; // Select first result if any
        renderBookmarks();
        highlightMarkItem();
    }; /**
     * Clears the Marks search state and reverts the list to its full, unfiltered state.
     * Note: This will not hide the search input if `alwaysShowSearchInput` is true.
     */

    const clearMarksSearchState = () => {
        isMarksSearchActive = false;
        currentMarksSearchQuery = "";
        marksSearchInput.value = "";
        if (!alwaysShowSearchInput) {
            // Only hide if setting is off
            marksSearchContainer.classList.add("hidden");
        }
        filteredMarksResults = [...bookmarks]; // Show all bookmarks
        selectedMarkIndex = -1; // Clear list selection
        renderBookmarks();
    };

    /**
     * Toggles the visibility of the add bookmark section.
     * This function is called from popup.js when the setting changes.
     * @param {boolean} isVisible True to show, false to hide.
     */
    window.toggleMarksAddSection = (isVisible) => {
        if (addMarkSection) {
            if (isVisible) {
                addMarkSection.classList.remove("hidden");
                // Only focus on urlNameInput if no rename is currently active
                if (editingMarkIndex === -1) {
                    urlNameInput.focus();
                }
            } else {
                addMarkSection.classList.add("hidden"); // If the section is hidden, ensure no focus is trapped in its elements.
                if (alwaysShowSearchInput || isMarksSearchActive) {
                    // Focus search if always visible or currently active
                    marksSearchInput.focus();
                } else if (bookmarks.length > 0) {
                    const firstMarkItem = marksListContainer.querySelector(".mark-item");
                    if (firstMarkItem) {
                        selectedMarkIndex = 0;
                        firstMarkItem.focus();
                        highlightMarkItem();
                    } else {
                        document.body.focus();
                    }
                } else {
                    document.body.focus();
                }
            }
        }
    }; /**
     * Toggles the persistent visibility of the marks search input.
     * This function is called from popup.js when the setting changes.
     * @param {boolean} shouldBeAlwaysVisible True to always show, false to revert to toggle behavior.
     */

    window.toggleMarksSearchInputAlwaysVisible = (shouldBeAlwaysVisible) => {
        alwaysShowSearchInput = shouldBeAlwaysVisible;
        if (marksSearchContainer) {
            if (alwaysShowSearchInput) {
                marksSearchContainer.classList.remove("hidden");
                isMarksSearchActive = true; // Consider it active when always visible
                marksSearchInput.focus(); // Focus it when it becomes always visible
            } else {
                // If it's no longer always visible, and not currently searched, hide it
                if (currentMarksSearchQuery === "") {
                    marksSearchContainer.classList.add("hidden");
                    isMarksSearchActive = false; // Not active if query is empty and not always visible
                }
            }
        }
    };

    /**
     * Initiates the renaming process for the currently selected bookmark.
     * It sets `editingMarkIndex` and re-renders to show the input field.
     */
    const startRenamingMark = () => {
        // Only start renaming if an item is selected and not already editing
        if (selectedMarkIndex !== -1 && editingMarkIndex === -1) {
            editingMarkIndex = selectedMarkIndex;
            renderBookmarks(); // Re-render to show the input field
        }
    };

    /**
     * Completes the renaming process, updating the bookmark's name.
     * @param {string} newName The new name for the bookmark.
     */
    const finishRenamingMark = async (newName) => {
        if (editingMarkIndex !== -1) {
            const markToUpdate = filteredMarksResults[editingMarkIndex];
            const originalIndex = bookmarks.findIndex(
                (b) => b.url === markToUpdate.url && b.name === markToUpdate.name,
            );

            const trimmedNewName = newName.trim();

            if (trimmedNewName && originalIndex > -1) {
                // Check for duplicate name (case-insensitive, excluding itself)
                const isDuplicate = bookmarks.some(
                    (mark, idx) =>
                        idx !== originalIndex &&
                        mark.name.toLowerCase() === trimmedNewName.toLowerCase(),
                );

                if (isDuplicate) {
                    console.warn("Bookmark with this name already exists.");
                    // Optionally, provide visual feedback here
                    // For now, revert to old name if duplicate
                    // No alert() or window.alert(), so we just log or indicate visually
                    const renameInput = document.getElementById("markRenameInput");
                    if (renameInput) {
                        renameInput.classList.add("input-error");
                    }
                    // Do not save, just exit editing mode (or keep it active to allow correction)
                    // For now, let's keep editing active with error state. User must fix or ESC.
                    return;
                }

                bookmarks[originalIndex].name = trimmedNewName;
                await saveBookmarks();
            } else if (!trimmedNewName && originalIndex > -1) {
                // If the new name is empty, revert to the original name or apply an error state
                // For this scenario, we'll just revert to the original name for simplicity
                // and keep the current name.
                // Or you could force deletion or prompt for a new name.
                console.warn("Bookmark name cannot be empty. Reverting.");
                const renameInput = document.getElementById("markRenameInput");
                if (renameInput) {
                    renameInput.classList.add("input-error");
                }
                return; // Stay in editing mode with error
            }

            // If we reached here, either name was updated or it was empty and we exited editing.
            editingMarkIndex = -1; // Exit editing mode
            // Re-render to show updated name (if changed) or revert from error state
            // If search is active, re-filter; otherwise, just re-render the full list
            if (isMarksSearchActive) {
                performMarksSearch(currentMarksSearchQuery);
            } else {
                filteredMarksResults = [...bookmarks]; // Sync filtered results with full list
                renderBookmarks();
            }
            // Re-focus the item if it still exists
            const items = marksListContainer.querySelectorAll(".mark-item");
            if (selectedMarkIndex !== -1 && items[selectedMarkIndex]) {
                items[selectedMarkIndex].focus();
            } else if (marksSearchInput && !marksSearchInput.classList.contains('hidden')) { // Fallback to search input if visible
                marksSearchInput.focus();
            } else if (urlNameInput && !urlNameInput.classList.contains('hidden')) { // Fallback to add name input if visible
                 urlNameInput.focus();
            } else {
                document.body.focus();
            }
        }
    };

    /**
     * Cancels the renaming process, discarding any changes.
     */
    const cancelRenamingMark = () => {
        if (editingMarkIndex !== -1) {
            editingMarkIndex = -1; // Exit editing mode
            // If search is active, re-filter; otherwise, just re-render the full list
            if (isMarksSearchActive) {
                performMarksSearch(currentMarksSearchQuery);
            } else {
                filteredMarksResults = [...bookmarks]; // Sync filtered results with full list
                renderBookmarks();
            }
             // Re-focus the item if it still exists
            const items = marksListContainer.querySelectorAll(".mark-item");
            if (selectedMarkIndex !== -1 && items[selectedMarkIndex]) {
                items[selectedMarkIndex].focus();
            } else if (marksSearchInput && !marksSearchInput.classList.contains('hidden')) { // Fallback to search input if visible
                marksSearchInput.focus();
            } else if (urlNameInput && !urlNameInput.classList.contains('hidden')) { // Fallback to add name input if visible
                 urlNameInput.focus();
            } else {
                document.body.focus();
            }
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

        // If currently editing a bookmark
        if (editingMarkIndex !== -1) {
            const renameInput = document.getElementById("markRenameInput");
            if (activeElement === renameInput) {
                // These keys are handled by the input's own event listeners
                if (e.key === "Enter" || e.key === "Escape") {
                    return; // Let the input's handler manage
                }
                // Allow normal text input and navigation within the input
                // No need to prevent default for printable characters here
                return;
            }
        }

        // Allow j/k to be typed normally in inputs if Alt is NOT pressed
        if (
            !e.altKey &&
            (activeElement === urlNameInput ||
                activeElement === urlInput ||
                activeElement === marksSearchInput)
        ) {
            if (e.key === "j" || e.key === "k") {
                // Allow j/k to be typed normally in inputs
                return;
            }
        }

        // Prevent other actions if editing is active, except Escape
        if (editingMarkIndex !== -1 && e.key !== "Escape") {
            e.preventDefault(); // Consume key presses while editing is active
            return;
        }


        if (e.key === "ArrowDown" || e.key === "j" || (e.altKey && e.key === "j")) {
            e.preventDefault();
            navigateMarksList("down"); // Use the updated navigation logic
        } else if (
            e.key === "ArrowUp" ||
            e.key === "k" ||
            (e.altKey && e.key === "k")
        ) {
            e.preventDefault();
            navigateMarksList("up"); // Use the updated navigation logic
        } else if (e.key === "Enter") {
            e.preventDefault(); // Prevent default browser behavior for Enter key

            if (
                document.activeElement === addMarkButton &&
                !addMarkSection.classList.contains("hidden")
            ) {
                addBookmark(); // Directly call addBookmark if the button is focused and visible
            } else if (
                (document.activeElement === urlNameInput ||
                    document.activeElement === urlInput) &&
                !addMarkSection.classList.contains("hidden")
            ) {
                addBookmark(); // Directly call addBookmark if an input field is focused and visible
            } else if (activeElement === marksSearchInput) {
                // If on search input and enter is pressed, and there are results, activate the first one
                if (filteredMarksResults.length > 0) {
                    selectedMarkIndex = 0; // Ensure first item is selected for activation
                    activateSelectedMarkItem();
                } else {
                    // No search results, maybe just clear search or do nothing.
                    clearMarksSearchState(); // Clear search on Enter if no results
                }
            } else if (
                selectedMarkIndex !== -1 &&
                document.activeElement.closest(".mark-item")
            ) {
                // If a bookmark item is selected/focused, activate it
                activateSelectedMarkItem();
            }
        } else if (e.key === "/" && !alwaysShowSearchInput) {
            // Only toggle if NOT always visible
            // Trigger search mode on '/'
            e.preventDefault(); // Prevent typing '/'
            if (!isMarksSearchActive) {
                // Only show if not already active
                isMarksSearchActive = true;
                marksSearchContainer.classList.remove("hidden");
            }
            marksSearchInput.focus();
            selectedMarkIndex = -1; // Clear current selection visually
            highlightMarkItem(); // Update highlight
            performMarksSearch(currentMarksSearchQuery); // Re-render with existing (empty) query
        } else if (
            e.key === "/" &&
            alwaysShowSearchInput &&
            activeElement !== marksSearchInput
        ) {
            // If always visible, just focus
            e.preventDefault();
            marksSearchInput.focus();
        } else if (e.key === "K") {
            e.preventDefault();
            moveMarkItem("up");
        } else if (e.key === "J") {
            e.preventDefault();
            moveMarkItem("down");
        } else if ((e.ctrlKey && e.key === "d") || e.key === "d") {
            e.preventDefault();
            removeSelectedMarkItem();
        } else if (e.key === "r" || e.key === "R") { // NEW: Handle 'r' or 'R' key for renaming
            e.preventDefault();
            if (selectedMarkIndex !== -1 && filteredMarksResults.length > 0) {
                startRenamingMark();
            }
        }
    }; /**
     * Attaches keyboard event listeners for the Marks view.
     * Called when the Marks view becomes active.
     */

    const attachMarksListeners = () => {
        document.addEventListener("keydown", marksKeydownHandler); // Initial focus when the Marks view is opened based on visibility settings
        chrome.storage.local.get(
            ["enableMarksAddition", "alwaysShowMarksSearchInput"],
            (result) => {
                const initialEnableMarksAddition = result.enableMarksAddition !== false; // Default to true
                const initialAlwaysShowSearchInput =
                    result.alwaysShowMarksSearchInput === true; // Default to false

                alwaysShowSearchInput = initialAlwaysShowSearchInput; // Sync local state
                // Apply visibility of add section

                window.toggleMarksAddSection(initialEnableMarksAddition); // Apply visibility of search input

                window.toggleMarksSearchInputAlwaysVisible(
                    initialAlwaysShowSearchInput,
                ); // Also sets isMarksSearchActive

                // Check if there's a specific bookmark URL to focus from the background script
                chrome.storage.session.get(INITIAL_MARK_URL_KEY, (sessionResult) => {
                    const urlToFocus = sessionResult[INITIAL_MARK_URL_KEY];
                    if (urlToFocus) {
                        focusBookmarkByUrl(urlToFocus);
                        // Clear the session storage key after using it
                        chrome.storage.session.remove(INITIAL_MARK_URL_KEY);
                    } else {
                        // Determine initial focus if no specific bookmark to focus
                        if (initialAlwaysShowSearchInput) {
                            marksSearchInput.focus();
                        } else if (initialEnableMarksAddition) {
                            addMarkButton.focus(); // Changed from urlNameInput.focus() to addMarkButton.focus() for better UX
                        } else if (bookmarks.length > 0) {
                            const firstMarkItem =
                                marksListContainer.querySelector(".mark-item");
                            if (firstMarkItem) {
                                selectedMarkIndex = 0;
                                firstMarkItem.focus();
                                highlightMarkItem();
                            } else {
                                document.body.focus();
                            }
                        } else {
                            document.body.focus();
                        }
                    }
                });
            },
        );

        selectedMarkIndex = -1; // Reset selected index visually
        editingMarkIndex = -1; // NEW: Reset editing index
        highlightMarkItem(); // Ensure no highlight initially on list
        // clearMarksSearchState() is now conditionally called by toggleMarksSearchInputAlwaysVisible
        // which itself sets initial isMarksSearchActive state
    }; /**
     * Detaches keyboard event listeners for the Marks view.
     * Called when the Marks view becomes inactive.
     */

    const detachMarksListeners = () => {
        document.removeEventListener("keydown", marksKeydownHandler);
        clearMarksSearchState(); // Clear search state when view becomes inactive
        editingMarkIndex = -1; // NEW: Ensure editing mode is reset when leaving the view
        renderBookmarks(); // Re-render to clear any active editing state visually
    }; // Initial load of bookmarks when the initMarksFeature function is called

    await loadBookmarks(); // Add event listener for marks search input

    marksSearchInput.addEventListener("input", () => {
        performMarksSearch(marksSearchInput.value);
    }); // Add a click listener to the document to detect clicks outside the marks container
    // and clear the search if active.

    document.addEventListener("click", (e) => {
        // Check if the click occurred outside the marks-content area AND marks search is active
        // ONLY clear search state if it's NOT in "always visible" mode
        const marksContent = document.querySelector(".marks-content");
        if (
            isMarksSearchActive &&
            marksContent &&
            !marksContent.contains(e.target) &&
            !alwaysShowSearchInput &&
            editingMarkIndex === -1 // NEW: Don't clear search on outside click if editing is active
        ) {
            clearMarksSearchState();
        }
    }); // Expose functions to the global window object for popup.js

    window.refreshMarks = loadBookmarks; // Allow popup.js to refresh the marks list
    window.attachMarksListeners = attachMarksListeners;
    window.detachMarksListeners = detachMarksListeners;
    window.getAllBookmarks = () => bookmarks; // Ensure this is always available after initialization
    // Ensure the addMarkButton's direct click listener is robustly set.

    addMarkButton.addEventListener("click", addBookmark);
};
