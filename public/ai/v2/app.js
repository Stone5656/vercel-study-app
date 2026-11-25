const conversationForm = document.querySelector('#conversation-form');
const conversationTitleInput = document.querySelector('#conversation-title');
const createConversationButton = document.querySelector('#create-conversation');
const conversationStatus = document.querySelector('#conversation-status');
const conversationList = document.querySelector('#conversation-list');
const selectedTitle = document.querySelector('#selected-title');
const selectedUpdatedAt = document.querySelector('#selected-updated-at');
const turnsContent = document.querySelector('#turns-content');
const turnsStatus = document.querySelector('#turns-status');
const turnList = document.querySelector('#turn-list');
const questionForm = document.querySelector('#question-form');
const questionInput = document.querySelector('#question-prompt');
const questionSubmitButton = document.querySelector('#submit-question');
const submitStatus = document.querySelector('#submit-status');
const latestAnswer = document.querySelector('#latest-answer');
const latestAnswerPrompt = document.querySelector('#latest-answer-prompt');
const latestAnswerResponse = document.querySelector('#latest-answer-response');
const latestAnswerCreatedAt = document.querySelector(
  '#latest-answer-created-at',
);

const messages = {
  conversationsLoading: '会話を読み込んでいます。',
  conversationsEmpty: '保存済みの会話はありません。',
  turnsLoading: '履歴を読み込んでいます。',
  turnsEmpty: 'この会話にはまだ質問がありません。',
  disabled: 'AI会話機能は現在利用できません。',
  loadError: '会話データを読み込めませんでした。時間をおいてご確認ください。',
  turnsError: '履歴を読み込めませんでした。時間をおいてご確認ください。',
  invalidTitle: '会話名は空白以外の文字を1〜50文字で入力してください。',
  createError:
    '会話を作成できませんでした。入力内容と接続状態をご確認ください。',
  titleTooLarge: '会話名が長すぎます。短くしてからお試しください。',
  invalidPrompt: '質問は空白以外の文字を1〜2,000文字で入力してください。',
  promptTooLarge: '質問が長すぎます。短くしてからお試しください。',
  submitting: '回答を生成しています。',
  saved: '回答を保存しました。',
  savedHistoryError: '回答は保存されましたが、履歴の更新に失敗しました。',
  timeout:
    '45秒以内に応答がありませんでした。保存結果は不明です。再送せず、履歴を確認してください。',
  uncertain:
    '通信結果を確認できませんでした。保存されている可能性があるため、再送せず履歴を確認してください。',
  invalidSuccess:
    '応答を確認できませんでした。保存されている可能性があるため、再送せず履歴を確認してください。',
  validation: '入力内容を確認してください。',
  invalidJson: '通信内容を確認できませんでした。',
  unsupportedMediaType: '通信形式に問題があります。',
  aiUnavailable: 'AIから回答を取得できませんでした。',
  dbUnavailable: 'データベースを利用できません。履歴を確認してください。',
  conversationNotFound: '会話が見つかりません。会話一覧を更新してください。',
  conversationChanged:
    '会話が更新されました。履歴を確認してから質問してください。',
  internalError: '処理中にエラーが発生しました。時間をおいてお試しください。',
};

const POST_TIMEOUT_MS = 45_000;
const HISTORY_TIMEOUT_MS = 15_000;
const MAX_PROMPT_CODE_POINTS = 2_000;
const MAX_JSON_BYTES = 16_384;

let selectedConversationId = null;
let conversationsRequestId = 0;
let turnsRequestId = 0;
let isCreatingConversation = false;
let isSubmittingQuestion = false;

function setStatus(element, state, message) {
  element.dataset.state = state;
  element.textContent = message;
}

function clearStatus(element) {
  element.textContent = '';
  delete element.dataset.state;
}

