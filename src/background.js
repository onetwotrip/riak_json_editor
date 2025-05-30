// Background service worker for the extension.

const browserObj = typeof browser === "undefined" ? chrome : browser;

// Action handler: open editor page when icon is clicked on a Riak JSON URL
browserObj.action.onClicked.addListener(async tab => {
    const { isRiakEnabled, riakPath } = await browserObj.storage.sync.get({
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

    browserObj.tabs.create({
        url: `${browserObj.runtime.getURL('editor.html')}?url=${encodeURIComponent(tab.url)}`,
        index: tab.index + 1,
    });
});
