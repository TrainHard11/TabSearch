# Fuzzy Tab & Search Navigator

The "Fuzzy Tab & Search Navigator" is a powerful browser extension designed to streamline your tab management and browsing experience. It provides quick access to your open tabs, custom bookmarks, and essential browser functions through intuitive fuzzy search and a rich set of keyboard shortcuts and global commands.

## ✨ Features

This extension offers a comprehensive set of tools to enhance your productivity:

* **Unified Quick Search**: A single search bar to instantly find and switch between any of your open browser tabs across all windows, or access your custom bookmarks.

* **Intelligent Fuzzy Matching**: Search by tab title, bookmark name, or URL, with a smart fuzzy search algorithm that prioritizes relevant results.

* **Tab & Window Management**:

    * Switch to existing tabs or open bookmarks.

    * Move the active tab to any open window or a new window.

    * Reposition tabs within their current window.

    * Close individual tabs or all filtered tabs.

    * Close entire browser windows.

* **Custom Bookmarks (Marks)**:

    * Manage and search through user-defined bookmarks.

    * Sync with browser's existing bookmarks.

    * Add new bookmarks directly from the popup or via a global command.

    * Mark specific bookmarks as searchable in the main Quick Search view.

* **Harpoon View for High-Priority Tabs**:

    * Quickly "harpoon" (pin) up to four frequently used tabs to numbered slots for instant access.

    * Session-focused, allowing you to jump to critical tabs regardless of their current position.

    * Ability to save and load different sets of harpooned tabs (Work & Fun lists).

* **Configurable Settings**: Customize behaviors like Google search on no results, inclusion of bookmarks in tab search, and custom quick tabs.

* **Global Commands**: Assign custom keyboard shortcuts to powerful actions that can be triggered from anywhere in your browser.

## 🚀 Installation & Usage

1.  **Download/Clone**: Obtain the extension's files.

2.  **Load Unpacked**:

    * Open your browser's Extensions page (e.g., `chrome://extensions` for Chrome, `about:addons` for Firefox).

    * Enable "Developer mode" (usually a toggle in the top-right).

    * Click "Load unpacked" (Chrome) or "Load Temporary Add-on" (Firefox for testing) and select the extension's root directory.

3.  **Pin to Toolbar (Optional)**: For easy access, pin the extension icon to your browser's toolbar.

4.  **Launch**: Click the extension icon or use your assigned global shortcut (e.g., `Ctrl+Space`).

## ⌨️ Keymaps & Commands

The extension offers various views, each with specific keymaps, and a set of global commands configurable through your browser's extension shortcuts page.

### Quick Search View

This is your primary view for fast tab and bookmark navigation.

* <kbd>ArrowDown</kbd>: Move selection down.

* <kbd>ArrowUp</kbd>: Move selection up.

* <kbd>Enter</kbd>:

    * Switch to the selected tab.

    * Open the selected bookmark (in a new tab or switch if already open).

    * If no results and a query exists: Search Google (if enabled in settings).

* <kbd>Delete</kbd> or <kbd>Ctrl + D</kbd>: Close the currently highlighted tab (does not apply to bookmarks).

* <kbd>Ctrl + Shift + D</kbd>: Close all currently filtered tabs (does not apply to bookmarks).

* <kbd>Ctrl + 1</kbd> to <kbd>Ctrl + 4</kbd>: Move the highlighted tab or open the highlighted bookmark in the current window at positions 1-4 respectively.

### Settings View

Customize extension behavior.

* <kbd>F1</kbd>: Toggle Settings View.

* <kbd>F6</kbd>: Open Browser Extension shortcut assignment menu. If the shortcuts page is already open, it will switch to that tab; otherwise, it will open a new one.

#### Related Global Commands (Configurable in Browser Settings):

* <span class="command-name">Custom_Tab_1</span>: Opens or switches to the URL configured for "Custom Tab 1".

* <span class="command-name">Custom_Tab_2</span>: Opens or switches to the URL configured for "Custom Tab 2".

* <span class="command-name">Custom_Tab_3</span>: Opens or switches to the URL configured for "Custom Tab 3".

* <span class="command-name">Custom_Tab_4</span>: Opens or switches to the URL configured for "Custom Tab 4".

* <span class="command-name">Custom_Tab_5</span>: Opens or switches to the URL configured for "Custom Tab 5".

* <span class="command-name">Custom_Tab_6</span>: Opens or switches to the URL configured for "Custom Tab 6".

* <span class="command-name">Custom_Tab_7</span>: Opens or switches to the URL configured for "Custom Tab 7".

### Bookmarks View

Manage and search your custom bookmarks.

* <kbd>F2</kbd>: Toggle the Marks (Bookmarks) View.

* <kbd>/</kbd>: Focus the search bar to filter bookmarks by name or URL.

* <kbd>ArrowUp</kbd> / <kbd>ArrowDown</kbd>, <kbd>Ctrl+K</kbd> / <kbd>Ctrl+J</kbd>, or <kbd>K</kbd> / <kbd>J</kbd> (when focused): Move selection up or down the bookmark list.

* <kbd>Shift+K</kbd> / <kbd>Shift+J</kbd> (or <kbd>K</kbd> / <kbd>J</kbd> with Shift): Move the selected bookmark up or down in the list order.

