// This file is currently minimal as per your request for a simple toggle window.
// Its content will be dynamically loaded into popup.html's #harpoonSection.

// Load the content of harpoon.html into the #harpoonSection div.
// This ensures that the HTML structure and content are present when the harpoon section is shown.
document.addEventListener("DOMContentLoaded", () => {
    const harpoonSection = document.getElementById("harpoonSection");

    // Fetch harpoon.html content
    fetch(chrome.runtime.getURL('harpoon.html'))
        .then(response => response.text())
        .then(html => {
            harpoonSection.innerHTML = html;
        })
        .catch(err => console.error('Failed to load harpoon.html:', err));
});

// Future Harpoon specific JavaScript logic will go here.
// For now, it just loads its HTML content.
