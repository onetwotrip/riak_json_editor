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

var cur_request;
var riak_headers;
var cur_links;
var editor;

function extractData(rawText) {
	var tokens, text = rawText.trim();

	function test(text) {
		return ((text.charAt(0) == "[" && text.charAt(text.length - 1) == "]") || (text.charAt(0) == "{" && text.charAt(text.length - 1) == "}"));
	}

	if (test(text)){
		return {
			text : rawText,
			offset : 0
		};
	}

	tokens = text.match(/^([^\s\(]*)\s*\(([\s\S]*)\)\s*;?$/);
	if(tokens && tokens[1] && tokens[2]) {
		if(test(tokens[2].trim()))
			return {
				fnName : tokens[1],
				text : tokens[2],
				offset : rawText.indexOf(tokens[2])
			};
	}
}

var refreshJSON = function(ev, type){
	var settings = {
		success: function(err, data, res){
			updateEditor(err, data, res, type || 'update');
		},
		url: document.URL,
		type: 'GET'
	};

    cur_request = $.ajax(settings);
};

function setError(text, err){
	var errors = $("#errors");
	var cl = 'updated';
	if(err){
		cl += '_err';
	}
	errors.html(text).addClass(cl);
	setTimeout(function(){
		errors.removeClass(cl);
	}, 2000);
}

function updateEditor(err, data, res, type){
	if(res.status == 200){
		var headers = cur_request.getAllResponseHeaders();

		riak_headers = {};

		headers.toString().split('\n').forEach(function(h){
			var keyVal = h.split(':');

			if(keyVal[0].toLowerCase().indexOf('x-riak') === 0){
				riak_headers[keyVal[0].toLowerCase()] = res.getResponseHeader(keyVal[0]);
			}
		});

		cur_links = res.getResponseHeader('Link');

		var parsed = JSON.parse(res.responseText);
		editor.set(parsed);

		setError('Last ' + type + ' ' + new Date());
	}
	else if(res.status == 304){
		setError('Not modified');
	}
}

function postDATA(){
	var curJSON = editor.getText();
	var stringifyedData;

	try{
		parsedJSON = JSON.parse(curJSON);
		stringifyedData = JSON.stringify(parsedJSON);
	}
	catch(err){
		setError('Error while parse JSON', true);
		return;
	}

	var settings = {
		contentType: "application/json",
		success: function(){
			refreshJSON(null, 'save');
		},
		url: document.URL,
		data: stringifyedData,
		type: 'PUT',
		headers: {
			'Link': cur_links
		}
	};

	if(riak_headers){
		for(var h in riak_headers){
			settings.headers[h] = riak_headers[h];
		}
	}

	$.ajax(settings);
}

function getOptions(callback){
	kango.invokeAsync('kango.storage.getItem', 'options', function(options){
		if(!options){
			options = {
				isRiakEnabled: true,
				riakPath: '/riak/'
			};
		}

		callback(options);
	});
}

function showEditor(isRiak, dataText, editEnabled){
	var html = '<div class="editor" id="editor" style="height: 95%"></div>';
	html += '<div id="errors"></div>';

	$('body').html(html);

	editor = new JSONEditor(
		document.getElementById("editor"),
		{mode: 'code', indentation: 4},
		dataText
	);

	var menu = $(editor.menu);
	menu.find('.jsoneditor-format').hide();
	menu.find('.jsoneditor-compact').hide();

	if(!editEnabled){
		editor.aceEditor.setReadOnly(true);
	}

	if(isRiak === true){
		var save = document.createElement('button');
		save.innerHTML = 'Save';
		save.onclick = postDATA;
		save.style.width = '100px';
		save.style.background = '#18F776';
		save.style.color ='#000';
		save.style.fontWeight = 'bold';
		var get = document.createElement('button');
		get.innerHTML = 'Get data from RIAK';
		get.onclick = refreshJSON;
		get.style.width = '150px';
		get.style.background = '#fff';
		get.style.color ='#000';
		menu.append(save);
		menu.append(get);
	}
	else {
		//editor.setSize(null, '97%');
	}
}

function load(content, options){
	var child, data;

	if(document.body && (document.body.childNodes[0] && document.body.childNodes[0].tagName == "PRE" ||
			document.body.children.length === 0)){

		child = document.body.children.length ? document.body.childNodes[0] : document.body;
		data = extractData(child.innerText);

		var isNotFound = child.innerText.indexOf('not found') === 0;
		var isRiak = document.location.pathname.indexOf(options.riakPath) === 0;

		if(data || isNotFound){
			$("<style />").html(content).appendTo("head");

			var dataText;

			if(!isNotFound){
				dataText = JSON.parse(data.text);
			}
			else {
				dataText = {notFount: true};
			}

			if(options.isRiakEnabled === true && isRiak === true){
				showEditor(isRiak, dataText, true);
			}
			else {
				showEditor(isRiak, dataText, false);
			}
		}
	}
}

setTimeout(function(){
	kango.invokeAsync('kango.io.getExtensionFileContents', 'jsoneditor.min.css', function(content){
		content = content.replace(/background[\-image]*:url\(img\/jsoneditor-icons\.svg\)[^;}]*[;]?/g, '');
		content += '#editor div.jsoneditor-menu{text-align: center;}';
		content += '#editor div.jsoneditor-menu>button{float: none;margin: 0 10px}';
		content += '#errors{transition: all 3s;text-align: center;}#errors.updated{background: #18F776;}#errors.updated_err{background: rgb(251, 96, 85);}';
		getOptions(function(options){
			load(content, options);
		});
	});
}, 100);
