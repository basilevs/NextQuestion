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
// @version     9
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM.log
// ==/UserScript==

var host = location.host;
var questionsKey = host+"_hiddenQuestions";

function log() {
	console.debug(...arguments);
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
// 		log("Xpath: " + expression + " iterated over " + count + " nodes.");
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

function changeQuestionState(id, node, hide) {
  if (!id)
		throw new Error("No id");

	setHidden(id, hide).catch(console.error);
  if (hide) {
    node.classList.add("hide_question_hidden");
  } else {
    node.classList.remove("hide_question_hidden");
  }
  log(id, node, node.classList);
}

function addCheckBox(node, initialState, callback) {
	if (!node)
		throw new Error("No node");
	if (!callback)
		throw new Error("No callback");
	let input = xpathToNodeArray(node, './/input');
  if (!input.length) {
    input = document.createElement("input");
    input.type = "checkbox";
    input.checked = initialState;
    input.title = "Hide this question";
    function callback1(event) {
      callback(event.target);
    }
    input.addEventListener('click', callback1);
    node.insertBefore(input, node.firstChild);
  } else {
    input = input[0];
    input.checked = initialState;
  }
  return input;
}


function processQuestionList() {
	async function callback(node) {
    log('Detected question', node);
		if (!node)
			throw new Error("Null node");
		const url = getQuestionLink(node);
		const id = questionIdByUrl(url);
		if (!id)
			throw new Error("Bad question link: " + url);
		const hide = await isHidden(id);
		function callback2(header) {
			addCheckBox(header, hide, input => changeQuestionState(id, node, input.checked) );
			return true;
		}
		xpathModify(node, ".//h3", callback2);
    changeQuestionState(id, node, hide);
		return true;
	}
	xpathModify(document, './/div[starts-with(@id, "question-summary-")]', callback);
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

processQuestionList();
processCurrentQuestion();

const sheetElement = document.createElement('style');
document.head.appendChild(sheetElement);
const sheet = sheetElement.sheet;
sheet.insertRule('.hide_question_hidden { display: none }');


function installStyleCheckbox() {
	let button_groups = document.getElementsByClassName("s-btn-group");
	if (button_groups) {
    console.info('Buttons are found', button_groups);
    button_groups[0].innerHTML += '<label class="flex--item s-btn"><input type="checkbox" id="hide_question_checkbox" class="s-btn--text">Show hidden</input></label>';
    const checkbox = document.getElementById('hide_question_checkbox');
    checkbox.addEventListener('click', (element) => {
      let disable = checkbox.checked;
			sheet.disabled = disable;
      log(checkbox, disable, sheet);
    });
  }
}

installStyleCheckbox();
