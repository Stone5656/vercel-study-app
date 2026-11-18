const historyStatus = document.querySelector('#history-status');
const historyContent = document.querySelector('#history-content');
const historyList = document.querySelector('#history-list');
const questionForm = document.querySelector('#question-form');
const promptInput = document.querySelector('#prompt');
const submitButton = questionForm.querySelector('button[type="submit"]');
const submitStatus = document.querySelector('#submit-status');
const answerPanel = document.querySelector('#answer-panel');
const answerPrompt = document.querySelector('#answer-prompt');
const answerResponse = document.querySelector('#answer-response');
const answerCreatedAt = document.querySelector('#answer-created-at');

const messages = {
  loading: '履歴を読み込んでいます',
  empty: '履歴がありません',
  historyError: '履歴を読み込めませんでした。時間をおいてご確認ください。',
  disabled: 'AI質問機能は現在利用できません。',
  validation: '質問は空白以外の文字を1〜2,000文字で入力してください。',
  payloadTooLarge: '質問が長すぎます。短くしてから送信してください。',
  invalidJson:
    '通信内容を確認できませんでした。入力を確認して再度操作してください。',
  unsupportedMediaType:
    '通信形式に問題があります。時間をおいて再度お試しください。',
  aiUnavailable:
    'AIから回答を取得できませんでした。入力内容を確認して再度お試しください。',
  dbUnavailable:
    'データベースを利用できません。時間をおいてから履歴を確認してください。',
  internalError:
    '処理中にエラーが発生しました。時間をおいてから履歴を確認してください。',
  requestError:
    '通信結果を確認できませんでした。履歴を確認してから次の操作をしてください。',
  timeout:
    '応答が45秒以内に届きませんでした。保存結果は不明です。再送せず、履歴を確認してください。',
  invalidSuccess:
    '応答を確認できませんでした。保存されている可能性があるため、履歴を確認してください。',
  savedHistoryError: '回答は保存されましたが、履歴の更新に失敗しました。',
};

const apiErrorMessages = {
  VALIDATION_ERROR: { status: 400, message: messages.validation },
  INVALID_JSON: { status: 400, message: messages.invalidJson },
  PAYLOAD_TOO_LARGE: { status: 413, message: messages.payloadTooLarge },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    message: messages.unsupportedMediaType,
  },
  AI_UNAVAILABLE: { status: 502, message: messages.aiUnavailable },
  DB_UNAVAILABLE: { status: 503, message: messages.dbUnavailable },
  DEMO_DISABLED: { status: 503, message: messages.disabled },
  INTERNAL_ERROR: { status: 500, message: messages.internalError },
};

const ASK_TIMEOUT_MS = 45_000;
const MAX_PROMPT_CODE_POINTS = 2_000;
const MAX_JSON_BYTES = 16_384;

class SafeUiError extends Error {}

let isSubmitting = false;
let historyRequestId = 0;
let historyController;

function setHistoryLoading(isLoading) {
  historyContent.setAttribute('aria-busy', String(isLoading));
  if (isLoading) {
    historyStatus.dataset.state = 'loading';
    historyStatus.textContent = messages.loading;
  } else if (historyStatus.dataset.state === 'loading') {
    historyStatus.textContent = '';
    delete historyStatus.dataset.state;
  }
}

function renderEmptyHistory() {
  historyList.replaceChildren();
  historyStatus.dataset.state = 'empty';
  historyStatus.textContent = messages.empty;
}

function renderHistoryError(state = 'error') {
  historyList.replaceChildren();
  historyStatus.dataset.state = state;
  historyStatus.textContent =
    state === 'disabled' ? messages.disabled : messages.historyError;
}

function isHistoryItem(item) {
  return (
    typeof item === 'object' &&
    item !== null &&
    Number.isSafeInteger(item.id) &&
    item.id > 0 &&
    typeof item.prompt === 'string' &&
    item.prompt.trim().length > 0 &&
    typeof item.response === 'string' &&
    item.response.trim().length > 0 &&
    typeof item.createdAt === 'string' &&
    item.createdAt.length > 0
  );
}

function formatCreatedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '日時不明';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(date);
}

function renderHistory(items) {
  const fragment = document.createDocumentFragment();

  for (const item of items.slice(0, 20)) {
    const listItem = document.createElement('li');
    listItem.className = 'history-item';

    const promptHeading = document.createElement('h3');
    promptHeading.textContent = item.prompt;

    const response = document.createElement('p');
    response.className = 'answer';
    response.textContent = item.response;

    const createdAt = document.createElement('time');
    const date = new Date(item.createdAt);
    if (!Number.isNaN(date.getTime())) {
      createdAt.dateTime = date.toISOString();
    }
    createdAt.textContent = formatCreatedAt(item.createdAt);

    listItem.append(promptHeading, response, createdAt);
    fragment.append(listItem);
  }

  historyList.replaceChildren(fragment);
  historyStatus.textContent = '';
  delete historyStatus.dataset.state;
}

