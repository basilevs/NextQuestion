// ==UserScript==
// @name        HideQuestion
// @namespace   stackexchange
// @description Hides selected questions
// @include     http://stackoverflow.com*
// @include     http://meta.stackoverflow.com*
// @include		http://askubuntu.com*
// @include		http://superuser.com*
// @include		http://codereview.stackexchange.com*
// @include		http://stackapps.com*
// @include	http://*.stackexchange.com*
// @version     4
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_log
// ==/UserScript==

var host = location.host;
var questionsKey = host+"_hiddenQuestions";

function log(line) {
	GM_log(line);
}

log = function (data) {};

function deserialize(name, def) {
		var value = GM_getValue(name, (def || '({})'))
    return JSON.parse(value);
}

function serialize(name, val) {
	GM_setValue(name, JSON.stringify(val));
}

var urlIdRegEx = /\/(\d+)\//;
function questionIdByUrl(url) {
    var result = urlIdRegEx.exec(url);
    if (result)
        return parseInt(result[1]);
    return null;
}

function xpath(context, expression, callback) {
    //log("Performing Xpath: " + expression);
    var i = document.evaluate(expression, context, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE , null);
    if (!i)
        throw new Error("Invalid query: "+expression);
    var data;
	var count = 0;
	try {
		while (data = i.iterateNext()) {
			count++;
			if (!callback(data))
				return;
		}
	} finally {
		//log("Xpath: " + expression + " iterated over " + count + " nodes.");
	}
}

function xpathToNodeArray(context, expression) {
	var rv = [];
	function callback(node) {
		if (node)
			rv.push(node);
		return true;
	}
	xpath(context, expression, callback);
	return rv;
}

function xpathModify(context, expression, callback) {
	var nodes = xpathToNodeArray(context, expression);
	for (var i in nodes) {
		if (!callback(nodes[i]))
			return;
	}
}

function getQuestionLink(node) {
	var nodes = xpathToNodeArray(node, './/a[@class="question-hyperlink"]/@href');
	if (nodes.length > 0)
		return nodes[0].value;
	return null;
}



var hiddenIds = deserialize(questionsKey, []);

function setHidden(id, shouldBeHidden) {
	var position = hiddenIds.indexOf(id);
	shouldBeHidden = shouldBeHidden ? true : false;
	log((shouldBeHidden ? "Hide" : "Unhide") + " question: " + id);
	if (shouldBeHidden) {
		if (position < 0) {
			hiddenIds.push(id);
		}
	} else {
		if (position >= 0) {
			hiddenIds.splice(position, 1);
		}
	}
	log("Hidden now: " + hiddenIds);
	if (isHidden(id) != shouldBeHidden)
		throw new Error("Question " + id + " status is wrong: " + hiddenIds);
	serialize(questionsKey, hiddenIds);
}

function isHidden(id) {
	var rv = (hiddenIds.indexOf(id) >= 0);
	return rv;
}

function handleCheckboxUpdate(checkbox) {
	var id = parseInt(checkbox.value);
	setHidden(id, checkbox.checked);
}

function addCheckBox(node, id, initialState, callback) {
	if (!node)
		throw new Error("No node");
	if (!id)
		throw new Error("No id");
	if (!callback)
		throw new Error("No callback");
	var input = document.createElement("input");
	input.type = "checkbox";
	input.value = parseInt(id);
	input.checked = initialState;
	input.title = "Hide this question";
	function callback1(event) {
		callback(event.target);
	}
	input.addEventListener('click', callback1);
	node.insertBefore(input, node.firstChild);
}


function processQuestionList() {
	function callback(node) {
		if (!node)
			throw new Error("Null node");
		var url = getQuestionLink(node);
		if (!url)
			return;
		var id = questionIdByUrl(url);
		if (!id)
			throw new Error("Bad question link: " + url);
		var hide = isHidden(id);
		if (hide) {
			log("Hiding " + id);
			node.classList.add("tagged-ignored-hidden");
		}
		//log(""+id+": " + node.classList);
		function callback2(node) {
			addCheckBox(node, id, hide, handleCheckboxUpdate);
			return true;
		}
		xpathModify(node, ".//h3", callback2);
		return true;
	}
	xpathModify(document, './/div[contains(@class, "question-summary")]', callback);
}

function processCurrentQuestion() {
	var url = location.href;
	var id = questionIdByUrl(url);
	if (!id)
		return;
	var hide = isHidden(id);
	function handleHeader(node) {
		addCheckBox(node, id, hide, handleCheckboxUpdate);
	}
	xpath(document, '//div[@id="question-header"]/h1', handleHeader);
}

processCurrentQuestion();


window.addEventListener('load', processQuestionList);


