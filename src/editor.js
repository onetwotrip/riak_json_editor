const browser = window.browser ?? chrome;

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
    const { isRiakEnabled, riakPath } = await browser.storage.sync.get({
        isRiakEnabled: true,
        riakPath: "/riak/",
    });
    if (!isRiakEnabled) {
        showMessage("Riak JSON Editor is disabled", true);
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const url = params.get("url");
    if (!url) {
        showMessage("No URL specified", true);
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
    const { row, saveBtn, deleteBtn } = createButtonRow();
    metaEl.appendChild(row);

    const contentEl = document.createElement("div");
    contentEl.id = "meta-content";
    metaEl.appendChild(contentEl);

    renderMetadata(contentEl, parseMetadata(resp.headers));

    const editor = new JSONEditor(
        editorEl,
        { mode: "code", indentation: 4 },
        JSON.parse(data.text)
    );
    saveBtn.addEventListener("click", () => handleSave(editor, resp));
    deleteBtn.addEventListener("click", () => handleDelete(resp.url));
}

const createButtonRow = () => {
    const row = document.createElement("div");
    row.id = "buttons";

    const saveBtn = document.createElement("button");
    saveBtn.id = "saveBtn";
    saveBtn.type = "button";
    saveBtn.textContent = "Save";
    row.appendChild(saveBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.id = "deleteBtn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    row.appendChild(deleteBtn);

    return { row, saveBtn, deleteBtn };
};

const parseMetadata = headers => {
    const entries = [];
    const etag = headers.get("Etag") ?? headers.get("ETag");
    if (etag) entries.push({ type: "field", name: "ETag", value: etag });

    const vclock = headers.get("X-Riak-Vclock");
    if (vclock) entries.push({ type: "field", name: "Vclock", value: vclock });

    const length = headers.get("Content-Length");
    if (length) entries.push({ type: "field", name: "Length", value: length });

    const lastModified = headers.get("Last-Modified");
    if (lastModified) entries.push({ type: "field", name: "Last-Modified", value: lastModified });

    const linkHeader = headers.get("Link");
    if (linkHeader) entries.push({ type: "links", links: parseLinkHeader(linkHeader) });
    return entries;
};

const parseLinkHeader = headerValue =>
    headerValue
        .split(",")
        .map(item => item.trim().match(/^<([^>]+)>/))
        .filter(m => m)
        .map(m => {
            const displayUrl = m[1].replace(/^\/?riak\//, "");
            const segments = displayUrl.split("/");
            const id = segments.pop();
            const rest = segments.join("/");
            return { id, rest };
        });

const renderMetadata = (container, metadata) => {
    metadata.forEach(entry => {
        if (entry.type === "field") {
            appendField(container, entry.name, entry.value);
        } else if (entry.type === "links") {
            appendLinkSection(container, entry.links);
        }
    });
};

const appendField = (container, name, value) => {
    const field = document.createElement("div");
    field.className = "meta-field";

    const lbl = document.createElement("strong");
    lbl.textContent = name;
    field.appendChild(lbl);

    const valEl = document.createElement("div");
    valEl.className = "meta-value";
    valEl.textContent = value;
    field.appendChild(valEl);

    container.appendChild(field);
};

const appendLinkSection = (container, links) => {
    const header = document.createElement("div");
    header.className = "meta-field";
    const lbl = document.createElement("strong");
    lbl.textContent = "Link";
    header.appendChild(lbl);
    container.appendChild(header);

    links.forEach(({ id, rest }) => {
        const linkDiv = document.createElement("div");
        linkDiv.className = "link-field";

        const metaLine = document.createElement("div");
        metaLine.className = "link-meta";

        const strongEl = document.createElement("strong");
        strongEl.textContent = id;
        metaLine.appendChild(strongEl);

        if (rest) metaLine.appendChild(document.createTextNode(` (${rest})`));
        linkDiv.appendChild(metaLine);

        container.appendChild(linkDiv);
    });
};

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

const showMessage = (msg, isError = false) => {
    const el = document.getElementById("messages");
    el.textContent = msg;
    el.style.display = "block";
    el.style.color = isError ? "red" : "";
};