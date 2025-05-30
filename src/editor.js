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

document.addEventListener("DOMContentLoaded", function() {
    browser.storage.sync.get({ isRiakEnabled: true, riakPath: "/riak/" }, function(options) {
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

        fetch(url)
            .then(function(res) {
                var headers = res.headers;
                return res.text().then(function(text) {
                    return { text: text, headers: headers, status: res.status, statusText: res.statusText };
                });
            })
            .then(function(resp) {
                var data = extractData(resp.text);
                if (!data) {
                    showMessage("Response is not valid JSON", true);
                    return;
                }
                document.body.innerHTML =
                    '<div id="main">' +
                        '<div id="editor"></div>' +
                        '<div id="meta"></div>' +
                    '</div>' +
                    '<div id="messages"></div>';

                var metaEl = document.getElementById("meta");
                var btnRow = document.createElement("div");
                btnRow.id = "buttons";
                var saveBtn = document.createElement("button");
                saveBtn.id = "saveBtn";
                saveBtn.type = "button";
                saveBtn.textContent = "Save";
                btnRow.appendChild(saveBtn);
                var deleteBtn = document.createElement("button");
                deleteBtn.id = "deleteBtn";
                deleteBtn.type = "button";
                deleteBtn.textContent = "Delete";
                btnRow.appendChild(deleteBtn);
                metaEl.appendChild(btnRow);

                // Render metadata fields (bold labels, values on their own lines)
                function appendField(name, value) {
                    var fld = document.createElement("div");
                    fld.className = "meta-field";
                    var lbl = document.createElement("strong");
                    lbl.textContent = name;
                    fld.appendChild(lbl);
                    var valEl = document.createElement("div");
                    valEl.className = "meta-value";
                    valEl.textContent = value;
                    fld.appendChild(valEl);
                    metaEl.appendChild(fld);
                }
                var etag = resp.headers.get("Etag") || resp.headers.get("ETag");
                if (etag) appendField("ETag", etag);
                var vclock = resp.headers.get("X-Riak-Vclock");
                if (vclock) appendField("Vclock", vclock);
                var len = resp.headers.get("Content-Length");
                if (len) appendField("Length", len);
                var lastMod = resp.headers.get("Last-Modified");
                if (lastMod) appendField("Last-Modified", lastMod);
                var link = resp.headers.get("Link");
                if (link) {
                    // Header label for links
                    var linkHeader = document.createElement("div");
                    linkHeader.className = "meta-field";
                    var linkLbl = document.createElement("strong");
                    linkLbl.textContent = "Link";
                    linkHeader.appendChild(linkLbl);
                    metaEl.appendChild(linkHeader);
                    // Parse individual link entries into id + rest
                    link.split(",").forEach(function(item) {
                        var parts = item.trim().match(/^<([^>]+)>/);
                        if (!parts) return;
                        var urlValue = parts[1];
                        // Strip /riak/ prefix, break path by slash
                        var displayUrl = urlValue.replace(/^\/?riak\//, "");
                        var segments = displayUrl.split("/");
                        var idValue = segments.pop();
                        var restPath = segments.join("/");
                        var linkDiv = document.createElement("div");
                        linkDiv.className = "link-field";
                        var metaLine = document.createElement("div");
                        metaLine.className = "link-meta";
                        var strong = document.createElement("strong");
                        strong.textContent = idValue;
                        metaLine.appendChild(strong);
                        if (restPath) {
                            metaLine.appendChild(document.createTextNode(" (" + restPath + ")"));
                        }
                        linkDiv.appendChild(metaLine);
                        metaEl.appendChild(linkDiv);
                    });
                }

                var editor = new JSONEditor(
                    document.getElementById("editor"),
                    { mode: "code", indentation: 4 },
                    JSON.parse(data.text)
                );

                saveBtn.addEventListener("click", function() {
                    var updated = editor.get();
                    var body;
                    try {
                        body = JSON.stringify(updated);
                    } catch (e) {
                        showMessage("Error serializing JSON: " + e, true);
                        return;
                    }
                    var reqHeaders = { "Content-Type": "application/json" };
                    var vclock = resp.headers.get("X-Riak-Vclock");
                    if (vclock) {
                        reqHeaders["X-Riak-Vclock"] = vclock;
                    }
                    var linkHeader = resp.headers.get("Link");
                    if (linkHeader) {
                        reqHeaders["Link"] = linkHeader;
                    }
                    fetch(url, {
                        method: "PUT",
                        headers: reqHeaders,
                        body: body
                    })
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
                });
                deleteBtn.addEventListener("click", function() {
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
                });
            })
            .catch(function(err) {
                showMessage("Fetch error: " + err, true);
            });
    });
});

function showMessage(msg, isError) {
    var el = document.getElementById("messages");
    el.textContent = msg;
    el.style.display = "block";
    el.style.color = isError ? "red" : "";
}