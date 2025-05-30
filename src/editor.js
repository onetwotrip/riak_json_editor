if (typeof browser === "undefined") {
    var browser = chrome;
}

function extractData(rawText) {
    var tokens, text = rawText.trim();

    function test(t) {
        return ((t.charAt(0) == "[" && t.charAt(t.length - 1) == "]") ||
                (t.charAt(0) == "{" && t.charAt(t.length - 1) == "}"));
    }

    if (test(text)) {
        return { text: rawText, offset: 0 };
    }

    tokens = text.match(/^([^\s\(]*)\s*\(([\s\S]*)\)\s*;?$/);
    if (tokens && tokens[1] && tokens[2] && test(tokens[2].trim())) {
        return { fnName: tokens[1], text: tokens[2], offset: rawText.indexOf(tokens[2]) };
    }
}

/**
 * Entry point: initialize the editor page once the DOM is ready.
 */
document.addEventListener("DOMContentLoaded", init);

/**
 * Main initialization: read options and start loading the Riak JSON.
 */
function init() {
    browser.storage.sync.get(
        { isRiakEnabled: true, riakPath: "/riak/" },
        function(options) {
            if (!options.isRiakEnabled) {
                showMessage("Riak JSON Editor is disabled", true);
                return;
            }
            var params = new URLSearchParams(window.location.search);
            var url = params.get("url");
            if (!url) {
                showMessage("No URL specified", true);
                return;
            }
            loadAndRender(url);
        }
    );
}

/**
 * Fetch the JSON resource and delegate to render.
 * @param {string} url - the Riak JSON endpoint URL
 */
function loadAndRender(url) {
    fetch(url)
        .then(function(res) {
            return res.text().then(function(text) {
                return {
                    text: text,
                    headers: res.headers,
                    status: res.status,
                    statusText: res.statusText,
                    url: url
                };
            });
        })
        .then(function(resp) {
            renderPage(resp);
        })
        .catch(function(err) {
            showMessage("Fetch error: " + err, true);
        });
}

/**
 * Set up the UI and JSONEditor based on the fetched response.
 * @param {Object} resp - the fetch response info object
 */
function renderPage(resp) {
    var data = extractData(resp.text);
    if (!data) {
        showMessage("Response is not valid JSON", true);
        return;
    }

    // Build skeleton: editor pane, sidebar, and message bar.
    document.body.innerHTML =
        '<div id="main">' +
            '<div id="editor"></div>' +
            '<div id="meta"></div>' +
        '</div>' +
        '<div id="messages"></div>';

    var metaEl = document.getElementById("meta");
    var editorEl = document.getElementById("editor");

    // Buttons row (Save + Delete)
    var buttons = createButtonRow();
    metaEl.appendChild(buttons.row);

    // Scrollable metadata container
    var contentEl = document.createElement("div");
    contentEl.id = "meta-content";
    metaEl.appendChild(contentEl);

    // Populate metadata fields and links
    var metadata = parseMetadata(resp.headers);
    renderMetadata(contentEl, metadata);

    // Instantiate the JSONEditor
    var editor = new JSONEditor(
        editorEl,
        { mode: "code", indentation: 4 },
        JSON.parse(data.text)
    );

    // Wire up button actions
    buttons.save.addEventListener("click", function() {
        handleSave(editor, resp);
    });
    buttons.delete.addEventListener("click", function() {
        handleDelete(resp.url);
    });
}

/**
 * Create and return the Save/Delete button row.
 * @returns {{row:HTMLElement, save:HTMLButtonElement, delete:HTMLButtonElement}}
 */
function createButtonRow() {
    var row = document.createElement("div");
    row.id = "buttons";

    var saveBtn = document.createElement("button");
    saveBtn.id = "saveBtn";
    saveBtn.type = "button";
    saveBtn.textContent = "Save";
    row.appendChild(saveBtn);

    var deleteBtn = document.createElement("button");
    deleteBtn.id = "deleteBtn";
    deleteBtn.type = "button";
    deleteBtn.textContent = "Delete";
    row.appendChild(deleteBtn);

    return { row: row, save: saveBtn, delete: deleteBtn };
}

/**
 * Parse out standard headers and links into a metadata structure.
 * @param {Headers} headers - fetch response headers
 * @returns {Array} list of metadata entries
 */
function parseMetadata(headers) {
    var entries = [];
    var etag = headers.get("Etag") || headers.get("ETag");
    if (etag) entries.push({ type: "field", name: "ETag", value: etag });

    var vclock = headers.get("X-Riak-Vclock");
    if (vclock) entries.push({ type: "field", name: "Vclock", value: vclock });

    var len = headers.get("Content-Length");
    if (len) entries.push({ type: "field", name: "Length", value: len });

    var lastMod = headers.get("Last-Modified");
    if (lastMod) entries.push({ type: "field", name: "Last-Modified", value: lastMod });

    var linkHeader = headers.get("Link");
    if (linkHeader) {
        entries.push({ type: "links", links: parseLinkHeader(linkHeader) });
    }
    return entries;
}

/**
 * Break a Link header into [{id, restPath}, ...].
 * @param {string} headerValue - raw HTTP Link header
 * @returns {Array}
 */
function parseLinkHeader(headerValue) {
    return headerValue.split(",").reduce(function(acc, item) {
        var m = item.trim().match(/^<([^>]+)>/);
        if (!m) return acc;
        var urlValue = m[1].replace(/^\/?riak\//, "");
        var segments = urlValue.split("/");
        var id = segments.pop();
        var rest = segments.join("/");
        acc.push({ id: id, rest: rest });
        return acc;
    }, []);
}

/**
 * Render metadata entries (fields and links) into the sidebar content.
 * @param {HTMLElement} container
 * @param {Array} metadata - output of parseMetadata
 */
function renderMetadata(container, metadata) {
    metadata.forEach(function(entry) {
        if (entry.type === "field") {
            appendField(container, entry.name, entry.value);
        } else if (entry.type === "links") {
            appendLinkSection(container, entry.links);
        }
    });
}

/**
 * Append a single metadata field (label + value).
 * @param {HTMLElement} container
 * @param {string} name
 * @param {string} value
 */
function appendField(container, name, value) {
    var field = document.createElement("div");
    field.className = "meta-field";

    var lbl = document.createElement("strong");
    lbl.textContent = name;
    field.appendChild(lbl);

    var valEl = document.createElement("div");
    valEl.className = "meta-value";
    valEl.textContent = value;
    field.appendChild(valEl);

    container.appendChild(field);
}

/**
 * Append a block of Link entries under a Link label.
 * @param {HTMLElement} container
 * @param {Array} links - array of {id, rest}
 */
function appendLinkSection(container, links) {
    var header = document.createElement("div");
    header.className = "meta-field";
    var lbl = document.createElement("strong");
    lbl.textContent = "Link";
    header.appendChild(lbl);
    container.appendChild(header);

    links.forEach(function(link) {
        var linkDiv = document.createElement("div");
        linkDiv.className = "link-field";

        var metaLine = document.createElement("div");
        metaLine.className = "link-meta";

        var strong = document.createElement("strong");
        strong.textContent = link.id;
        metaLine.appendChild(strong);

        if (link.rest) {
            metaLine.appendChild(document.createTextNode(" (" + link.rest + ")"));
        }
        linkDiv.appendChild(metaLine);
        container.appendChild(linkDiv);
    });
}

/**
 * Handler for Save button: PUT back the updated JSON + vclock + Link.
 * @param {JSONEditor} editor
 * @param {Object} resp - original fetch context (headers, url)
 */
function handleSave(editor, resp) {
    var updated = editor.get();
    var body;
    try {
        body = JSON.stringify(updated);
    } catch (err) {
        showMessage("Error serializing JSON: " + err, true);
        return;
    }

    var headers = { "Content-Type": "application/json" };
    var vclock = resp.headers.get("X-Riak-Vclock");
    if (vclock) headers["X-Riak-Vclock"] = vclock;
    var linkHdr = resp.headers.get("Link");
    if (linkHdr) headers["Link"] = linkHdr;

    fetch(resp.url, { method: "PUT", headers: headers, body: body })
        .then(function(res) {
            if (res.ok) {
                showMessage("Saved successfully");
            } else {
                showMessage("Save failed: " + res.status + " " + res.statusText, true);
            }
        })
        .catch(function(err) {
            showMessage("Save error: " + err, true);
        });
}

/**
 * Handler for Delete button: confirm + DELETE request.
 * @param {string} url
 */
function handleDelete(url) {
    if (!window.confirm("Are you sure you want to delete this object?")) return;
    fetch(url, { method: "DELETE" })
        .then(function(res) {
            if (res.ok) {
                showMessage("Deleted successfully");
            } else {
                showMessage("Delete failed: " + res.status + " " + res.statusText, true);
            }
        })
        .catch(function(err) {
            showMessage("Delete error: " + err, true);
        });
}

function showMessage(msg, isError) {
    var el = document.getElementById("messages");
    el.textContent = msg;
    el.style.display = "block";
    el.style.color = isError ? "red" : "";
}