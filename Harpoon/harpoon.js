// Define a global initialization function that popup.js can call
// AFTER the harpoon.html content is loaded into the DOM.
window.initHarpoonFeature = async () => {
	// DOM Element References
	const harpoonListContainer = document.getElementById("harpoonList");
	const noHarpoonedMessage = harpoonListContainer.querySelector(".no-harpooned-message");

	if (!harpoonListContainer) {
		console.error("Harpoon feature: Essential DOM elements not found after initHarpoonFeature call.");
		return;
	}

	let selectedHarpoonIndex = -1;
	let harpoonedTabs = [];

	const LS_HARPOONED_TABS_KEY = "fuzzyTabSearch_harpoonedTabs";

	/**
	 * Highlights the currently selected item in the harpoon list.
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
			} catch (error) {
				console.error("Error activating harpooned tab:", error);
			}
		}
	};

	/**
	 * Moves the currently highlighted harpooned tab up or down in the list (non-cycling).
	 * This function is called by keymaps and from the UI up/down buttons
	 * It relies on `selectedHarpoonIndex` being set correctly before calling.
	 * @param {string} direction "up" or "down".
	 */
	const moveHarpoonItem = async (direction) => {
		if (selectedHarpoonIndex === -1 || harpoonedTabs.length <= 1) {
			return; // Nothing to move or only one item
		}

		let newIndex = selectedHarpoonIndex;
		if (direction === "up") {
			if (selectedHarpoonIndex === 0) {
				return; // Cannot move up from the first position
			}
			newIndex--;
		} else if (direction === "down") {
			if (selectedHarpoonIndex === harpoonedTabs.length - 1) {
				return; // Cannot move down from the last position
			}
			newIndex++;
		}

		// Only perform move if the index actually changes
		if (newIndex !== selectedHarpoonIndex) {

			const [movedItem] = harpoonedTabs.splice(selectedHarpoonIndex, 1);
			harpoonedTabs.splice(newIndex, 0, movedItem);

			selectedHarpoonIndex = newIndex;

			await saveHarpoonedTabs();
			renderHarpoonedTabs();
			highlightHarpoonItem();
		}
	};

	/**
	 * Saves the current list of harpooned tabs to chrome.storage.local.
	 */
	const saveHarpoonedTabs = async () => {
		try {
			await chrome.storage.local.set({ [LS_HARPOONED_TABS_KEY]: harpoonedTabs });
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
		harpoonedTabs = await loadHarpoonedTabsFromStorage();
		renderHarpoonedTabs();
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
			favicon.src = harpoonedTab.favIconUrl || chrome.runtime.getURL("img/icon.png"); // Fallback icon

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

			const actionButtonsContainer = document.createElement("div");
			actionButtonsContainer.classList.add("harpoon-action-buttons");

			// Up button
			const upButton = document.createElement("button");
			upButton.classList.add("harpoon-move-button", "harpoon-move-up");
			upButton.innerHTML = '&#9650;'; // Up arrow character
			upButton.title = "Move Up";
			upButton.addEventListener("click", async (e) => {
				e.stopPropagation();
				selectedHarpoonIndex = index;
				highlightHarpoonItem();
				await moveHarpoonItem("up");
			});
			actionButtonsContainer.appendChild(upButton);

			// Down button
			const downButton = document.createElement("button");
			downButton.classList.add("harpoon-move-button", "harpoon-move-down");
			downButton.innerHTML = '&#9660;'; // Down arrow character
			downButton.title = "Move Down";
			downButton.addEventListener("click", async (e) => {
				e.stopPropagation();
				selectedHarpoonIndex = index;
				highlightHarpoonItem();
				await moveHarpoonItem("down");
			});
			actionButtonsContainer.appendChild(downButton);

			// Remove button
			const removeButton = document.createElement("button");
			removeButton.classList.add("remove-harpoon-button");
			removeButton.innerHTML = '✕'; // X icon
			removeButton.title = "Remove Harpooned Tab";
			removeButton.addEventListener("click", async (e) => {
				e.stopPropagation();
				await removeHarpoonedTabFromList(harpoonedTab.url);
				// After removal, adjust selected index if necessary
				if (selectedHarpoonIndex >= harpoonedTabs.length) {
					selectedHarpoonIndex = harpoonedTabs.length > 0 ? harpoonedTabs.length - 1 : -1;
				}
				highlightHarpoonItem();
			});
			actionButtonsContainer.appendChild(removeButton);


			harpoonItem.appendChild(favicon);
			harpoonItem.appendChild(harpoonInfo);
			harpoonItem.appendChild(actionButtonsContainer);

			harpoonItem.addEventListener("click", () => {
				selectedHarpoonIndex = index; // Update selected index on click
				highlightHarpoonItem();
				activateSelectedHarpoonItem();
			});

			harpoonListContainer.appendChild(harpoonItem);
		});
	};

	/**
	 * Removes a harpooned tab from the list by updating chrome.storage.local directly.
	 * This will also trigger a re-render.
	 * @param {string} urlToRemove The URL of the tab to remove.
	 */
	const removeHarpoonedTabFromList = async (urlToRemove) => {
		harpoonedTabs = harpoonedTabs.filter(tab => tab.url !== urlToRemove);
		await saveHarpoonedTabs();
		renderHarpoonedTabs();
	};

	/**
	 * Removes the currently selected harpooned item from the list permanently.
	 */
	const removeSelectedHarpoonItem = async () => {
		if (selectedHarpoonIndex !== -1 && harpoonedTabs[selectedHarpoonIndex]) {
			const urlToRemove = harpoonedTabs[selectedHarpoonIndex].url;
			const oldSelectedIndex = selectedHarpoonIndex;

			await removeHarpoonedTabFromList(urlToRemove);
			if (harpoonedTabs.length === 0) {
				selectedHarpoonIndex = -1;
			} else if (oldSelectedIndex < harpoonedTabs.length) {
				selectedHarpoonIndex = oldSelectedIndex;
			} else {
				selectedHarpoonIndex = harpoonedTabs.length - 1;
			}
			selectedHarpoonIndex = Math.max(-1, selectedHarpoonIndex); // Ensure it's not less than -1

			highlightHarpoonItem();
		} 
	};

	// Initial load of harpooned tabs when the initHarpoonFeature function is called
	await loadHarpoonedTabs();

	// Expose functions to the global window object for popup.js 
	window.refreshHarpoonedTabs = loadHarpoonedTabs;
	window.navigateHarpoonList = navigateHarpoonList;
	window.activateSelectedHarpoonItem = activateSelectedHarpoonItem;
	window.moveHarpoonItem = moveHarpoonItem;
	window.removeSelectedHarpoonItem = removeSelectedHarpoonItem;
};