async function fetchHistory(signal) {
  const response = await fetch('/api/ai/history', {
    headers: { Accept: 'application/json' },
    signal,
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Invalid history response');
  }

  if (
    response.status === 503 &&
    typeof payload === 'object' &&
    payload !== null &&
    payload.success === false &&
    payload.error?.code === 'DEMO_DISABLED'
  ) {
    return { kind: 'disabled' };
  }

  if (!response.ok) {
    throw new Error('History request failed');
  }

  if (
    typeof payload !== 'object' ||
    payload === null ||
    payload.success !== true ||
    !Array.isArray(payload.items) ||
    !payload.items.every(isHistoryItem)
  ) {
    throw new Error('Invalid history response');
  }

  return { kind: 'success', items: payload.items.slice(0, 20) };
}

async function refreshHistory() {
  const requestId = ++historyRequestId;
  historyController?.abort();
  const controller = new AbortController();
  historyController = controller;
  setHistoryLoading(true);

  try {
    const result = await fetchHistory(controller.signal);
    if (requestId !== historyRequestId) {
      return false;
    }

    if (result.kind === 'disabled') {
      renderHistoryError('disabled');
      return false;
    }

    if (result.items.length === 0) {
      renderEmptyHistory();
    } else {
      renderHistory(result.items);
    }
    return true;
  } catch {
    if (requestId === historyRequestId) {
      renderHistoryError();
    }
    return false;
  } finally {
    if (requestId === historyRequestId) {
      setHistoryLoading(false);
      historyController = undefined;
    }
  }
}

function validatePrompt(value) {
  if (typeof value !== 'string') {
    return { ok: false, message: messages.validation };
  }

  const prompt = value.trim();
  const codePointLength = Array.from(prompt).length;
  if (codePointLength < 1 || codePointLength > MAX_PROMPT_CODE_POINTS) {
    return { ok: false, message: messages.validation };
  }

  const body = JSON.stringify({ prompt });
  if (new TextEncoder().encode(body).byteLength > MAX_JSON_BYTES) {
    return { ok: false, message: messages.payloadTooLarge };
  }

  return { ok: true, prompt, body };
}

function setSubmitting(submitting) {
  isSubmitting = submitting;
  submitButton.disabled = submitting;
  questionForm.setAttribute('aria-busy', String(submitting));
}

function renderSubmitStatus(message, state = 'error') {
  submitStatus.dataset.state = state;
  submitStatus.textContent = message;
}

function renderAnswer(item) {
  answerPrompt.textContent = item.prompt;
  answerResponse.textContent = item.response;

  const date = new Date(item.createdAt);
  answerCreatedAt.textContent = formatCreatedAt(item.createdAt);
  if (Number.isNaN(date.getTime())) {
    answerCreatedAt.removeAttribute('datetime');
  } else {
    answerCreatedAt.dateTime = date.toISOString();
  }

  answerPanel.hidden = false;
}

function isAskItem(item) {
  return (
    typeof item === 'object' &&
    item !== null &&
    Number.isSafeInteger(item.id) &&
    item.id > 0 &&
    typeof item.prompt === 'string' &&
    typeof item.response === 'string' &&
    item.response.trim().length > 0 &&
    typeof item.createdAt === 'string' &&
    item.createdAt.length > 0 &&
    !Number.isNaN(new Date(item.createdAt).getTime())
  );
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function getApiErrorMessage(status, payload) {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    payload.success !== false ||
    typeof payload.error !== 'object' ||
    payload.error === null ||
    typeof payload.error.code !== 'string'
  ) {
    return messages.requestError;
  }

  const knownError = apiErrorMessages[payload.error.code];
  return knownError?.status === status
    ? knownError.message
    : messages.requestError;
}

async function askQuestion(prompt, body, signal) {
  const response = await fetch('/api/ai/ask', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body,
    signal,
  });

  if (response.status !== 201) {
    const payload = await readJson(response);
    throw new SafeUiError(getApiErrorMessage(response.status, payload));
  }

  const payload = await readJson(response);
  if (
    typeof payload !== 'object' ||
    payload === null ||
    payload.success !== true ||
    !isAskItem(payload.item)
  ) {
    throw new SafeUiError(messages.invalidSuccess);
  }

  return payload.item;
}

async function handleSubmit(event) {
  event.preventDefault();
  if (isSubmitting) {
    return;
  }

  const validated = validatePrompt(promptInput.value);
  if (!validated.ok) {
    renderSubmitStatus(validated.message);
    return;
  }

  setSubmitting(true);
  renderSubmitStatus('回答を生成しています', 'loading');
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ASK_TIMEOUT_MS);

  try {
    const item = await askQuestion(
      validated.prompt,
      validated.body,
      controller.signal,
    );
    window.clearTimeout(timeoutId);
    renderAnswer(item);
    promptInput.value = '';

    const historyUpdated = await refreshHistory();
    if (historyUpdated) {
      renderSubmitStatus('回答を保存しました。', 'success');
    } else {
      renderSubmitStatus(messages.savedHistoryError, 'warning');
    }
  } catch (error) {
    if (timedOut) {
      renderSubmitStatus(messages.timeout);
    } else if (error instanceof SafeUiError) {
      renderSubmitStatus(error.message);
    } else {
      renderSubmitStatus(messages.requestError);
    }
  } finally {
    window.clearTimeout(timeoutId);
    setSubmitting(false);
  }
}

questionForm.addEventListener('submit', handleSubmit);
document.addEventListener('DOMContentLoaded', refreshHistory, { once: true });
