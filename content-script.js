
class SearchResultsManager {
    constructor() {
        this.focusedIndex = -1;
        this.searchResults = [];
    }

    reloadSearchResults() {
        this.searchResults = Array.from(document.querySelectorAll('#search .r > a:first-of-type'));
        if (this.searchResults.length > 0 && this.focusedIndex === -1) {
            this.focus(0);
        }
    }

    highlight(searchResult) {
        searchResult.classList.add('wsn-google-focused-link');
        searchResult.classList.add('wsn-no-outline');
    }

    unhighlight(searchResult) {
        searchResult.classList.remove('wsn-google-focused-link');
        searchResult.classList.remove('wsn-no-outline');
    }

    focus(index) {
        if (this.focusedIndex >= 0) {
            this.unhighlight(this.searchResults[this.focusedIndex]);
        }
        
        if (index >= 0 && index < this.searchResults.length) {
            const searchResult = this.searchResults[index];
            this.highlight(searchResult);
            searchResult.focus({preventScroll: true});
            searchResult.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            this.focusedIndex = index;
        } else {
            this.focusedIndex = -1;
        }
    }

    focusNext() {
        if (this.focusedIndex < this.searchResults.length - 1) {
            this.focus(this.focusedIndex + 1);
        }
    }

    focusPrevious() {
        if (this.focusedIndex > 0) {
            this.focus(this.focusedIndex - 1);
        }
    }

    navigateCurrent() {
        if (this.focusedIndex >= 0 && this.focusedIndex < this.searchResults.length) {
            const link = this.searchResults[this.focusedIndex];
            if (link.href) {
                window.location.href = link.href;
            } else {
                link.click();
            }
        }
    }
}

const resultsManager = new SearchResultsManager();

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    resultsManager.reloadSearchResults();
});

// Handle dynamic content changes
const observer = new MutationObserver(() => {
    resultsManager.reloadSearchResults();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        resultsManager.focusNext();
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        resultsManager.focusPrevious();
    } else if (e.key === 'Enter') {
        e.preventDefault();
        resultsManager.navigateCurrent();
    }
});
