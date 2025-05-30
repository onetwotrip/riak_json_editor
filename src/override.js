// override.js
// Content script: override /riak/* pages by rewriting the page to the extension editor UI, preserving the URL.
const browser = window.browser ?? chrome;
console.log('[Riak Editor Override] loaded for', location.href);

(async () => {
  console.log('[Riak Editor Override] starting override logic for', location.href);
  const originalHref = location.href;
  const { isRiakEnabled, riakPath } = await browser.storage.sync.get({
    isRiakEnabled: true,
    riakPath: '/riak/',
  });
  console.log('[Riak Editor Override] options:', { isRiakEnabled, riakPath });
  if (!isRiakEnabled) {
    console.log('[Riak Editor Override] disabled via options; aborting');
    return;
  }
  if (!location.pathname.startsWith(riakPath)) {
    console.log('[Riak Editor Override] path mismatch; aborting');
    return;
  }

  // Fetch the extension's editor.html and rewrite the document
  const editorHtmlUrl = browser.runtime.getURL('editor.html');
  console.log('[Riak Editor Override] fetching editor.html from', editorHtmlUrl);
  let html;
  try {
    html = await fetch(editorHtmlUrl).then((res) => res.text());
    console.log('[Riak Editor Override] fetched editor.html, rewriting page');
  } catch (err) {
    console.error('[Riak Editor Override] failed to fetch editor.html:', err);
    return;
  }

  // Inject editor parameters via an external script and patch relative resource URLs to absolute extension paths
  const paramsScriptUrl = browser.runtime.getURL(
    `inject_params.js?url=${encodeURIComponent(originalHref)}` +
    `&isRiakEnabled=${encodeURIComponent(isRiakEnabled)}` +
    `&riakPath=${encodeURIComponent(riakPath)}`
  );
  const patched = html
    .replace(/<head>/, `<head>\n<script src="${paramsScriptUrl}"></script>`)
    .replace(/(src|href)="(.*?)"/g, (_, attr, value) => {
      if (/^(https?:|\/\/|chrome-extension:)/.test(value)) {
        return `${attr}="${value}"`;
      }
      const abs = browser.runtime.getURL(value);
      return `${attr}="${abs}"`;
    });

  // Overwrite the current document with the editor UI
  document.open();
  document.write(patched);
  document.close();
  console.log('[Riak Editor Override] page rewrite complete');
})();