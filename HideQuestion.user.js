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
// @version     10
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



var hiddenIds = deserialize(questionsKey, []).then(x => new Set(x));

async function setHidden(id, shouldBeHidden) {
  let hiddenIdsCopy = await hiddenIds;
	shouldBeHidden = shouldBeHidden ? true : false;
  if (shouldBeHidden == hiddenIdsCopy.has(id)) {
    return;
  }
	log((shouldBeHidden ? "Hide" : "Unhide") + " question: " + id);
	if (shouldBeHidden) {
    hiddenIdsCopy.add(id);
	} else {
    hiddenIdsCopy.delete(id);
	}
	log("Hidden now", hiddenIdsCopy);
	await serialize(questionsKey, hiddenIdsCopy.keys().toArray());
}

async function isHidden(id) {
  let hiddenIdsCopy = await hiddenIds;
	var rv = hiddenIdsCopy.has(id);
	return rv;
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
    input.title = "Hide this question";
    function callback1(event) {
      callback(event.target);
    }
    input.addEventListener('click', callback1);
    node.insertBefore(input, node.firstChild);
  } else {
    input = input[0];
  }
  input.checked = initialState;
  return input;
}

function theOnlyElement(array) {
  if (array.length != 1) {
    throw new Error("Invalid number of elements: " + array.length);
  }
  return array[0];
}


async function processQuestionList() {
  const list = xpathToNodeArray(document, './/div[starts-with(@id, "question-summary-")]')
	for (const node of list) {
		if (!node)
			throw new Error("Null node");
		const url = getQuestionLink(node);
		const id = questionIdByUrl(url);
		if (!id)
			throw new Error("Bad question link: " + url);
		const hide = await isHidden(id);
    function changeQuestionState(hide) {
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
    addCheckBox(theOnlyElement(xpathToNodeArray(node, ".//h3")), hide, input => changeQuestionState(input.checked) );
    changeQuestionState(hide);
  }
}

async function processCurrentQuestion() {
	var url = location.href;
	var id = questionIdByUrl(url);
	if (!id)
		return;
  function changeQuestionState(hide) {
      if (!id)
        throw new Error("No id");
      setHidden(id, hide).catch(console.error);
  }
	const hide = await isHidden(id);
  addCheckBox(theOnlyElement(xpathToNodeArray(document, '//div[@id="question-header"]/h1')), hide, input => changeQuestionState(input.checked));
}

processQuestionList();
processCurrentQuestion();

const sheetElement = document.createElement('style');
document.head.appendChild(sheetElement);
const sheet = sheetElement.sheet;
sheet.insertRule('.hide_question_hidden { display: none }');


function installStyleCheckbox() {
	let button_group = document.getElementsByClassName("s-btn-group");
	if (button_group.length) {
    console.info('Buttons are found', button_group);
    button_group[0].innerHTML += '<label class="flex--item s-btn"><input type="checkbox" id="hide_question_checkbox" class="s-btn--text">Show hidden</input></label>';
    const checkbox = document.getElementById('hide_question_checkbox');
    checkbox.addEventListener('click', (element) => {
      let disable = checkbox.checked;
			sheet.disabled = disable;
      log(checkbox, disable, sheet);
    });
  }
}

installStyleCheckbox();
