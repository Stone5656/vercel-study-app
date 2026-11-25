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
};

let selectedConversationId = null;
let conversationsRequestId = 0;
let turnsRequestId = 0;
let isCreatingConversation = false;

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

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('invalid API response');
  }

  if (response.status === 503 && payload?.error?.code === 'DEMO_DISABLED') {
    const error = new Error('disabled');
    error.code = 'DEMO_DISABLED';
    throw error;
  }
  if (response.status !== 200) throw new Error('request failed');
  return payload;
}

async function loadTurns(conversationId) {
  const requestId = ++turnsRequestId;
  turnsContent.setAttribute('aria-busy', 'true');
  turnList.replaceChildren();
  setStatus(turnsStatus, 'loading', messages.turnsLoading);

  try {
    const payload = await fetchJson(
      `/api/ai/v2/conversations/${conversationId}/turns`,
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
      error.code === 'DEMO_DISABLED' ? 'disabled' : 'error',
      error.code === 'DEMO_DISABLED' ? messages.disabled : messages.turnsError,
    );
  } finally {
    if (requestId === turnsRequestId) {
      turnsContent.setAttribute('aria-busy', 'false');
    }
  }
}

function selectConversation(conversation) {
  selectedConversationId = conversation.id;
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
    const payload = await fetchJson('/api/ai/v2/conversations');
    const items = parseSuccessItems(payload, 'items', isConversation);
    if (requestId !== conversationsRequestId) return;
    currentConversations = items;
    const chosen =
      items.find((item) => item.id === preferredId) ??
      items.find((item) => item.id === selectedConversationId) ??
      items[0] ??
      null;
    selectedConversationId = chosen?.id ?? null;
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
  if (isCreatingConversation) return;

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
  setStatus(conversationStatus, 'loading', '会話を作成しています。');
  try {
    const response = await fetch('/api/ai/v2/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error('create failed');
    }
    if (
      response.status !== 201 ||
      payload?.success !== true ||
      !isConversation(payload.item)
    ) {
      if (response.status === 503 && payload?.error?.code === 'DEMO_DISABLED') {
        setStatus(conversationStatus, 'disabled', messages.disabled);
      } else {
        setStatus(conversationStatus, 'error', messages.createError);
      }
      return;
    }

    conversationTitleInput.value = '';
    await loadConversations(payload.item.id);
  } catch {
    setStatus(conversationStatus, 'error', messages.createError);
  } finally {
    isCreatingConversation = false;
    createConversationButton.disabled = false;
  }
});

questionForm.addEventListener('submit', (event) => {
  event.preventDefault();
});

void loadConversations();