function isIsoDate(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isConversation(item) {
  return (
    typeof item === 'object' &&
    item !== null &&
    Number.isSafeInteger(item.id) &&
    item.id > 0 &&
    typeof item.title === 'string' &&
    item.title.trim().length > 0 &&
    isIsoDate(item.createdAt) &&
    isIsoDate(item.updatedAt)
  );
}

function isTurn(item, conversationId) {
  return (
    typeof item === 'object' &&
    item !== null &&
    Number.isSafeInteger(item.id) &&
    item.id > 0 &&
    item.conversationId === conversationId &&
    typeof item.prompt === 'string' &&
    item.prompt.trim().length > 0 &&
    typeof item.response === 'string' &&
    item.response.trim().length > 0 &&
    isIsoDate(item.createdAt)
  );
}

function parseSuccessItems(payload, key, validator, conversationId) {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    payload.success !== true ||
    !Array.isArray(payload[key]) ||
    !payload[key].every((item) => validator(item, conversationId))
  ) {
    throw new Error('invalid API response');
  }
  return payload[key];
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日時不明';
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(date);
}

function renderConversationList(items) {
  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const listItem = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.conversationId = String(item.id);
    button.setAttribute(
      'aria-current',
      String(item.id === selectedConversationId),
    );
    button.disabled = isSubmittingQuestion;

    const title = document.createElement('span');
    title.textContent = item.title;
    const updatedAt = document.createElement('time');
    updatedAt.dateTime = new Date(item.updatedAt).toISOString();
    updatedAt.textContent = formatDate(item.updatedAt);
    button.append(title, updatedAt);
    listItem.append(button);
    fragment.append(listItem);
  }
  conversationList.replaceChildren(fragment);
}

function renderTurns(items) {
  const fragment = document.createDocumentFragment();
  for (const item of items.slice(-20)) {
    const listItem = document.createElement('li');
    listItem.className = 'turn-card';
    const prompt = document.createElement('h3');
    prompt.textContent = item.prompt;
    const response = document.createElement('p');
    response.className = 'answer';
    response.textContent = item.response;
    const createdAt = document.createElement('time');
    createdAt.dateTime = new Date(item.createdAt).toISOString();
    createdAt.textContent = formatDate(item.createdAt);
    listItem.append(prompt, response, createdAt);
    fragment.append(listItem);
  }
  turnList.replaceChildren(fragment);
}

class UiApiError extends Error {
  constructor(status, code, parsed) {
    super('API request failed');
    this.status = status;
    this.code = code;
    this.parsed = parsed;
  }
}

class UiTimeoutError extends Error {}

class UiNetworkError extends Error {}

async function requestJson(
  url,
  options = {},
  expectedStatus = 200,
  timeoutMs = HISTORY_TIMEOUT_MS,
) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    let response;
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
    } catch {
      if (timedOut) throw new UiTimeoutError();
      throw new UiNetworkError();
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new UiApiError(response.status, null, false);
    }

    const code =
      typeof payload?.error?.code === 'string' ? payload.error.code : null;
    if (response.status === 503 && code === 'DEMO_DISABLED') {
      throw new UiApiError(response.status, code, true);
    }
    if (response.status !== expectedStatus) {
      throw new UiApiError(response.status, code, true);
    }
    return payload;
  } catch (error) {
    if (timedOut) throw new UiTimeoutError();
    if (error instanceof UiApiError || error instanceof UiTimeoutError) {
      throw error;
    }
    throw new UiNetworkError();
  } finally {
    clearTimeout(timer);
  }
}

function apiErrorMessage(error) {
  if (!(error instanceof UiApiError)) return null;
  if (error.code === 'DEMO_DISABLED' && error.status === 503) {
    return messages.disabled;
  }
  const known = {
    VALIDATION_ERROR: [400, messages.validation],
    INVALID_JSON: [400, messages.invalidJson],
    PAYLOAD_TOO_LARGE: [413, messages.promptTooLarge],
    UNSUPPORTED_MEDIA_TYPE: [415, messages.unsupportedMediaType],
    AI_UNAVAILABLE: [502, messages.aiUnavailable],
    DB_UNAVAILABLE: [503, messages.dbUnavailable],
    CONVERSATION_NOT_FOUND: [404, messages.conversationNotFound],
    CONVERSATION_CHANGED: [409, messages.conversationChanged],
    INTERNAL_ERROR: [500, messages.internalError],
  };
  const entry = known[error.code];
  return entry && entry[0] === error.status ? entry[1] : null;
}

