# Fuzzy Tab & Search Navigator
---

### Overview
This extension significantly enhances your browsing efficiency by providing powerful keyboard-driven navigation on Google search results and a comprehensive tab management system, including specialized media controls.

### Web Search Navigator
* **Keyboard Navigation:** Use `Arrow Up`/`Down` on **Google search results** to select links.
* **Visual Highlight:** An orange arrow `➤` marks the active link.
* **Smooth Scrolling:**
    * **First link:** Scrolls to the top of the page.
    * **Other links:** Scrolls with a deep 70% margin for a slower, more contextual animation. No scroll if already visible.
* **Quick Open:** Press `Enter` or `Space` to open in the current tab.
* **Quick Open (New Tab):** Press `Ctrl+Enter` or `Ctrl+Space` for a new tab.
* **User Option:** Easily **enable or disable** this functionality via the extension popup.

---

### Fuzzy Tab Switcher
* **Quick Access:** Open the popup with `Alt+A` (or your custom configured shortcut).
* **Fuzzy Search:** Find tabs by title or URL, with **title matches prioritized**.
* **Efficient Switching:** Navigate the filtered list with `Arrow Up`/`Down` (or `Alt+K`/`Alt+J`), then `Enter` to switch tabs.
* **Integrated Search:** If your search query yields no tab matches, pressing `Enter` will **optionally** open a Google search for your query (configurable via user option).
* **Tab Management:**
    * `Ctrl+D`: Delete selected tab.
    * `Ctrl+Shift+D`: Delete all filtered tabs.
* **User Options:** Access settings within the popup by pressing `F1` to toggle Web Search Navigator and the "Search on Enter" behavior.

---

### Configurable Keyboard Shortcuts
You can customize these commands with your preferred keyboard shortcuts by visiting `chrome://extensions/shortcuts` in your browser:

* **`_execute_action`**: Opens the Fuzzy Tab Switcher popup.
    * *Default Suggested Key:* `Alt+A`
* **`whatsapp_tab`**: Focuses an existing WhatsApp Web tab or opens a new one.
* **`chatgpt_tab`**: Focuses an existing ChatGPT tab or opens a new one.
* **`youtube_homepage_tab`**: Focuses an existing YouTube homepage tab or opens a new one.
* **`gemini_tab`**: Focuses an existing Gemini tab or opens a new one.
* **`move_tab_to_first`**: Moves the current active tab to the 1st position.
* **`move_tab_to_second`**: Moves the current active tab to the 2nd position.
* **`move_tab_to_third`**: Moves the current active tab to the 3rd position.
* **`move_tab_to_fourth`**: Moves the current active tab to the 4th position.
* **`open_new_empty_tab`**: Opens a new, empty tab.
* **`cycle_audible_tabs`**: Cycles through tabs that are **currently playing audio**.
    * *Default Suggested Key:* `Alt+Q`
* **`cycle_media_tabs`**: Cycles through tabs that have **active or muted media sessions**. This includes tabs that are currently playing audio (`audible: true`) or are explicitly muted (`mutedInfo.muted: true`).
    * *Default Suggested Key:* `Alt+W`
    * **Note on "Media Tabs"**: Due to browser API limitations, this command **cannot detect tabs where media is paused but unmuted**. It only identifies tabs that are actively playing sound or have their audio explicitly muted.
