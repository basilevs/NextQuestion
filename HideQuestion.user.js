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
// @version     14
// @grant       GM.getValue
// @grant       GM.setValue
// @grant       GM.log
// ==/UserScript==

const host = location.host;
const questionsKey = host+"_hiddenQuestions";

function log() {
	console.debug(...arguments);
}

//log = function (data) {};

async function deserialize(name, def) {
	const value = await GM.getValue(name, JSON.stringify(def));
	try {
		return JSON.parse(value);
	} catch (e) {
		return def;
	}
}

async function serialize(name, val) {
	return await GM.setValue(name, JSON.stringify(val));
}

// Possible question URLs:
// - /questions/66484366/how-to-run-git-commands-in-eclipse?r=2
// - /staging-ground/79669973?r=2

const urlIdRegEx = /\/(\d+)[\/?]/;
function questionIdByUrl(url) {
    const result = urlIdRegEx.exec(url);
    if (result)
        return parseInt(result[1]);
    return null;
}

function xpath(context, expression, callback) {
    //log("Performing Xpath: " + expression);
    const i = document.evaluate(expression, context, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE , null);
    if (!i)
        throw new Error("Invalid query: "+expression);
    let data;
	let count = 0;
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
	const rv = [];
	function callback(node) {
		if (node)
			rv.push(node);
		return true;
	}
	xpath(context, expression, callback);
	return rv;
}

function xpathModify(context, expression, callback) {
	const nodes = xpathToNodeArray(context, expression);
	for (let i in nodes) {
		if (!callback(nodes[i]))
			return;
	}
}

function getQuestionLink(node) {
	const nodes = xpathToNodeArray(node, './/a[@class="s-link"]/@href');
	if (nodes.length > 0)
		return nodes[0].value;
  throw new Error("Can't exract question link from ", {cause: node});
}



const hiddenIds = deserialize(questionsKey, []).then(x => new Set(x));

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
	const rv = hiddenIdsCopy.has(id);
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
      node.classList.toggle("hide_question_hidden", hide);
      log(id, node, node.classList);
    }
    addCheckBox(theOnlyElement(xpathToNodeArray(node, ".//h3")), hide, input => changeQuestionState(input.checked) );
    changeQuestionState(hide);
  }
}

async function processCurrentQuestion() {
	const url = location.href;
	const id = questionIdByUrl(url);
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
  const button_group = document.querySelector(".s-btn-group");
  if (!button_group) return;
  console.info("Buttons are found", button_group);
  const label = document.createElement("label");
  label.className = "flex--item s-btn";
  const checkbox = addCheckBox(label, false, (input) => {
    const disable = input.checked;
    sheet.disabled = disable;
    log("Toggled stylesheet", { disable, sheet });
  });
  checkbox.className = "s-btn--text";
  checkbox.title = "";
  label.appendChild(document.createTextNode("Show hidden"));
  button_group.appendChild(label);
}

installStyleCheckbox();
