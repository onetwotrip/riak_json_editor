const browser = window.browser ?? chrome;
const Mustache = window.Mustache ?? window.mustache ?? mustache;

const extractData = rawText => {
    const text = rawText.trim();
    const test = t =>
        (t[0] === "[" && t[t.length - 1] === "]") ||
        (t[0] === "{" && t[t.length - 1] === "}");

    if (test(text)) {
        return { text: rawText, offset: 0 };
    }

    const tokens = text.match(/^([^\\s\\(]*)\\s*\\(([\\s\\S]*)\\)\\s*;?$/);
    if (tokens && test(tokens[2].trim())) {
        return { fnName: tokens[1], text: tokens[2], offset: rawText.indexOf(tokens[2]) };
    }
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
    let url, isRiakEnabled, riakPath;
    if (window.RIAK_EDITOR_PARAMS) {
        ({url, isRiakEnabled, riakPath} = window.RIAK_EDITOR_PARAMS);
    } else {
        const params = new URLSearchParams(window.location.search);
        if (params.has('isRiakEnabled') && params.has('riakPath') && params.has('url')) {
            isRiakEnabled = params.get('isRiakEnabled') === 'true';
            riakPath = params.get('riakPath');
            url = params.get('url');
        } else {
            const opts = await browser.storage.sync.get({
                isRiakEnabled: true,
                riakPath: '/riak/',
            });
            isRiakEnabled = opts.isRiakEnabled;
            riakPath = opts.riakPath;
            url = params.get('url');
        }
    }
    if (!isRiakEnabled) {
        showMessage('Riak JSON Editor is disabled', true);
        return;
    }
    if (!url) {
        showMessage('No URL specified', true);
        return;
    }
    await loadAndRender(url);
}

async function loadAndRender(url) {
    try {
        const res = await fetch(url);
        const text = await res.text();
        await renderPage({
            text,
            headers: res.headers,
            status: res.status,
            statusText: res.statusText,
            url,
        });
    } catch (err) {
        showMessage(`Fetch error: ${err}`, true);
    }
}

async function renderPage(resp) {
    const data = extractData(resp.text);
    if (!data) {
        showMessage("Response is not valid JSON", true);
        return;
    }

    document.body.innerHTML = `
        <div id="main">
            <div id="editor"></div>
            <div id="meta"></div>
        </div>
        <div id="messages"></div>
    `;

    const metaEl = document.getElementById("meta");
    const editorEl = document.getElementById("editor");
    const template = document.getElementById("template-meta").innerHTML;
    const { fields, links } = parseMetadata(resp.headers);
    metaEl.innerHTML = Mustache.render(template, { fields, links });

    const editor = new JSONEditor(
        editorEl,
        { mode: "code", indentation: 4 },
        JSON.parse(data.text)
    );
    const saveBtn = metaEl.querySelector("#saveBtn");
    const deleteBtn = metaEl.querySelector("#deleteBtn");
    saveBtn.addEventListener("click", () => handleSave(editor, resp));
    deleteBtn.addEventListener("click", () => handleDelete(resp.url));
}


const parseMetadata = headers => {
    const fields = [];
    const links = [];
    const etag = headers.get("Etag") ?? headers.get("ETag");
    if (etag) fields.push({ name: "ETag", value: etag });

    const vclock = headers.get("X-Riak-Vclock");
    if (vclock) fields.push({ name: "Vclock", value: vclock });

    const length = headers.get("Content-Length");
    if (length) fields.push({ name: "Length", value: length });

    const lastModified = headers.get("Last-Modified");
    if (lastModified) fields.push({ name: "Last-Modified", value: lastModified });

    const linkHeader = headers.get("Link");
    if (linkHeader) links.push(...parseLinkHeader(linkHeader));
    return { fields, links };
};

const parseLinkHeader = headerValue =>
    headerValue
        .split(",")
        .map(linkEntry => {
            const [urlPart, metaPart] = linkEntry.split(";").map(s => s.trim())
            const url = urlPart.match(/^<(.*)>$/)[1];

            // Skip "up" links
            // if (metaPart === 'rel="up"') return undefined;

            // Parse meta as key-value
            let [key, value] = metaPart.split('=').map(s => s.trim());
            value = value.match(/^"(.*)"$/)[1];
            const meta = key === 'riaktag' ? value : metaPart;

            // Extract uuid4 from url
            const bucketMatch = url.match(/\/?riak\/(.*)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
            if (bucketMatch !== null) {
                return { url, bucket: bucketMatch[1], id: bucketMatch[2], meta };
            }

            // Fallback: unknown pattern
            return { url, meta };
        })
        .filter(Boolean);

const handleSave = async (editor, resp) => {
    const updated = editor.get();
    let body;
    try {
        body = JSON.stringify(updated);
    } catch (err) {
        showMessage(`Error serializing JSON: ${err}`, true);
        return;
    }
    const headers = new Headers({ "Content-Type": "application/json" });
    const vclockHdr = resp.headers.get("X-Riak-Vclock");
    if (vclockHdr) headers.set("X-Riak-Vclock", vclockHdr);
    const linkHdr = resp.headers.get("Link");
    if (linkHdr) headers.set("Link", linkHdr);

    try {
        const res = await fetch(resp.url, { method: "PUT", headers, body });
        if (res.ok) {
            showMessage("Saved successfully");
        } else {
            showMessage(`Save failed: ${res.status} ${res.statusText}`, true);
        }
    } catch (err) {
        showMessage(`Save error: ${err}`, true);
    }
};

const handleDelete = async url => {
    if (!confirm("Are you sure you want to delete this object?")) return;
    try {
        const res = await fetch(url, { method: "DELETE" });
        if (res.ok) {
            showMessage("Deleted successfully");
        } else {
            showMessage(`Delete failed: ${res.status} ${res.statusText}`, true);
        }
    } catch (err) {
        showMessage(`Delete error: ${err}`, true);
    }
};

let messageTimer;

const hideMessage = () => {
    const el = document.getElementById("messages");
    el.style.display = "none";
};

const showMessage = (msg, isError = false) => {
    const el = document.getElementById("messages");
    el.innerHTML = `<span class="msg-text">${msg}</span>` +
                 `<button class="msg-close" type="button">&times;</button>`;
    el.style.display = "flex";
    el.style.color = isError ? "red" : "";
    const btn = el.querySelector(".msg-close");
    btn.addEventListener("click", hideMessage);
    if (messageTimer) clearTimeout(messageTimer);
    messageTimer = setTimeout(hideMessage, 5000);
};