async function loadTurns(conversationId, options = {}) {
  const requestId = ++turnsRequestId;
  turnsContent.setAttribute('aria-busy', 'true');
  turnList.replaceChildren();
  setStatus(turnsStatus, 'loading', messages.turnsLoading);

  try {
    const payload = await requestJson(
      `/api/ai/v2/conversations/${conversationId}/turns`,
      {},
      200,
      HISTORY_TIMEOUT_MS,
    );
    const items = parseSuccessItems(payload, 'items', isTurn, conversationId);
    if (
      requestId !== turnsRequestId ||
      selectedConversationId !== conversationId
    ) {
      return;
    }
    if (items.length === 0) {
      setStatus(turnsStatus, 'empty', messages.turnsEmpty);
    } else {
      renderTurns(items);
      clearStatus(turnsStatus);
    }
    return true;
  } catch (error) {
    if (
      requestId !== turnsRequestId ||
      selectedConversationId !== conversationId
    ) {
      return;
    }
    turnList.replaceChildren();
    setStatus(
      turnsStatus,
      options.afterSave
        ? 'warning'
        : error.code === 'DEMO_DISABLED'
          ? 'disabled'
          : 'error',
      options.afterSave
        ? messages.savedHistoryError
        : error.code === 'DEMO_DISABLED'
          ? messages.disabled
          : messages.turnsError,
    );
    return false;
  } finally {
    if (requestId === turnsRequestId) {
      turnsContent.setAttribute('aria-busy', 'false');
    }
  }
}

function selectConversation(conversation) {
  selectedConversationId = conversation.id;
  questionInput.disabled = isSubmittingQuestion;
  questionSubmitButton.disabled = isSubmittingQuestion;
  selectedTitle.textContent = conversation.title;
  selectedUpdatedAt.dateTime = new Date(conversation.updatedAt).toISOString();
  selectedUpdatedAt.textContent = formatDate(conversation.updatedAt);
  renderConversationList(currentConversations);
  void loadTurns(conversation.id);
}

let currentConversations = [];

async function loadConversations(preferredId = null) {
  const requestId = ++conversationsRequestId;
  setStatus(conversationStatus, 'loading', messages.conversationsLoading);
  try {
    const payload = await requestJson('/api/ai/v2/conversations');
    const items = parseSuccessItems(payload, 'items', isConversation);
    if (requestId !== conversationsRequestId) return;
    currentConversations = items;
    const chosen =
      items.find((item) => item.id === preferredId) ??
      items.find((item) => item.id === selectedConversationId) ??
      items[0] ??
      null;
    selectedConversationId = chosen?.id ?? null;
    questionInput.disabled =
      selectedConversationId === null || isSubmittingQuestion;
    questionSubmitButton.disabled =
      selectedConversationId === null || isSubmittingQuestion;
    renderConversationList(items);
    if (chosen) {
      selectedTitle.textContent = chosen.title;
      selectedUpdatedAt.dateTime = new Date(chosen.updatedAt).toISOString();
      selectedUpdatedAt.textContent = formatDate(chosen.updatedAt);
      clearStatus(conversationStatus);
      await loadTurns(chosen.id);
    } else {
      selectedTitle.textContent = '会話を選択してください';
      selectedUpdatedAt.textContent = '';
      selectedUpdatedAt.removeAttribute('datetime');
      turnsRequestId += 1;
      turnsContent.setAttribute('aria-busy', 'false');
      turnList.replaceChildren();
      setStatus(turnsStatus, 'empty', '会話を選択してください。');
      setStatus(conversationStatus, 'empty', messages.conversationsEmpty);
    }
  } catch (error) {
    if (requestId !== conversationsRequestId) return;
    renderConversationList([]);
    setStatus(
      conversationStatus,
      error.code === 'DEMO_DISABLED' ? 'disabled' : 'error',
      error.code === 'DEMO_DISABLED' ? messages.disabled : messages.loadError,
    );
  }
}

conversationList.addEventListener('click', (event) => {
  if (isSubmittingQuestion) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest('button[data-conversation-id]');
  if (!button) return;
  const id = Number(button.dataset.conversationId);
  const conversation = currentConversations.find((item) => item.id === id);
  if (conversation) selectConversation(conversation);
});

conversationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isCreatingConversation || isSubmittingQuestion) return;

  const title = conversationTitleInput.value.trim();
  const length = Array.from(title).length;
  if (length < 1 || length > 50) {
    setStatus(conversationStatus, 'error', messages.invalidTitle);
    return;
  }
  const body = JSON.stringify({ title });
  if (new TextEncoder().encode(body).byteLength > 16_384) {
    setStatus(conversationStatus, 'error', messages.titleTooLarge);
    return;
  }

  isCreatingConversation = true;
  createConversationButton.disabled = true;
  conversationTitleInput.disabled = true;
  setStatus(conversationStatus, 'loading', '会話を作成しています。');
  try {
    const payload = await requestJson(
      '/api/ai/v2/conversations',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
      201,
    );
    if (payload?.success !== true || !isConversation(payload.item)) {
      throw new UiApiError(201, null, false);
    }

    conversationTitleInput.value = '';
    await loadConversations(payload.item.id);
  } catch (error) {
    setStatus(
      conversationStatus,
      error.code === 'DEMO_DISABLED' ? 'disabled' : 'error',
      error.code === 'DEMO_DISABLED'
        ? messages.disabled
        : (apiErrorMessage(error) ?? messages.createError),
    );
  } finally {
    isCreatingConversation = false;
    createConversationButton.disabled = false;
    conversationTitleInput.disabled = isSubmittingQuestion;
  }
});

function renderLatestAnswer(item) {
  latestAnswerPrompt.textContent = item.prompt;
  latestAnswerResponse.textContent = item.response;
  latestAnswerCreatedAt.dateTime = new Date(item.createdAt).toISOString();
  latestAnswerCreatedAt.textContent = formatDate(item.createdAt);
  latestAnswer.hidden = false;
}

function setSubmitting(isSubmitting) {
  isSubmittingQuestion = isSubmitting;
  questionInput.disabled = isSubmitting || selectedConversationId === null;
  questionSubmitButton.disabled =
    isSubmitting || selectedConversationId === null;
  conversationTitleInput.disabled = isSubmitting || isCreatingConversation;
  createConversationButton.disabled = isSubmitting || isCreatingConversation;
  for (const button of conversationList.querySelectorAll('button')) {
    button.disabled = isSubmitting;
  }
}

function validatePrompt(value) {
  if (typeof value !== 'string') return null;
  const prompt = value.trim();
  const codePoints = Array.from(prompt).length;
  if (codePoints < 1 || codePoints > MAX_PROMPT_CODE_POINTS) return null;
  const body = JSON.stringify({ prompt });
  if (new TextEncoder().encode(body).byteLength > MAX_JSON_BYTES) return null;
  return { prompt, body };
}

questionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isSubmittingQuestion || selectedConversationId === null) return;

  const validated = validatePrompt(questionInput.value);
  if (!validated) {
    setStatus(submitStatus, 'error', messages.invalidPrompt);
    return;
  }

  const conversationId = selectedConversationId;
  setSubmitting(true);
  setStatus(submitStatus, 'loading', messages.submitting);

  try {
    const payload = await requestJson(
      `/api/ai/v2/conversations/${conversationId}/turns`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: validated.body,
      },
      201,
      POST_TIMEOUT_MS,
    );
    if (
      payload?.success !== true ||
      !isTurn(payload.item, conversationId) ||
      payload.item.prompt !== validated.prompt
    ) {
      throw new UiApiError(201, null, false);
    }

    renderLatestAnswer(payload.item);
    questionInput.value = '';
    setStatus(submitStatus, 'success', messages.saved);
    const historyRefreshed = await loadTurns(conversationId, {
      afterSave: true,
    });
    if (!historyRefreshed) {
      setStatus(submitStatus, 'warning', messages.savedHistoryError);
    }
  } catch (error) {
    let message;
    if (error instanceof UiTimeoutError) {
      message = messages.timeout;
    } else if (error instanceof UiNetworkError) {
      message = messages.uncertain;
    } else if (error instanceof UiApiError && error.status === 201) {
      message = messages.invalidSuccess;
    } else {
      message = apiErrorMessage(error) ?? messages.uncertain;
    }
    setStatus(
      submitStatus,
      error.code === 'DEMO_DISABLED' ? 'disabled' : 'error',
      message,
    );
  } finally {
    setSubmitting(false);
  }
});

questionInput.disabled = selectedConversationId === null;
questionSubmitButton.disabled = selectedConversationId === null;

void loadConversations();
