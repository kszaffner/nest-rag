// Everything the server or the model returns is untrusted text. It is shown
// only through textContent, so the browser never parses it as HTML and it
// cannot inject markup or scripts (XSS). A test forbids HTML-parsing APIs.
const MAX_QUESTION_LENGTH = 2000; // same limit as the server
const EXAMPLE_QUESTIONS = [
  'How many vacation days do I have and how many can I carry over to next year?',
  'Can I work from Lisbon for three weeks?',
  'I bought a chair for 1200 PLN, how do I get the money back?',
  'I get AUTH-403 when connecting to the VPN, what should I do?',
  'I lost my phone with the Authenticator app, what now?',
];
const FALLBACK_RETRY_SECONDS = 60;

const HTTP_BAD_REQUEST = 400;
const HTTP_PAYLOAD_TOO_LARGE = 413;
const HTTP_TOO_MANY_REQUESTS = 429;

const form = document.getElementById('question-form');
const input = document.getElementById('question-input');
const counter = document.getElementById('character-counter');
const askButton = document.getElementById('ask-button');
const status = document.getElementById('status');
const result = document.getElementById('result');
const answer = document.getElementById('answer');
const warning = document.getElementById('warning');
const details = document.getElementById('details');
const sourceList = document.getElementById('source-list');
const exampleList = document.getElementById('example-list');

function updateCounter() {
  counter.textContent = `${input.value.length} / ${MAX_QUESTION_LENGTH}`;
}

function showStatus(message, isError) {
  status.textContent = message;
  status.className = isError ? 'error' : 'hint';
}

/** Short messages for the user. No technical details from the server. */
function describeFailure(response) {
  switch (response.status) {
    case HTTP_BAD_REQUEST:
      return 'The question is not valid. Check that it is not empty.';
    case HTTP_PAYLOAD_TOO_LARGE:
      return 'The question is too long.';
    case HTTP_TOO_MANY_REQUESTS: {
      const retryAfter =
        Number(response.headers.get('Retry-After')) || FALLBACK_RETRY_SECONDS;
      return `Too many questions. Try again in ${retryAfter} s.`;
    }
    default:
      return 'The answer could not be generated. Try again later.';
  }
}

function formatDetails(data) {
  const parts = [];
  if (data.model) {
    parts.push(`model: ${data.model}`);
  }
  if (data.usage) {
    parts.push(
      `tokens: ${data.usage.inputTokens} in / ${data.usage.outputTokens} out`,
    );
  }
  if (typeof data.estimatedCostInUsd === 'number') {
    parts.push(`cost: about $${data.estimatedCostInUsd.toFixed(5)}`);
  }
  return parts.join(' · ');
}

function renderSources(sources) {
  sourceList.replaceChildren();
  for (const source of sources) {
    const item = document.createElement('li');

    const title = document.createElement('span');
    title.className = 'source-title';
    title.textContent = `${source.sourceId} (similarity ${source.similarity.toFixed(2)})`;

    const text = document.createElement('p');
    text.className = 'source-text';
    text.textContent = source.text;

    item.append(title, text);
    sourceList.append(item);
  }
}

/** Shows what arrives from the stream, one event at a time. */
function handleStreamEvent(eventName, data) {
  switch (eventName) {
    case 'sources':
      answer.textContent = '';
      warning.hidden = true;
      details.textContent = '';
      renderSources(Array.isArray(data.sources) ? data.sources : []);
      result.hidden = false;
      showStatus('Writing the answer...', false);
      break;
    case 'delta':
      answer.textContent += data.text;
      break;
    case 'done':
      warning.hidden = !data.wasTruncated;
      warning.textContent = data.wasTruncated
        ? 'The answer was cut off at the length limit.'
        : '';
      details.textContent = formatDetails(data);
      showStatus('', false);
      break;
    case 'error':
      showStatus('The answer could not be generated. Try again later.', true);
      break;
    default:
      break;
  }
}

/**
 * Splits the text received so far into complete events (they end with an
 * empty line) and returns the rest, which is the beginning of the next one.
 */
function readEvents(buffer, onEvent) {
  const parts = buffer.split('\n\n');
  const unfinishedPart = parts.pop();
  for (const part of parts) {
    let eventName = 'message';
    let dataText = '';
    for (const line of part.split('\n')) {
      if (line.startsWith('event: ')) {
        eventName = line.slice('event: '.length);
      } else if (line.startsWith('data: ')) {
        dataText += line.slice('data: '.length);
      }
    }
    try {
      onEvent(eventName, JSON.parse(dataText));
    } catch {
      // An event that is not valid JSON is ignored.
    }
  }
  return unfinishedPart;
}

async function ask(question) {
  askButton.disabled = true;
  result.hidden = true;
  showStatus('Searching the documents...', false);

  try {
    const response = await fetch('/rag/query/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (!response.ok || !response.body) {
      showStatus(describeFailure(response), true);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer = readEvents(
        buffer + decoder.decode(value, { stream: true }),
        handleStreamEvent,
      );
    }
  } catch {
    showStatus('Cannot reach the server. Check your connection.', true);
  } finally {
    askButton.disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (question.length > 0) {
    void ask(question);
  }
});
input.addEventListener('input', updateCounter);

for (const exampleQuestion of EXAMPLE_QUESTIONS) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = exampleQuestion;
  button.addEventListener('click', () => {
    input.value = exampleQuestion;
    updateCounter();
    void ask(exampleQuestion);
  });
  item.append(button);
  exampleList.append(item);
}
updateCounter();
