(function() {
    const script = document.currentScript;
    if (!script) return;
    const paramsUrl = new URL(script.src);
    const params = new URLSearchParams(paramsUrl.search);
    window.RIAK_EDITOR_PARAMS = {
        url: params.get('url'),
        isRiakEnabled: params.get('isRiakEnabled') === 'true',
        riakPath: params.get('riakPath')
    };
})();