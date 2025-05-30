// Background service worker for the extension.

const browser = window.browser ?? chrome;

// Action handler: open editor page when icon is clicked on a Riak JSON URL
browser.action.onClicked.addListener(async tab => {
    const { isRiakEnabled, riakPath } = await browser.storage.sync.get({
        isRiakEnabled: true,
        riakPath: '/riak/',
    });
    if (!isRiakEnabled) return;

    try {
        const tabUrl = new URL(tab.url);
        if (!tabUrl.pathname.startsWith(riakPath)) return;
    } catch {
        return;
    }

    browser.tabs.create({
        url: `${browser.runtime.getURL('editor.html')}?url=${encodeURIComponent(tab.url)}`,
        index: tab.index + 1,
    });
});