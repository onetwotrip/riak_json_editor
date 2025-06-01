// override.js
// Content script: override /riak/* pages by rewriting the page to the extension editor UI, preserving the URL.
const browser = window.browser ?? chrome;
(async () => {
  try {
    const { isRiakEnabled, riakPath } = await browser.storage.sync.get({
      isRiakEnabled: true,
      riakPath: '/riak/',
    });
    if (!isRiakEnabled) return;

    const loc = new URL(window.location.href);
    if (!loc.pathname.startsWith(riakPath)) return;

    const originalHref = window.location.href;

    try {
      const headRes = await fetch(originalHref, { method: 'HEAD' });
      if (!headRes.ok) {
        console.warn(
          `[Riak Editor Override] skipping override: resource returned status ${headRes.status}`
        );
        return;
      }
    } catch (err) {
      console.warn('[Riak Editor Override] error checking resource head', err);
      return;
    }
    const extensionBase = browser.runtime.getURL('');
    const editorPageUrl = browser.runtime.getURL('editor.html');
    const response = await fetch(editorPageUrl);
    let html = await response.text();

    const paramsScriptUrl = browser.runtime.getURL('override-params.js')
      + '?url=' + encodeURIComponent(originalHref);
    html = html.replace(
      /<head([^>]*)>/i,
      `<head$1>\n<base href="${extensionBase}">\n<script src="${paramsScriptUrl}"></script>`
    );

    document.open();
    document.write(html);
    document.close();
  } catch (err) {
    console.error('[Riak Editor Override] injection failed', err);
  }
})();