* <kbd>Enter</kbd>: Open the selected bookmark (in a new tab or switch to it if already open).

* <kbd>Delete</kbd>, <kbd>D</kbd> (when focused), or <kbd>Ctrl+D</kbd>: Delete the selected bookmark.

#### Related Global Commands (Configurable in Browser Settings):

* <span class="command-name">Bookmarks_open</span>: Directly opens the Marks (Bookmarks) view when the extension popup is launched via this command.

* <span class="command-name">Bookmark_add</span>: Adds the currently active browser tab as a new bookmark.

### Harpoon View

For rapid navigation between high-priority tabs.

* <kbd>F3</kbd>: Toggle Harpoon View.

* <kbd>J</kbd> / <kbd>K</kbd> or <kbd>ArrowDown</kbd> / <kbd>ArrowUp</kbd>: Navigate the Harpoon list.

* <kbd>Shift+J</kbd> / <kbd>Shift+K</kbd>: Move selected item down or up in the list.

* <kbd>Enter</kbd>: Open the selected tab or switch to it if already open.

* <kbd>D</kbd>, <kbd>Ctrl+D</kbd>, or <kbd>Delete</kbd>: Remove the selected item.

* <kbd>Ctrl+T</kbd>: Open full Harpoon view (includes Work & Fun lists).

* <kbd>Ctrl+1</kbd> (in full view): Load the Work list into the main Harpoon list.

* <kbd>Ctrl+2</kbd> (in full view): Load the Fun list into the main Harpoon list.

* <kbd>Ctrl+Alt+1</kbd>: Save current Harpoon list as the new Work list.

* <kbd>Ctrl+Alt+2</kbd>: Save current Harpoon list as the new Fun list.

#### Related Global Commands (Configurable in Browser Settings):

* <span class="command-name">Harpoon_open</span>: Directly opens the Harpoon view when the extension popup is launched via this command.

* <span class="command-name">Harpoon_add</span>: Adds the currently active tab to your Harpoon list.

* <span class="command-name">Harpoon_1</span>: Activates (switches to) the first harpooned tab.

* <span class="command-name">Harpoon_2</span>: Activates (switches to) the second harpooned tab.

* <span class="command-name">Harpoon_3</span>: Activates (switches to) the third harpooned tab.

* <span class="command-name">Harpoon_4</span>: Activates (switches to) the fourth harpooned tab.

### Tab Management View

Gain full control over your open tabs and browser windows.

* <kbd>F4</kbd>: Toggle Tab Management View.

* <kbd>Enter</kbd>: Move the active tab to the selected browser instance (or open a new one).

* <kbd>Ctrl+D</kbd>: Close the selected instance (except "New Empty Window").

* <kbd>H</kbd> / <kbd>L</kbd>: Move the active tab one position left or right.

* <kbd>1</kbd> – <kbd>9</kbd>: Move the tab to that specific position (1st to 9th) in its window.

* <kbd>0</kbd>: Move the tab to the last position in its window.

#### Related Global Commands (Configurable in Browser Settings):

* <span class="command-name">Tab_Management_open</span>: Directly opens the Tab Management view when the extension popup is launched via this command.

* <span class="command-name">Move_tab_to_1st</span>: Moves the currently active tab to the first position in its window.

* <span class="command-name">Move_tab_to_2nd</span>: Moves the currently active tab to the second position in its window.

* <span class="command-name">Move_tab_to_3rd</span>: Moves the currently active tab to the third position in its window.

* <span class="command-name">Move_tab_to_4th</span
    >: Moves the currently active tab to the fourth position in its window.

### Help View

You are reading about it right now!

* <kbd>F5</kbd>: Toggle Help View.

### General Global Commands

These powerful global commands can be assigned custom keyboard shortcuts and triggered from anywhere in your browser.

To bind these commands:

1.  Go to `chrome://extensions/shortcuts` for Chromium-based browsers (e.g., Chrome, Brave, Edge) or `about:addons` for Mozilla Firefox.

2.  Find the extension, "Fuzzy Tab & Search Navigator".

3.  Click the pencil icon next to each command and enter your desired keymap.

#### The remaining available commands:

* <span class="command-name">Open_Main_View</span>: Opens the extension popup, defaulting to the Quick Search View. This is often the primary way to launch the extension.

* <span class="command-name">New_empty_tab</span>: Opens a new, empty tab in your current window.

* <span class="command-name">Cycle_tabs_playing_audio</span>: Cycles through your open tabs that are currently playing audio, helping you quickly find the source of sound.

* <span class="command-name">Cycle_YouTube_tabs</span>: Cycles specifically through your open tabs that have YouTube content.

* <span class="command-name">Move_tab_left</span>: Moves the currently active tab one position to the left within its current window.

* <span class="command-name">Move_tab_right</span>: Moves the currently active tab one position to the right within its current window.

* <span class="command-name">Cycle_media_tabs</span>: Cycles through tabs that are currently playing any type of media (audio or video), a broader option than just YouTube.

* <span class="command-name">Toggle_last_tab</span>: Quickly switches between your current tab and the tab you were on immediately before, making it easy to jump back and forth between two key tabs.
