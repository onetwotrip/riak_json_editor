(() => {
  try {
    const scriptEl = document.currentScript;
    if (!scriptEl) return;
    const url = new URL(scriptEl.src).searchParams.get("url");
    window.RIAK_EDITOR_PARAMS = { url };
  } catch (e) {
    console.error("[Riak Editor Override Params] failed to set params", e);
  }
})();