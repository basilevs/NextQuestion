// ==UserScript==
// @name        HideQuestion
// @namespace   stackexchange
// @description Hides selected questions
// @match       https://stackoverflow.com/*
// @match				https://meta.stackoverflow.com/*
// @match				https://askubuntu.com/*
// @match				https://superuser.com/*
// @match				https://codereview.stackexchange.com/*
// @match				https://stackapps.com/*
// @match				https://*.stackexchange.com/*
// @version     6
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM.log
// ==/UserScript==

var host = location.host;
var questionsKey = host+"_hiddenQuestions";

function log() {
	console.log(...arguments);
}

//log = function (data) {};

async function deserialize(name, def) {
	var value = await GM.getValue(name, JSON.stringify(def));
	try {
		return JSON.parse(value);
	} catch (e) {
		return def;
	}
}

async function serialize(name, val) {
	return await GM.setValue(name, JSON.stringify(val));
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
		log("Xpath: " + expression + " iterated over " + count + " nodes.");
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
	var nodes = xpathToNodeArray(node, './/a[@class="s-link"]/@href');
	if (nodes.length > 0)
		return nodes[0].value;
  throw new Error("Can't exract question link from ", {cause: node});
}



var hiddenIds = deserialize(questionsKey, []);

async function setHidden(id, shouldBeHidden) {
  let hiddenIdsCopy = await hiddenIds;
	var position = hiddenIdsCopy.indexOf(id);
	shouldBeHidden = shouldBeHidden ? true : false;
	log((shouldBeHidden ? "Hide" : "Unhide") + " question: " + id);
	if (shouldBeHidden) {
		if (position < 0) {
			hiddenIdsCopy.push(id);
		}
	} else {
		if (position >= 0) {
			hiddenIdsCopy.splice(position, 1);
		}
	}
	log("Hidden now: " + hiddenIdsCopy);
	if ((hiddenIdsCopy.indexOf(id) >= 0) != shouldBeHidden)
		throw new Error("Question " + id + " status is wrong: " + hiddenIds);
	await serialize(questionsKey, hiddenIdsCopy);
}

async function isHidden(id) {
  let hiddenIdsCopy = await hiddenIds;
	var rv = hiddenIdsCopy.indexOf(id) >= 0;
	return rv;
}

function handleCheckboxUpdate(checkbox) {
	var id = parseInt(checkbox.value);
	setHidden(id, checkbox.checked).catch(console.error);
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
	async function callback(node) {
    log('Detected question ' + node);
		if (!node)
			throw new Error("Null node");
		var url = getQuestionLink(node);
		var id = questionIdByUrl(url);
		if (!id)
			throw new Error("Bad question link: " + url);
		var hide = await isHidden(id);
		if (hide) {
			log("Hiding " + id);
			node.classList.add("tagged-ignored-hidden");
		}
		log(""+id+": " + node.classList);
		function callback2(node) {
			addCheckBox(node, id, hide, handleCheckboxUpdate);
			return true;
		}
		xpathModify(node, ".//h3", callback2);
		return true;
	}
	xpathModify(document, './/div[@data-post-type-id="1"]', callback);
}

async function processCurrentQuestion() {
	var url = location.href;
	var id = questionIdByUrl(url);
	if (!id)
		return;
	var hide = await isHidden(id);
	function handleHeader(node) {
		addCheckBox(node, id, hide, handleCheckboxUpdate);
	}
	xpath(document, '//div[@id="question-header"]/h1', handleHeader);
}

processCurrentQuestion();


window.addEventListener('load', processQuestionList);


