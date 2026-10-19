'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 42480);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const DATA_FILE = path.join(DATA_DIR, 'store.json');
const MAX_BODY = 1024 * 1024;

function emptyStore() {
  return { nextServerId: 1, servers: [], sessions: {}, players: {} };
}

function loadStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      nextServerId: Number.isSafeInteger(parsed.nextServerId) ? parsed.nextServerId : 1,
      servers: Array.isArray(parsed.servers) ? parsed.servers : [],
      sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
      players: parsed.players && typeof parsed.players === 'object' ? parsed.players : {}
    };
  } catch (error) {
    if (error.code === 'ENOENT') return emptyStore();
    // Fail closed: never let a later request overwrite an unreadable/corrupt store.
    throw new Error('Could not read data store at ' + DATA_FILE + ': ' + error.message + '. Back up and repair the file before restarting.');
  }
}

let store = loadStore();
function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = DATA_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(store, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, DATA_FILE);
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let settled = false;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      if (settled) return;
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY) {
        settled = true;
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        // Drain the request so the handler can return a structured 413 response.
        req.resume();
      }
    });
    req.on('end', () => {
      if (settled) return;
      if (!body) return resolve({});
      try {
        const parsed = JSON.parse(body);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
          return reject(Object.assign(new Error('JSON object required'), { status: 400 }));
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error('Invalid JSON body'), { status: 400 }));
      }
    });
    req.on('error', error => {
      if (!settled) reject(error);
    });
  });
}

function safeText(value, label, max = 64) {
  if (typeof value !== 'string') throw Object.assign(new Error(label + ' must be a string'), { status: 400 });
  const text = value.trim();
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
    throw Object.assign(new Error(label + ' is empty or invalid'), { status: 400 });
  }
  return text;
}

function findServer(id) {
  const server = store.servers.find(item => item.id === Number(id));
  if (!server) throw Object.assign(new Error('Server not found'), { status: 404 });
  return server;
}

function publicServer(server) {
  return {
    id: server.id,
    name: server.name,
    type: server.type,
    seed: server.seed,
    open: server.open,
    nplayers: server.nplayers,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt
  };
}

function tokenFor(username) {
  const token = crypto.randomBytes(24).toString('hex');
  store.sessions[token] = { username, createdAt: new Date().toISOString() };
  return token;
}

