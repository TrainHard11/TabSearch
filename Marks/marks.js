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
    const syncBookmarksButton = document.getElementById("syncBookmarksButton"); // NEW: Sync Bookmarks Button
    const marksListContainer = document.getElementById("marksList");
    const noMarksMessage = marksListContainer.querySelector(".no-marks-message");
    const marksSearchContainer = document.getElementById("marksSearchContainer");
    const marksSearchInput = document.getElementById("marksSearchInput");
    const addMarkSection = document.getElementById("addMarkSection");
    const marksContainer = document.querySelector(".marks-container");
    const marksMessageDiv = document.getElementById("marksMessage"); // Get the message div

    if (
        !urlNameInput ||
        !urlInput ||
        !exactMatchCheckbox ||
        !addMarkButton ||
        !syncBookmarksButton || // Ensure new button is found
        !marksListContainer ||
        !marksSearchContainer ||
        !marksSearchInput ||
        !addMarkSection ||
        !marksContainer ||
        !marksMessageDiv // Ensure message div is found
    ) {
        console.error(
            "Marks feature: Essential DOM elements not found after initMarksFeature call.",
        );
        return;
    }

    urlInput.value = defaultUrl;
    urlNameInput.value = defaultTitle;

    const STORAGE_KEY = "fuzzyTabSearch_bookmarks";
    const INITIAL_MARK_URL_KEY = "fuzzyTabSearch_initialMarkUrl";

    let bookmarks = [];
    let selectedMarkIndex = -1;
    let editingMarkIndex = -1;

    let isMarksSearchActive = false;
    let currentMarksSearchQuery = "";
    let filteredMarksResults = [];

    let alwaysShowSearchInput = false;

    /**
     * Highlights the query in the text.
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
    };

    /**
     * Performs a fuzzy search on a given list of items.
     * Items are expected to have 'name' and 'url' properties.
     * Prioritizes name matches over URL matches.
     * @param {Array<Object>} items The array of items (marks) to search within.
     * @param {string} query The search query.
     * @param {string} nameKey The key for the name property (e.g., 'name' for marks).
     * @returns {Array<Object>} The filtered and sorted list of items.
     */
    const fuzzySearchItems = (items, query, nameKey) => {
        if (!query) return items;
        const lowerCaseQuery = query.toLowerCase();
        const queryWords = lowerCaseQuery.split(" ").filter(Boolean);

        const nameMatches = [];
        const urlMatches = [];
        const processedUrls = new Set();

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
    };

    /**
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
    };

    /**
     * Navigates the interactive elements in the Marks view (input fields, add button, search input, bookmark list).
     * This function manages the focus and the `selectedMarkIndex` for the list.
     * @param {string} direction "up" or "down".
     */
    const navigateMarksList = (direction) => {
        if (editingMarkIndex !== -1) {
            return;
        }

        const items = marksListContainer.querySelectorAll(".mark-item");
        let focusableElements = [];

        if (!addMarkSection.classList.contains("hidden")) {
            focusableElements.push(urlNameInput, urlInput, exactMatchCheckbox, addMarkButton, syncBookmarksButton); // Include sync button
        }
        if (alwaysShowSearchInput || isMarksSearchActive) {
            focusableElements.push(marksSearchInput);
        }
        focusableElements.push(...Array.from(items));

        let currentFocusIndex = -1;
        const activeElement = document.activeElement;

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
                newFocusIndex = 0;
            } else {
                newFocusIndex++;
            }
        } else if (direction === "up") {
            if (currentFocusIndex === -1 || currentFocusIndex === 0) {
                newFocusIndex = focusableElements.length - 1;
            } else {
                newFocusIndex--;
            }
        }

        if (newFocusIndex !== -1 && focusableElements[newFocusIndex]) {
            focusableElements[newFocusIndex].focus();

            if (focusableElements[newFocusIndex].classList.contains("mark-item")) {
                selectedMarkIndex = Array.from(items).indexOf(
                    focusableElements[newFocusIndex],
                );
            } else {
                selectedMarkIndex = -1;
            }
        } else {
            selectedMarkIndex = -1;
        }
        highlightMarkItem();
    };

    /**
     * Activates (opens URL) the currently selected bookmark item.
     * It uses window.focusOrCreateTabByUrl (provided by popup.js) to handle opening or switching tabs.
     */
    const activateSelectedMarkItem = () => {
        if (editingMarkIndex !== -1) {
            return;
        }
        if (selectedMarkIndex !== -1 && filteredMarksResults[selectedMarkIndex]) {
            const selectedItem = filteredMarksResults[selectedMarkIndex];
            if (typeof window.focusOrCreateTabByUrl === "function") {
                window.focusOrCreateTabByUrl(selectedItem.url, selectedItem.exactMatch);
            } else {
                console.error(
                    "focusOrCreateTabByUrl is not available. Cannot open bookmark.",
                );
            }
        }
    };

    /**
     * Moves the currently highlighted bookmark up or down in the list.
     * This function is called by keymaps and from the UI up/down buttons.
     * It relies on `selectedMarkIndex` being set correctly before calling.
     * Introduces a visual animation for the moved item.
     * @param {string} direction "up" or "down".
     */
    const moveMarkItem = async (direction) => {
        if (editingMarkIndex !== -1 || isMarksSearchActive) {
            return;
        }

        if (selectedMarkIndex === -1 || bookmarks.length <= 1) {
            return;
        }

        let newIndex = selectedMarkIndex;
        if (direction === "up") {
            if (selectedMarkIndex === 0) {
                return;
            }
            newIndex--;
        } else if (direction === "down") {
            if (selectedMarkIndex === bookmarks.length - 1) {
                return;
            }
            newIndex++;
        }

        if (newIndex !== selectedMarkIndex) {
            const movedItemUrl = bookmarks[selectedMarkIndex].url;

            [bookmarks[selectedMarkIndex], bookmarks[newIndex]] = [
                bookmarks[newIndex],
                bookmarks[selectedMarkIndex],
            ];

            selectedMarkIndex = newIndex;

            await saveBookmarks();
            renderBookmarks();

            const movedElement = marksListContainer.querySelector(
                `.mark-item[data-url="${movedItemUrl}"]`,
            );
            if (movedElement) {
                movedElement.classList.add("moved-highlight");
                setTimeout(() => {
                    movedElement.classList.remove("moved-highlight");
                }, 400);
            }

            const items = marksListContainer.querySelectorAll(".mark-item");
            if (items[selectedMarkIndex]) {
                items[selectedMarkIndex].focus();
            }

            highlightMarkItem();
        }
    };

    /**
     * Loads bookmarks from Chrome's local storage.
     * @returns {Promise<Array>} A promise that resolves with the loaded bookmarks array.
     */
    const loadBookmarks = async () => {
        try {
            const result = await chrome.storage.local.get(STORAGE_KEY);
            bookmarks = Array.isArray(result[STORAGE_KEY])
                ? result[STORAGE_KEY].map((mark) => ({
                    ...mark,
                    exactMatch: mark.exactMatch ?? false,
                    searchableInTabSearch: mark.searchableInTabSearch ?? false,
                }))
                : [];

            if (!isMarksSearchActive || currentMarksSearchQuery === "") {
                filteredMarksResults = [...bookmarks];
            } else {
                performMarksSearch(currentMarksSearchQuery);
            }

            renderBookmarks();
        } catch (error) {
            console.error("Error loading bookmarks:", error);
            bookmarks = [];
            filteredMarksResults = [];
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
     * It uses `filteredMarksResults` if a search is active, otherwise `bookmarks`.
     * It also attaches click listeners for activation, removal, and reordering.
     */
    const renderBookmarks = () => {
        marksListContainer.innerHTML = "";

        if (editingMarkIndex !== -1) {
            marksContainer.classList.add("editing");
        } else {
            marksContainer.classList.remove("editing");
        }

        const listToRender = isMarksSearchActive ? filteredMarksResults : bookmarks;

        if (listToRender.length === 0) {
            if (noMarksMessage) {
                marksListContainer.appendChild(noMarksMessage);
                noMarksMessage.classList.remove("hidden");
            } else {
                const msg = document.createElement("p");
                msg.classList.add("no-marks-message");
                msg.textContent = isMarksSearchActive
                    ? "No matching bookmarks found."
                    : "No bookmarks added yet.";
                marksListContainer.appendChild(msg);
            }
            selectedMarkIndex = -1;
            return;
        } else {
            if (noMarksMessage) {
                noMarksMessage.classList.add("hidden");
            }
        }

        listToRender.forEach((mark, index) => {
            const markItem = document.createElement("div");
            markItem.classList.add("mark-item");
            markItem.dataset.index = index;
            markItem.dataset.url = mark.url;
            markItem.tabIndex = 0;

            if (index === selectedMarkIndex) {
                markItem.classList.add("selected");
            }
            if (index === editingMarkIndex) {
                markItem.classList.add("editing");
            }


            const markInfo = document.createElement("div");
            markInfo.classList.add("mark-info");

            if (index === editingMarkIndex) {
                const renameInput = document.createElement("input");
                renameInput.type = "text";
                renameInput.classList.add("marks-input", "marks-rename-input");
                renameInput.value = mark.name || "";
                renameInput.id = "markRenameInput";
                renameInput.setAttribute("aria-label", `Rename bookmark "${mark.name}"`);

                renameInput.addEventListener("blur", () => {
                    if (editingMarkIndex === index) {
                        finishRenamingMark(renameInput.value);
                    }
                });
                renameInput.addEventListener("keydown", (e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                        e.preventDefault();
                        finishRenamingMark(renameInput.value);
                    } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelRenamingMark();
                    }
                });

                markInfo.appendChild(renameInput);
            } else {
                const markName = document.createElement("span");
                markName.classList.add("mark-name");
                markName.innerHTML = highlightText(
                    mark.name || "",
                    currentMarksSearchQuery,
                );
                markInfo.appendChild(markName);
            }


            const markUrl = document.createElement("a");
            markUrl.classList.add("mark-url");
            markUrl.href = mark.url;
            markUrl.innerHTML = highlightText(
                mark.url || "",
                currentMarksSearchQuery,
            );
            markUrl.target = "_blank";
            markUrl.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
            });

            const exactMatchStatus = document.createElement("span");
            exactMatchStatus.classList.add("exact-match-status");
            exactMatchStatus.textContent = mark.exactMatch ? " [Exact Match]" : "";
            exactMatchStatus.style.fontWeight = "bold";
            exactMatchStatus.style.color = mark.exactMatch ? "#98c379" : "#a0a0a0";

            if (index !== editingMarkIndex) {
                markInfo.appendChild(markUrl);
                markInfo.appendChild(exactMatchStatus);
            }

            const searchableCheckboxContainer = document.createElement("div");
            searchableCheckboxContainer.classList.add(
                "searchable-checkbox-container",
            );

            const searchableCheckbox = document.createElement("input");
            searchableCheckbox.type = "checkbox";
            searchableCheckbox.id = `searchable-${mark.url.replace(/[^a-zA-Z0-9]/g, "")}-${index}`;
            searchableCheckbox.classList.add("marks-checkbox");
            searchableCheckbox.checked = mark.searchableInTabSearch;
            searchableCheckbox.title = "Include in Tab Search";
            searchableCheckbox.setAttribute("aria-label", "Include in Tab Search");
            searchableCheckbox.addEventListener("change", async (e) => {
                e.stopPropagation();
                const originalMarkIndex = bookmarks.findIndex(
                    (b) => b.url === mark.url && b.name === mark.name,
                );
                if (originalMarkIndex > -1) {
                    bookmarks[originalMarkIndex].searchableInTabSearch = e.target.checked;
                    await saveBookmarks();
                }
            });
            searchableCheckbox.addEventListener("click", (e) => {
                e.stopPropagation();
            });

            const searchableLabel = document.createElement("label");
            searchableLabel.htmlFor = searchableCheckbox.id;
            searchableLabel.textContent = "Tab Search";
            searchableLabel.classList.add("checkbox-label");
            searchableLabel.addEventListener("click", (e) => {
                e.stopPropagation();
            });

            searchableCheckboxContainer.appendChild(searchableCheckbox);
            searchableCheckboxContainer.appendChild(searchableLabel);

            const actionButtonsContainer = document.createElement("div");
            actionButtonsContainer.classList.add("marks-action-buttons");

            const upButton = document.createElement("button");
            upButton.classList.add("marks-move-button", "marks-move-up");
            upButton.innerHTML = "&#9650;";
            upButton.title = "Move Up";
            upButton.setAttribute("aria-label", "Move Bookmark Up");
            upButton.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (editingMarkIndex !== -1) return;

                selectedMarkIndex = index;
                highlightMarkItem();
                await moveMarkItem("up");
            });
            actionButtonsContainer.appendChild(upButton);

            const downButton = document.createElement("button");
            downButton.classList.add("marks-move-button", "marks-move-down");
            downButton.innerHTML = "&#9660;";
            downButton.title = "Move Down";
            downButton.setAttribute("aria-label", "Move Bookmark Down");
            downButton.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (editingMarkIndex !== -1) return;

                selectedMarkIndex = index;
                highlightMarkItem();
                await moveMarkItem("down");
            });
            actionButtonsContainer.appendChild(downButton);

            const removeButton = document.createElement("button");
            removeButton.classList.add("remove-mark-button");
            removeButton.innerHTML = "✕";
            removeButton.title = "Remove Bookmark";
            removeButton.setAttribute("aria-label", "Remove Bookmark");
            removeButton.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (editingMarkIndex !== -1) return;

                await removeBookmark(index);
                if (selectedMarkIndex >= filteredMarksResults.length) {
                    selectedMarkIndex =
                        filteredMarksResults.length > 0
                            ? filteredMarksResults.length - 1
                            : -1;
                }
                highlightMarkItem();
            });
            actionButtonsContainer.appendChild(removeButton);

            markItem.appendChild(markInfo);
            markItem.appendChild(searchableCheckboxContainer);
            markItem.appendChild(actionButtonsContainer);

            markItem.addEventListener("click", () => {
                if (editingMarkIndex !== -1) return;

                selectedMarkIndex = index;
                highlightMarkItem();
                activateSelectedMarkItem();
            });

            marksListContainer.appendChild(markItem);
        });

        if (selectedMarkIndex >= listToRender.length) {
            selectedMarkIndex =
                listToRender.length > 0 ? listToRender.length - 1 : -1;
        }
        highlightMarkItem();

        if (editingMarkIndex !== -1) {
            const renameInput = document.getElementById("markRenameInput");
            if (renameInput) {
                renameInput.focus();
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
            renderBookmarks();
            const items = marksListContainer.querySelectorAll(".mark-item");
            if (items[selectedMarkIndex]) {
                items[selectedMarkIndex].focus();
            }
        } else {
            console.warn(
                "Bookmark to focus not found in the current list:",
                urlToFocus,
            );
        }
    };

    /**
     * Adds a new bookmark to the list.
     */
    const addBookmark = async () => {
        if (editingMarkIndex !== -1) {
            return;
        }

        const name = urlNameInput.value.trim();
        let url = urlInput.value.trim();
        const exactMatch = exactMatchCheckbox.checked;

        urlNameInput.classList.remove("input-error");
        urlInput.classList.remove("input-error");

        if (!name || !url) {
            if (!name) {
                urlNameInput.classList.add("input-error");
            }
            if (!url) {
                urlInput.classList.add("input-error");
            }
            return;
        }

        const existingMarkByUrl = bookmarks.find((mark) => mark.url === url);
        if (existingMarkByUrl) {
            urlInput.classList.add("input-error");
            focusBookmarkByUrl(url);
            return;
        }

        const existingMarkByName = bookmarks.find(
            (mark) => mark.name.toLowerCase() === name.toLowerCase(),
        );
        if (existingMarkByName) {
            urlNameInput.classList.add("input-error");
            focusBookmarkByUrl(existingMarkByName.url);
            return;
        }

        bookmarks.push({ name, url, exactMatch, searchableInTabSearch: false });
        await saveBookmarks();

        urlNameInput.value = "";
        urlInput.value = "";
        exactMatchCheckbox.checked = false;

        clearMarksSearchState();
        urlNameInput.focus();
        selectedMarkIndex = -1;
        highlightMarkItem();
    };

    /**
     * Removes a bookmark from the list by its index.
     * Note: This index is the *displayed* index (from filteredMarksResults).
     * We need to find the original index in `bookmarks` to remove it.
     * @param {number} displayedIndex The index of the bookmark to remove from the currently displayed list.
     */
    const removeBookmark = async (displayedIndex) => {
        if (editingMarkIndex !== -1) {
            return;
        }

        if (displayedIndex > -1 && displayedIndex < filteredMarksResults.length) {
            const markToRemove = filteredMarksResults[displayedIndex];
            const originalIndex = bookmarks.findIndex(
                (mark) =>
                    mark.url === markToRemove.url &&
                    mark.name === markToRemove.name &&
                    mark.exactMatch === markToRemove.exactMatch &&
                    mark.searchableInTabSearch === markToRemove.searchableInTabSearch,
            );

            if (originalIndex > -1) {
                bookmarks.splice(originalIndex, 1);
                await saveBookmarks();
                if (isMarksSearchActive) {
                    performMarksSearch(currentMarksSearchQuery);
                } else {
                    filteredMarksResults = [...bookmarks];
                    renderBookmarks();
                }
            }
        }
    };

    /**
     * Removes the currently selected bookmark item from the list permanently.
     */
    const removeSelectedMarkItem = async () => {
        if (editingMarkIndex !== -1) {
            return;
        }

        if (selectedMarkIndex !== -1 && filteredMarksResults[selectedMarkIndex]) {
            const indexToRemove = selectedMarkIndex;
            await removeBookmark(indexToRemove);

            if (filteredMarksResults.length === 0) {
                selectedMarkIndex = -1;
            } else if (indexToRemove < filteredMarksResults.length) {
                selectedMarkIndex = indexToRemove;
            } else {
                selectedMarkIndex = filteredMarksResults.length - 1;
            }
            selectedMarkIndex = Math.max(-1, selectedMarkIndex);

            highlightMarkItem();
        }
    };

    /**
     * Performs a search on the bookmarks and updates the displayed list.
     * @param {string} query The search query.
     */
    const performMarksSearch = (query) => {
        currentMarksSearchQuery = query.trim();
        if (currentMarksSearchQuery === "") {
            filteredMarksResults = [...bookmarks];
        } else {
            filteredMarksResults = fuzzySearchItems(
                bookmarks,
                currentMarksSearchQuery,
                "name",
            );
        }
        selectedMarkIndex = filteredMarksResults.length > 0 ? 0 : -1;
        renderBookmarks();
        highlightMarkItem();
    };

    /**
     * Clears the Marks search state and reverts the list to its full, unfiltered state.
     * Note: This will not hide the search input if `alwaysShowSearchInput` is true.
     */
    const clearMarksSearchState = () => {
        isMarksSearchActive = false;
        currentMarksSearchQuery = "";
        marksSearchInput.value = "";
        if (!alwaysShowSearchInput) {
            marksSearchContainer.classList.add("hidden");
        }
        filteredMarksResults = [...bookmarks];
        selectedMarkIndex = -1;
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
                if (editingMarkIndex === -1) {
                    urlNameInput.focus();
                }
            } else {
                addMarkSection.classList.add("hidden");
                if (alwaysShowSearchInput || isMarksSearchActive) {
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
    };

    /**
     * Toggles the persistent visibility of the marks search input.
     * This function is called from popup.js when the setting changes.
     * @param {boolean} shouldBeAlwaysVisible True to always show, false to revert to toggle behavior.
     */
    window.toggleMarksSearchInputAlwaysVisible = (shouldBeAlwaysVisible) => {
        alwaysShowSearchInput = shouldBeAlwaysVisible;
        if (marksSearchContainer) {
            if (alwaysShowSearchInput) {
                marksSearchContainer.classList.remove("hidden");
                isMarksSearchActive = true;
                marksSearchInput.focus();
            } else {
                if (currentMarksSearchQuery === "") {
                    marksSearchContainer.classList.add("hidden");
                    isMarksSearchActive = false;
                }
            }
        }
    };

    /**
     * Initiates the renaming process for the currently selected bookmark.
     * It sets `editingMarkIndex` and re-renders to show the input field.
     */
    const startRenamingMark = () => {
        if (selectedMarkIndex !== -1 && editingMarkIndex === -1) {
            editingMarkIndex = selectedMarkIndex;
            renderBookmarks();
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
                const isDuplicate = bookmarks.some(
                    (mark, idx) =>
                        idx !== originalIndex &&
                        mark.name.toLowerCase() === trimmedNewName.toLowerCase(),
                );

                if (isDuplicate) {
                    console.warn("Bookmark with this name already exists.");
                    const renameInput = document.getElementById("markRenameInput");
                    if (renameInput) {
                        renameInput.classList.add("input-error");
                    }
                    return;
                }

                bookmarks[originalIndex].name = trimmedNewName;
                await saveBookmarks();
            } else if (!trimmedNewName && originalIndex > -1) {
                console.warn("Bookmark name cannot be empty. Reverting.");
                const renameInput = document.getElementById("markRenameInput");
                if (renameInput) {
                    renameInput.classList.add("input-error");
                }
                return;
            }

            editingMarkIndex = -1;
            if (isMarksSearchActive) {
                performMarksSearch(currentMarksSearchQuery);
            } else {
                filteredMarksResults = [...bookmarks];
                renderBookmarks();
            }

            const items = marksListContainer.querySelectorAll(".mark-item");
            if (selectedMarkIndex !== -1 && items[selectedMarkIndex]) {
                items[selectedMarkIndex].focus();
            } else if (marksSearchInput && !marksSearchInput.classList.contains('hidden')) {
                marksSearchInput.focus();
            } else if (urlNameInput && !urlNameInput.classList.contains('hidden')) {
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
            editingMarkIndex = -1;
            if (isMarksSearchActive) {
                performMarksSearch(currentMarksSearchQuery);
            } else {
                filteredMarksResults = [...bookmarks];
                renderBookmarks();
            }

            const items = marksListContainer.querySelectorAll(".mark-item");
            if (selectedMarkIndex !== -1 && items[selectedMarkIndex]) {
                items[selectedMarkIndex].focus();
            } else if (marksSearchInput && !marksSearchInput.classList.contains('hidden')) {
                marksSearchInput.focus();
            } else if (urlNameInput && !urlNameInput.classList.contains('hidden')) {
                urlNameInput.focus();
            } else {
                document.body.focus();
            }
        }
    };

    /**
     * NEW: Displays a temporary message in the marks view.
     * @param {string} message The message to display.
     * @param {string} type The type of message ("success", "error", or "info").
     */
    const displayMarksMessage = (message, type) => {
        if (marksMessageDiv) {
            marksMessageDiv.textContent = message;
            marksMessageDiv.className = `marks-message show ${type}`; // Add show and type classes

            // Clear any existing timeout to prevent multiple messages from conflicting
            if (marksMessageDiv._timeoutId) {
                clearTimeout(marksMessageDiv._timeoutId);
            }

            // Hide the message after 3 seconds
            marksMessageDiv._timeoutId = setTimeout(() => {
                marksMessageDiv.classList.remove("show");
                // Reset to ensure proper re-display if same type message occurs
                marksMessageDiv.classList.remove("success", "error", "info");
            }, 3000);
        }
    };

    /**
     * NEW: Function to recursively process bookmark tree nodes from the browser.
     * It identifies actual bookmarks and adds unique ones to a collection.
     * @param {chrome.bookmarks.BookmarkTreeNode} node The current bookmark node to process.
     * @param {Set<string>} existingUrls A set of URLs already present in the extension's bookmarks (normalized).
     * @param {Array<Object>} newBookmarksToAdd An array to collect newly found unique bookmarks.
     */
    const processBrowserBookmarkNode = (node, existingUrls, newBookmarksToAdd) => {
        if (node.url) { // It's a bookmark (has a URL)
            // Normalize URL by removing trailing slash for consistent comparison
            const normalizedUrl = node.url.endsWith('/') ? node.url.slice(0, -1) : node.url;
            if (!existingUrls.has(normalizedUrl)) {
                // If this URL is not already in our extension's bookmarks, add it
                newBookmarksToAdd.push({
                    name: node.title || new URL(node.url).hostname, // Use hostname if title is empty
                    url: node.url,
                    exactMatch: false, // Default to false as requested
                    searchableInTabSearch: false // Default to false as requested
                });
                existingUrls.add(normalizedUrl); // Add to the set to prevent duplicates from this import batch
            }
        }
        if (node.children) { // It's a folder (has children)
            for (const child of node.children) {
                processBrowserBookmarkNode(child, existingUrls, newBookmarksToAdd);
            }
        }
    };

    /**
     * NEW: Fetches all browser bookmarks and adds unique ones to the extension's list.
     */
    const syncBrowserBookmarks = async () => {
        console.log("--- Starting Browser Bookmark Sync ---");
        displayMarksMessage("Syncing browser bookmarks...", "info");

        const newBookmarksToAdd = [];
        // Create a Set of existing bookmark URLs from the extension's current list for efficient lookup
        // Normalize URLs to handle trailing slashes consistently
        const existingExtensionBookmarkUrls = new Set(
            bookmarks.map(b => b.url.endsWith('/') ? b.url.slice(0, -1) : b.url)
        );

        try {
            const bookmarkTreeNodes = await chrome.bookmarks.getTree();
            for (const node of bookmarkTreeNodes) {
                processBrowserBookmarkNode(node, existingExtensionBookmarkUrls, newBookmarksToAdd);
            }

            if (newBookmarksToAdd.length > 0) {
                // Add new bookmarks to the main 'bookmarks' array
                bookmarks.push(...newBookmarksToAdd);
                await saveBookmarks();
                renderBookmarks(); // Re-render the list to show new bookmarks
                displayMarksMessage(`Added ${newBookmarksToAdd.length} new bookmark(s) from browser.`, "success");
            } else {
                displayMarksMessage("No new bookmarks found in browser.", "info");
            }
            console.log("--- Browser Bookmark Sync Complete ---");
        } catch (error) {
            console.error("Error syncing browser bookmarks:", error);
            displayMarksMessage("Error syncing browser bookmarks. Check console for details.", "error");
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

        if (editingMarkIndex !== -1) {
            const renameInput = document.getElementById("markRenameInput");
            if (activeElement === renameInput) {
                if (e.key === "Enter" || e.key === "Escape") {
                    return;
                }
                return;
            }
        }

        if (
            !e.altKey &&
            (activeElement === urlNameInput ||
                activeElement === urlInput ||
                activeElement === marksSearchInput)
        ) {
            if (e.key === "j" || e.key === "k") {
                return;
            }
        }

        if (editingMarkIndex !== -1 && e.key !== "Escape") {
            e.preventDefault();
            return;
        }


        if (e.key === "ArrowDown" || e.key === "j" || (e.altKey && e.key === "j")) {
            e.preventDefault();
            navigateMarksList("down");
        } else if (
            e.key === "ArrowUp" ||
            e.key === "k" ||
            (e.altKey && e.key === "k")
        ) {
            e.preventDefault();
            navigateMarksList("up");
        } else if (e.key === "Enter") {
            e.preventDefault();

            if (
                document.activeElement === addMarkButton &&
                !addMarkSection.classList.contains("hidden")
            ) {
                addBookmark();
            } else if (document.activeElement === syncBookmarksButton) { // NEW: Handle Enter on Sync Button
                syncBrowserBookmarks();
            }
            else if (
                (document.activeElement === urlNameInput ||
                    document.activeElement === urlInput) &&
                !addMarkSection.classList.contains("hidden")
            ) {
                addBookmark();
            } else if (activeElement === marksSearchInput) {
                if (filteredMarksResults.length > 0) {
                    selectedMarkIndex = 0;
                    activateSelectedMarkItem();
                } else {
                    clearMarksSearchState();
                }
            } else if (
                selectedMarkIndex !== -1 &&
                document.activeElement.closest(".mark-item")
            ) {
                activateSelectedMarkItem();
            }
        } else if (e.key === "/" && !alwaysShowSearchInput) {
            e.preventDefault();
            if (!isMarksSearchActive) {
                isMarksSearchActive = true;
                marksSearchContainer.classList.remove("hidden");
            }
            marksSearchInput.focus();
            selectedMarkIndex = -1;
            highlightMarkItem();
            performMarksSearch(currentMarksSearchQuery);
        } else if (
            e.key === "/" &&
            alwaysShowSearchInput &&
            activeElement !== marksSearchInput
        ) {
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
        } else if (e.key === "r" || e.key === "R") {
            e.preventDefault();
            if (selectedMarkIndex !== -1 && filteredMarksResults.length > 0) {
                startRenamingMark();
            }
        }
    };

    /**
     * Attaches keyboard event listeners for the Marks view.
     * Called when the Marks view becomes active.
     */
    const attachMarksListeners = () => {
        document.addEventListener("keydown", marksKeydownHandler);
        chrome.storage.local.get(
            ["enableMarksAddition", "alwaysShowMarksSearchInput"],
            (result) => {
                const initialEnableMarksAddition = result.enableMarksAddition !== false;
                const initialAlwaysShowSearchInput =
                    result.alwaysShowMarksSearchInput === true;

                alwaysShowSearchInput = initialAlwaysShowSearchInput;

                window.toggleMarksAddSection(initialEnableMarksAddition);

                window.toggleMarksSearchInputAlwaysVisible(
                    initialAlwaysShowSearchInput,
                );

                chrome.storage.session.get(INITIAL_MARK_URL_KEY, (sessionResult) => {
                    const urlToFocus = sessionResult[INITIAL_MARK_URL_KEY];
                    if (urlToFocus) {
                        focusBookmarkByUrl(urlToFocus);
                        chrome.storage.session.remove(INITIAL_MARK_URL_KEY);
                    } else {
                        if (initialAlwaysShowSearchInput) {
                            marksSearchInput.focus();
                        } else if (initialEnableMarksAddition) {
                            addMarkButton.focus();
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

        selectedMarkIndex = -1;
        editingMarkIndex = -1;
        highlightMarkItem();
    };

    /**
     * Detaches keyboard event listeners for the Marks view.
     * Called when the Marks view becomes inactive.
     */
    const detachMarksListeners = () => {
        document.removeEventListener("keydown", marksKeydownHandler);
        clearMarksSearchState();
        editingMarkIndex = -1;
        renderBookmarks();
    };

    await loadBookmarks();

    marksSearchInput.addEventListener("input", () => {
        performMarksSearch(marksSearchInput.value);
    });

    document.addEventListener("click", (e) => {
        const marksContent = document.querySelector(".marks-content");
        if (
            isMarksSearchActive &&
            marksContent &&
            !marksContent.contains(e.target) &&
            !alwaysShowSearchInput &&
            editingMarkIndex === -1
        ) {
            clearMarksSearchState();
        }
    });

    // NEW: Attach click listener for the Sync Bookmarks button
    syncBookmarksButton.addEventListener("click", syncBrowserBookmarks);

    window.refreshMarks = loadBookmarks;
    window.attachMarksListeners = attachMarksListeners;
    window.detachMarksListeners = detachMarksListeners;
    window.getAllBookmarks = () => bookmarks;

    addMarkButton.addEventListener("click", addBookmark);
};
