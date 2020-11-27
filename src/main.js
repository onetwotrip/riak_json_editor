// ==UserScript==
// @name ChristmasTree
// @include http://*/*
// @include https://*/*
// @include ftp://*/*
// @include file:///*
// @require jquery-1.8.2.min.js
// @require jsoneditor.min.js
// ==/UserScript==
var $ = window.$.noConflict(true); // Required for Opera and IE

JSONEditor.prototype.initAdditionalTools = function() {
    $('#messages').css({
        display: 'block'
    });
    $('#editor').css({
        height: '95%'
    });

    const editor = this;

    this.editTools = {
        editor: this,
        riak: {
            links: null,
            headers: {}
        },
        getData: function(ev, opType) {
            let self = editor.editTools;
            let request = $.ajax({
                success: function(err, data, res) {
                    if (res.status == 200) {
                        self.riak.links = res.getResponseHeader('Link');

                        let headers = request.getAllResponseHeaders();
                        headers.toString().split('\n').forEach(function(h) {
                            let keyVal = h.split(':');
                            if (keyVal[0].toLowerCase().indexOf('x-riak') === 0) {
                                self.riak.headers[keyVal[0].toLowerCase()] = res.getResponseHeader(keyVal[0]);
                            }
                        });

                        editor.setText(res.responseText);
                        editor.format();
                        opType = opType || 'obtain';
                        self.showMessage('Last ' + opType + ' ' + new Date());
                    } else if (res.status == 304) {
                        self.showMessage('Not modified');
                    }
                    self.feelMetas();
                },
                error: function(err) {
                    self.showMessage('Obtain error: ' + err.responseText, true);
                    self.feelMetas();
                },
                url: document.URL,
                type: 'GET'
            });
        },
        saveData: function() {
            let self = editor.editTools;
            let stringifyedData;
            try {
                stringifyedData = JSON.stringify(JSON.parse(editor.getText()));
            } catch (err) {
                self.showMessage('Error while parse JSON', true);
                return;
            }

            let settings = {
                contentType: "application/json",
                success: function() {
                    self.getData(null, 'save');
                },
                error: function(err) {
                    self.showMessage('Save error: ' + err.responseText, true);
                },
                url: document.URL,
                data: stringifyedData,
                type: 'PUT',
                headers: {
                    'Link': self.riak.links || undefined
                }
            };

            var metas = self.collectMeta();
            if (!metas) {
                return;
            }

            if (metas.links) {
                settings.headers.Link = metas.links;
            }

            if (Object.keys(self.riak.headers).length > 0) {
                for (var h in self.riak.headers) {
                    settings.headers[h] = self.riak.headers[h];
                }
            }
            for (var i in metas.headers) {
                if (metas.headers[i].delete) {
                    delete settings.headers[i];
                } else {
                    settings.headers[i] = metas.headers[i];
                }
            }

            $.ajax(settings);
        },
        showMeta: function() {
            var self = editor.editTools;
            if (!self.metaShowed) {
                self.metaShowed = true;
                $('#meta').css({
                    display: 'block'
                });
                $('#metaButton').html('Hide meta');
            } else {
                self.metaShowed = false;
                $('#meta').css({
                    display: 'none'
                });
                $('#metaButton').html('Show meta');
            }
        },
        showMessage: function(text, isError) {
            var messages = $("#messages");

            var cl = 'updated';
            if (isError) {
                cl += '_err';
            }

            messages.html(text).addClass(cl);

            setTimeout(function() {
                messages.removeClass(cl);
            }, 2000);
        },
        addButtons: function() {
            var self = this;
            var save = $('<button/>').html('Save').on('click', self.saveData).addClass('center').css({
                width: '100px',
                background: '#78FFB0',
                color: '#000',
                fontWeight: 'bold',
                cursor: 'pointer'
            }).attr('title', 'Save JSON to riak server with links and indexes (Ctrl+s)');
            var get = $('<button/>').html('Get data from RIAK').on('click', self.getData).addClass('center').css({
                width: '150px',
                background: '#fff',
                color: '#000',
                cursor: 'pointer'
            }).attr('title', 'Obtain JSON from riak server with links and indexes (Ctrl+r)');
            var meta = $('<button id="metaButton"/>').html('Show meta').on('click', self.showMeta).addClass('center').css({
                width: '100px',
                background: '#FFFFB3',
                color: '#000',
                cursor: 'pointer',
            }).attr('title', 'Toggle show/hide block with meta information (Ctrl+m)');

            var menu = $(editor.menu);
            menu.append(save);
            menu.append(get);
            menu.append(meta);
        },
        addKeyBindings: function() {
            var self = this;
            $(document).on('keydown', function(e) {
                if (e.ctrlKey && e.keyCode == 82) { // ctrl + r
                    self.getData();
                    return false;
                }
                if (e.ctrlKey && e.keyCode == 83) { // ctrl + s
                    self.saveData();
                    return false;
                }
                if (e.keyCode == 27) { // esc
                    if (self.metaShowed) {
                        self.showMeta();
                    }
                }
                if (e.ctrlKey && e.keyCode == 77) { // ctrl + m
                    self.showMeta();
                }
            });
        },
        feelMetas: function() {
            var self = this;
            self.riak.sugar = {
                links: 0,
                indexes: 0,
                headersKeys: []
            };

            var links = (self.riak.links || '').split(',');
            var reglink = /<\/riak\/([\w-]*)[\/]?([\w-]*)>;\s([\w]*)="([\w]*)"/;
            reglink.compile(reglink);

            var headers = self.riak.headers || {};
            var regind = /x-riak-index-([\w]*)_([\w]{3})/;
            regind.compile(regind);

            var meta = $('#meta');
            meta.html('<h3>Meta Information</h3>').find('h3').css({
                textAlign: 'center'
            });

            meta.append('<h4>Links</h4>').find('h4').css({
                textAlign: 'center'
            });
            var linksHtml = '<ul id="links">';
            for (var i in links) {
                var link = links[i].match(reglink);
                if (link) {
                    var dis = '';
                    var disabled = false;
                    if (link[3] == 'rel') {
                        disabled = true;
                        dis = 'disabled="disabled"';
                    }

                    linksHtml += '<li id="li_' + i + '">Link № ' + (Number(i) + 1) + (disabled ? '' : ' - <a class="delMetaInf" href="#">delete</a>');
                    linksHtml += '<ol>';
                    linksHtml += '<li><span>Bucket:</span> <input type="text" class="metas" id="' + i + '_link_bucket" value="' + link[1] + '"' + dis + '/></li>';
                    linksHtml += '<li><span>Key:</span> <input type="text" class="metas" id="' + i + '_link_key" value="' + link[2] + '"' + dis + '/></li>';
                    linksHtml += '<li><span>Tag:</span> <input type="text" class="metas" id="' + i + '_link_type" value="' + link[3] + '"' + dis + '/></li>';
                    linksHtml += '<li><span>Identifer:</span> <input type="text" class="metas" id="' + i + '_link_val" value="' + link[4] + '"' + dis + '/></li>';
                    linksHtml += '</ol></li>';
                    self.riak.sugar.links++;
                }
            }
            linksHtml += '</ul>';
            linksHtml += '<a class="addMetaInf" type="link" href="#">Add new link</a>';
            meta.append(linksHtml);

            meta.append('<h4>Indexes</h4>').find('h4').css({
                textAlign: 'center'
            });
            var indexHtml = '<ul id="indexes">';
            var cnt = 0;
            for (var h in headers) {
                var index = h.match(regind);
                if (index) {
                    indexHtml += '<li id="in_' + cnt + '">Index № ' + (Number(cnt) + 1) + ' - <a class="delMetaInf" href="#">delete</a>';
                    indexHtml += '<ol>';
                    indexHtml += '<li><span>Index:</span> <input type="text" class="metas" id="' + cnt + '_index_key" value="' + index[1] + '"/></li>';
                    indexHtml += '<li><span>Value:</span> <input type="text" class="metas" id="' + cnt + '_index_val" value="' + headers[h] + '"/></li>';
                    indexHtml += '</ol></li>';
                    self.riak.sugar.indexes++;
                    self.riak.sugar.headersKeys.push(index[0]);
                    cnt++;
                }
            }
            indexHtml += '</ul>';
            indexHtml += '<a class="addMetaInf" type="index" href="#">Add new index</a>';
            meta.append(indexHtml);
        },
        collectMeta: function() {
            var self = this;
            var objs = {
                link: {},
                index: {},
                linkkArr: [],
                headers: {}
            };
            var num = /^[\d]+$/;

            var metas = $('#meta').find('.metas');
            metas.each(function(cnt, el) {
                var keyArr = el.id.split('_');
                var serial = keyArr[0];
                var type = keyArr[1];
                var key = keyArr[2];

                if (!objs[type]) {
                    return;
                }

                if (!objs[type][serial]) {
                    objs[type][serial] = {};
                }

                objs[type][serial][key] = String(el.value);
            });

            for (var i in objs.link) {
                if (!self.checkFilling('Link', i, objs.link[i], ['bucket', 'type', 'val'])) {
                    return;
                }

                var link = '</riak/' + objs.link[i].bucket;
                if (objs.link[i].key) {
                    link += '/' + objs.link[i].key;
                }
                link += '>; ';
                link += objs.link[i].type + '=';
                link += '"' + objs.link[i].val + '"';
                objs.linkkArr.push(link);
            }
            for (var j in objs.index) {
                if (!self.checkFilling('Index', j, objs.index[j], ['key', 'val'])) {
                    return;
                }

                var keyType = 'x-riak-index-' + objs.index[j].key;
                var val = objs.index[j].val;
                if (num.test(val)) {
                    keyType += '_int';
                } else {
                    keyType += '_bin';
                }
                objs.headers[keyType] = objs.index[j].val;
            }
            for (var d in self.riak.sugar.headersKeys) {
                if (!objs.headers[self.riak.sugar.headersKeys[d]]) {
                    objs.headers[self.riak.sugar.headersKeys[d]] = {
                        delete: true
                    };
                }
            }

            return {
                links: objs.linkkArr.join(', '),
                headers: objs.headers
            };
        },
        checkFilling: function(type, cnt, res, keys) {
            for (var i in keys) {
                if (!res[keys[i]] || res[keys[i]] == '') {
                    alert(type + ' № ' + (Number(cnt) + 1) + ' field @' + keys[i] + '@ is not filled.');
                    return false;
                }
            }
            return true;
        }
    };
    $(document).on('click', '.delMetaInf', function() {
        $(this).parent().remove();
        return false;
    });
    $(document).on('click', '.addMetaInf', function() {
        var i;
        var self = editor.editTools;
        var el = $(this).attr('type');
        if (el == 'link') {
            i = self.riak.sugar.links++;
            var link = '<li id="in_' + i + '">Link № ' + (i + 1) + ' - <a class="delMetaInf" href="#">delete</a>';
            link += '<ol>';
            link += '<li><span>Bucket:</span> <input type="text" class="metas" id="' + i + '_link_bucket" value=""/></li>';
            link += '<li><span>Key:</span> <input type="text" class="metas" id="' + i + '_link_key" value=""/></li>';
            link += '<li><span>Tag:</span> <input type="text" class="metas" id="' + i + '_link_type" value=""/></li>';
            link += '<li><span>Identifer:</span> <input type="text" class="metas" id="' + i + '_link_val" value=""/></li>';
            link += '</ol></li>';
            $('#links').append(link);
        } else if (el == 'index') {
            i = self.riak.sugar.indexes++;
            var index = '<li id="in_' + i + '">Index № ' + (i + 1) + ' - <a class="delMetaInf" href="#">delete</a>';
            index += '<ol>';
            index += '<li><span>Index:</span> <input type="text" class="metas" id="' + i + '_index_key" value=""/></li>';
            index += '<li><span>Value:</span> <input type="text" class="metas" id="' + i + '_index_val" value=""/></li>';
            index += '</ol></li>';
            $('#indexes').append(index);
        }
        return false;
    });

    this.editTools.addButtons();
    this.editTools.addKeyBindings();
    this.editTools.getData(null, 'obtain');
};

