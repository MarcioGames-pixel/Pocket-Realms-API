'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-realms-api-'));
process.env.DATA_DIR = dataDir;
const { server } = require('../src/server.js');
let base;

before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function request(route, options) {
  const response = await fetch(base + route, options);
  return { status: response.status, body: await response.json() };
}

test('health endpoint responds', async () => {
  const result = await request('/health');
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
});

test('create realm, open it, and list it', async () => {
  const created = await request('/server/create?name=Test%20Realm&type=survival&seed=42');
  assert.equal(created.status, 201);
  const id = created.body.server.id;
  assert.equal(created.body.server.name, 'Test Realm');
  assert.equal(created.body.server.open, false);

  const closedList = await request('/server/list');
  assert.equal(closedList.body.servers.some(s => s.id === id), false);

  const opened = await request('/server/' + id + '/open');
  assert.equal(opened.status, 200);
  assert.equal(opened.body.server.open, true);

  const listed = await request('/server/list');
  assert.equal(listed.body.servers.some(s => s.id === id), true);
});

test('session token validates and logout revokes it', async () => {
  const session = await request('/m/session?username=Tester');
  assert.equal(session.status, 200);
  const token = session.body.sessionId;
  const valid = await request('/auth/validate-player/Tester/' + token);
  assert.equal(valid.status, 200);
  assert.equal(valid.body.valid, true);

  const logout = await request('/m/session/logout?sessionId=' + token);
  assert.equal(logout.status, 200);
  const invalid = await request('/auth/validate-player/Tester/' + token);
  assert.equal(invalid.status, 401);
});

test('invalid seed is rejected', async () => {
  const result = await request('/server/create?name=Bad&seed=not-a-number');
  assert.equal(result.status, 400);
});
