// Harpoon/harpoon.js

// Define a global initialization function that popup.js can call
// AFTER the harpoon.html content is loaded into the DOM.
window.initHarpoonFeature = async () => {
	console.log("Harpoon feature initialized!");
	// For now, this function doesn't need to do much,
	// but this is where you would add logic to load/display harpoon-specific data
	// or set up event listeners for the Harpoon view elements.

	// Example of a DOM element you might interact with later:
	// const harpoonList = document.getElementById("harpoonList");
	// if (harpoonList) {
	//     harpoonList.innerHTML = "<p>Loading harpoon data...</p>";
	//     // ... fetch and render harpoon items here ...
	// }
};