function load(content) {
    var child, data;

    if (document.body && (document.body.childNodes[0] && document.body.childNodes[0].tagName == "PRE" ||
            document.body.children.length === 0)) {

        child = document.body.children.length ? document.body.childNodes[0] : document.body;
        data = extractData(child.innerText);

        var isNotFound = child.innerText.indexOf('not found') === 0;

        if (!data && !isNotFound) {
            return;
        }

        // optimisations for display
        content = content.replace(/img\/jsoneditor-icons\.svg/g, kango.io.getResourceUrl('res/jsoneditor-icons.svg'));
        content += `body{height:${window.innerHeight}px; margin: 0px; font-family: droid sans mono, consolas, monospace, courier new, courier, sans-serif;font-size: 12px;}`;
        content += `#editor .jsoneditor{height:${window.innerHeight}px; border: none; border-bottom: 1px solid #3883fa}`;
        content += '#editor div.jsoneditor-menu{text-align: center;box-shadow: inset 0px -1px 4px 1px #E0DCDC;border-bottom:none;background-color: rgb(235, 235, 235);}';
        content += '#editor div.jsoneditor-menu>button.center{float: none;margin: 2px 10px 0 10px;height: 28px;box-shadow: 0px 0px 2px 2px #D2D2D2;}';
        content += '#editor div.jsoneditor-menu>button.center:hover{opacity: 0.9}';
        content += '#editor div.jsoneditor-menu>button{background-color: #CCCCCC;}';
        content += '#messages{display: none;transition: all 3s;text-align: center;}';
        content += '#messages.updated{background: #18F776;}';
        content += '#messages.updated_err{background: rgb(251, 96, 85);}';
        content += '#meta{display: none;padding: 0 10px;width: 400px;height: 90%;overflow-x:auto;position: absolute;top: 25px;right: 30px;z-index: 1000;background: #F7F7F7;box-shadow: 0px 3px 10px 0px #CEC6C6;border-radius: 4px;}';
        content += '#meta>ul{padding-left: 20px;}';
        content += '#meta>ul>li{margin-bottom: 15px;}';
        content += '#meta>ul>li>ol{padding: 0 0 0 15px;list-style-type: none;}';
        content += '#meta>ul>li>ol>li{margin: 3px 0 0 0}';
        content += '#meta>ul>li>ol>li>span{width: 60px;display: inline-block;text-align: right;font-weight: bold;}';
        content += '#meta>ul>li>ol>li>input{width: 250px;}';

        $("<style />").html(content).appendTo("head");
        content = null;

        $('body').html('<div id="meta"></div><div id="editor"></div><div id="messages"></div>');

        var editor = new JSONEditor(
            document.getElementById("editor"), {
                mode: 'code',
                indentation: 4
            },
            isNotFound ? {
                notFount: true
            } : JSON.parse(data.text)
        );
        editor.aceEditor.setReadOnly(true);

        var menu = $(editor.menu);
        menu.find('.jsoneditor-poweredBy')
            .attr('href', 'https://github.com/ajaxorg/ace/wiki/Default-Keyboard-Shortcuts')
            .html('Def keys')
            .css('color', '#333');

        getOptions(function(options) {
            var isRiak = document.location.pathname.indexOf(options.riakPath) === 0;
            var editable = options.isRiakEnabled === true && isRiak === true;
            if (editable) {
                editor.aceEditor.setReadOnly(false);
            }

            if (isRiak && editable) {
                editor.initAdditionalTools();
            }
        });
    }
}

function getOptions(cb) {
    kango.invokeAsync('kango.storage.getItem', 'options', function(options) {
        if (!options) {
            options = {
                isRiakEnabled: true,
                riakPath: '/riak/'
            };
        }

        cb(options);
    });
}

function extractData(rawText) {
    var tokens, text = rawText.trim();

    function test(text) {
        return ((text.charAt(0) == "[" && text.charAt(text.length - 1) == "]") || (text.charAt(0) == "{" && text.charAt(text.length - 1) == "}"));
    }

    if (test(text)) {
        return {
            text: rawText,
            offset: 0
        };
    }

    tokens = text.match(/^([^\s\(]*)\s*\(([\s\S]*)\)\s*;?$/);
    if (tokens && tokens[1] && tokens[2]) {
        if (test(tokens[2].trim()))
            return {
                fnName: tokens[1],
                text: tokens[2],
                offset: rawText.indexOf(tokens[2])
            };
    }
}

kango.invokeAsync('kango.io.getExtensionFileContents', 'jsoneditor.min.css', function(content) {
    load(content);
});