function route(req, res) {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = decodeURIComponent(url.pathname);
  const method = req.method || 'GET';

  if (method === 'GET' && pathname === '/health') {
    return send(res, 200, { ok: true, service: 'Pocket-Realms-API', version: '0.1.0' });
  }

  if (pathname === '/info/status' && method === 'GET') {
    return send(res, 200, { status: 'ok', servers: store.servers.length, openServers: store.servers.filter(s => s.open).length, protocol: 'community-prototype' });
  }

  if (pathname === '/server/list' && method === 'GET') {
    return send(res, 200, { servers: store.servers.filter(s => s.open).map(publicServer) });
  }

  if (pathname === '/server/create' && (method === 'GET' || method === 'POST')) {
    return readBody(req).then(body => {
      const name = safeText(url.searchParams.get('name') || body.name || 'My Realm', 'name', 48);
      const type = safeText(url.searchParams.get('type') || body.type || 'survival', 'type', 24);
      const rawSeed = url.searchParams.has('seed') ? url.searchParams.get('seed') : body.seed;
      const seed = rawSeed === undefined || rawSeed === null || rawSeed === '' ? 0 : Number(rawSeed);
      if (!Number.isSafeInteger(seed)) throw Object.assign(new Error('seed must be a safe integer'), { status: 400 });
      const now = new Date().toISOString();
      const server = { id: store.nextServerId++, name, type, seed, open: false, nplayers: 0, owner: body.owner ? safeText(body.owner, 'owner', 32) : null, whitelist: [], createdAt: now, updatedAt: now };
      store.servers.push(server);
      persist();
      return send(res, 201, { server: publicServer(server) });
    }).catch(error => send(res, error.status || 500, { error: error.message || 'Internal server error' }));
  }

  const serverRoute = pathname.match(/^\/server\/(\d+)(?:\/(join|open|close|name|whitelist))?$/);
  if (serverRoute) {
    const id = Number(serverRoute[1]);
    const action = serverRoute[2] || '';
    if (method === 'GET' && !action) return send(res, 200, { server: publicServer(findServer(id)) });
    if (method === 'GET' && action === 'open') {
      const server = findServer(id); server.open = true; server.updatedAt = new Date().toISOString(); persist();
      return send(res, 200, { server: publicServer(server) });
    }
    if (method === 'GET' && action === 'close') {
      const server = findServer(id); server.open = false; server.updatedAt = new Date().toISOString(); persist();
      return send(res, 200, { server: publicServer(server) });
    }
    if (action === 'name' && (method === 'GET' || method === 'POST')) {
      return readBody(req).then(body => {
        const server = findServer(id);
        const name = safeText(actionValue || url.searchParams.get('name') || body.name, 'name', 48);
        server.name = name; server.updatedAt = new Date().toISOString(); persist();
        return send(res, 200, { server: publicServer(server) });
      }).catch(error => send(res, error.status || 500, { error: error.message || 'Internal server error' }));
    }
    if (action === 'whitelist' && (method === 'GET' || method === 'POST')) {
      return readBody(req).then(body => {
        const server = findServer(id);
        const player = safeText(actionValue || url.searchParams.get('player') || body.player || body.username, 'player', 32);
        if (method === 'GET' || body.action === 'add') {
          if (!server.whitelist.includes(player)) server.whitelist.push(player);
        } else if (body.action === 'remove') {
          server.whitelist = server.whitelist.filter(name => name !== player);
        } else {
          throw Object.assign(new Error('POST body action must be add or remove'), { status: 400 });
        }
        server.updatedAt = new Date().toISOString(); persist();
        return send(res, 200, { whitelist: server.whitelist });
      }).catch(error => send(res, error.status || 500, { error: error.message || 'Internal server error' }));
    }
    if (action === 'join' && (method === 'GET' || method === 'POST')) {
      return readBody(req).then(body => {
        const server = findServer(id);
        if (!server.open) throw Object.assign(new Error('Server is closed'), { status: 409 });
        const username = safeText(url.searchParams.get('username') || body.username || body.player, 'username', 32);
        if (server.whitelist.length && !server.whitelist.includes(username)) throw Object.assign(new Error('Player is not on the whitelist'), { status: 403 });
        store.players[username] = store.players[username] || { username, firstSeen: new Date().toISOString() };
        server.nplayers = Math.max(0, server.nplayers + 1);
        server.updatedAt = new Date().toISOString();
        const sessionId = tokenFor(username);
        persist();
        return send(res, 200, { joined: true, server: publicServer(server), sessionId, note: 'Metadata only; no RakNet game connection is created.' });
      }).catch(error => send(res, error.status || 500, { error: error.message || 'Internal server error' }));
    }
  }

  if (pathname === '/m/session' && (method === 'GET' || method === 'POST')) {
    return readBody(req).then(body => {
      const username = safeText(url.searchParams.get('username') || body.username, 'username', 32);
      const sessionId = tokenFor(username); persist();
      return send(res, 200, { sessionId, username });
    }).catch(error => send(res, error.status || 500, { error: error.message || 'Internal server error' }));
  }

  if (pathname === '/m/session/logout' && (method === 'GET' || method === 'POST')) {
    return readBody(req).then(body => {
      const token = url.searchParams.get('sessionId') || body.sessionId || req.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (token) delete store.sessions[token];
      persist();
      return send(res, 200, { ok: true });
    }).catch(error => send(res, error.status || 500, { error: error.message || 'Internal server error' }));
  }

  const validate = pathname.match(/^\/auth\/validate-player\/([^/]+)\/([^/]+)$/);
  if (validate && method === 'GET') {
    const username = validate[1];
    const token = validate[2];
    const session = store.sessions[token];
    return send(res, session && session.username === username ? 200 : 401, { valid: Boolean(session && session.username === username), username });
  }

  if (pathname === '/server/heartbeat' && (method === 'GET' || method === 'POST')) {
    return readBody(req).then(body => {
      const raw = url.searchParams.get('nplayers') ?? body.nplayers;
      const nplayers = Number(raw ?? 0);
      if (!Number.isInteger(nplayers) || nplayers < 0 || nplayers > 1000) throw Object.assign(new Error('nplayers must be an integer from 0 to 1000'), { status: 400 });
      const id = Number(url.searchParams.get('id') ?? body.id);
      const server = Number.isSafeInteger(id) && id > 0 ? findServer(id) : store.servers.find(s => s.open);
      if (!server) return send(res, 404, { error: 'No matching server; pass ?id=SERVER_ID' });
      server.nplayers = nplayers; server.updatedAt = new Date().toISOString(); persist();
      return send(res, 200, { ok: true, server: publicServer(server) });
    }).catch(error => send(res, error.status || 500, { error: error.message || 'Internal server error' }));
  }

  return send(res, 404, { error: 'Not found', path: pathname });
}

const server = http.createServer((req, res) => {
  Promise.resolve(route(req, res)).catch(error => {
    if (!res.headersSent) send(res, error.status || 500, { error: error.message || 'Internal server error' });
    else res.destroy();
  });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => console.log('Pocket-Realms-API listening on http://' + HOST + ':' + PORT));
}

module.exports = { server, loadStore, emptyStore };
