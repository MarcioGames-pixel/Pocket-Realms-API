'use strict';

const $ = (selector) => document.querySelector(selector);
const loginPanel = $('#login-panel');
const dashboard = $('#dashboard');
const loginForm = $('#login-form');
const loginError = $('#login-error');
const message = $('#dashboard-message');
let username = sessionStorage.getItem('pr_username') || '';
let sessionId = sessionStorage.getItem('pr_session') || '';

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    cache: 'no-store'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Falha na API (' + response.status + ')');
  return data;
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
  message.classList.toggle('notice', !isError);
}

function showDashboard() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  $('#welcome').textContent = 'Sessão local ativa para ' + username + '.';
}

function showLogin() {
  dashboard.hidden = true;
  loginPanel.hidden = false;
}

async function signIn(event) {
  event.preventDefault();
  loginError.textContent = '';
  const name = $('#username').value.trim();
  if (!name) return;
  try {
    const data = await api('/m/session', { method: 'POST', body: JSON.stringify({ username: name }) });
    username = data.username || name;
    sessionId = data.sessionId;
    sessionStorage.setItem('pr_username', username);
    sessionStorage.setItem('pr_session', sessionId);
    showDashboard();
    await refresh();
  } catch (error) {
    loginError.textContent = error.message;
  }
}

async function signOut() {
  try {
    if (sessionId) await api('/m/session/logout', { method: 'POST', body: JSON.stringify({ sessionId }) });
  } catch { /* local sign-out still clears this browser session */ }
  sessionStorage.removeItem('pr_username');
  sessionStorage.removeItem('pr_session');
  username = '';
  sessionId = '';
  showLogin();
}

function renderServers(servers) {
  const root = $('#server-list');
  root.replaceChildren();
  if (!servers.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Nenhum registro aberto. Crie um registro acima ou abra um existente.';
    root.append(empty);
    return;
  }
  for (const server of servers) {
    const card = document.createElement('article');
    card.className = 'server-card';
    const details = document.createElement('div');
    details.className = 'server-details';
    const title = document.createElement('h3');
    title.textContent = server.name || ('Realm #' + server.id);
    const meta = document.createElement('p');
    meta.textContent = '#' + server.id + ' · ' + (server.type || 'survival') + ' · seed ' + (server.seed ?? 0);
    const badge = document.createElement('span');
    badge.className = 'realm-badge ' + (server.open ? 'is-open' : 'is-closed');
    badge.textContent = server.open ? 'Aberto' : 'Fechado';
    details.append(title, meta, badge);
    const actions = document.createElement('div');
    actions.className = 'server-actions';
    const toggle = document.createElement('button');
    toggle.className = 'secondary';
    toggle.textContent = server.open ? 'Fechar' : 'Abrir';
    toggle.addEventListener('click', async () => {
      toggle.disabled = true;
      try {
        await api('/server/' + encodeURIComponent(server.id) + '/' + (server.open ? 'close' : 'open'));
        await refresh();
        setMessage('Registro #' + server.id + ' atualizado.');
      } catch (error) {
        setMessage(error.message, true);
      } finally { toggle.disabled = false; }
    });
    const players = document.createElement('span');
    players.className = 'player-count';
    players.textContent = (server.nplayers || 0) + ' jogadores';
    actions.append(players, toggle);
    card.append(details, actions);
    root.append(card);
  }
}

async function refresh() {
  try {
    const [status, list] = await Promise.all([api('/info/status'), api('/server/list')]);
    $('#api-status').textContent = status.status || 'OK';
    $('#server-count').textContent = String(status.servers ?? 0);
    $('#open-count').textContent = String(status.openServers ?? list.servers?.length ?? 0);
    // Load all records through individual IDs is not supported by a list endpoint yet;
    // this screen therefore displays the currently open list returned by /server/list.
    renderServers(list.servers || []);
  } catch (error) {
    setMessage(error.message, true);
    $('#api-status').textContent = 'Indisponível';
  }
}

loginForm.addEventListener('submit', signIn);
$('#logout-button').addEventListener('click', signOut);
$('#refresh-button').addEventListener('click', refresh);
$('#create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = $('#realm-name').value.trim();
  const seed = Number($('#realm-seed').value);
  if (!Number.isSafeInteger(seed)) return setMessage('A seed precisa ser um número inteiro seguro.', true);
  try {
    const data = await api('/server/create', {
      method: 'POST',
      body: JSON.stringify({ name, type: $('#realm-type').value, seed, owner: username })
    });
    $('#realm-name').value = '';
    setMessage('Registro #' + data.server.id + ' criado. Abra-o para aparecer na lista.');
    await refresh();
  } catch (error) { setMessage(error.message, true); }
});

if (username && sessionId) {
  showDashboard();
  refresh();
} else {
  showLogin();
}
