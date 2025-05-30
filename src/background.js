// Background service worker for the extension.

// Minimal polyfill: alias browser.* to chrome.* if needed
if (typeof browser === "undefined") {
    var browser = chrome;
}

// Action handler: open editor page when icon is clicked on a Riak JSON URL
browser.action.onClicked.addListener((tab) => {
    browser.storage.sync.get({ isRiakEnabled: true, riakPath: '/riak/' }, function(options) {
        if (!options.isRiakEnabled) return;
        let tabUrl;
        try {
            tabUrl = new URL(tab.url);
            if (tabUrl.pathname.indexOf(options.riakPath) !== 0) return;
        } catch (e) {
            return;
        }
        browser.tabs.create({
            url: browser.runtime.getURL('editor.html') + '?url=' + encodeURIComponent(tab.url),
            index: tab.index + 1
        });
    });
});