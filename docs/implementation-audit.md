# Pre-implementation audit — Pocket-Realms-API

Date: 2026-10-19
Scope: static review of the current prototype and protocol-research notes. No endpoint behavior is changed by this document.

## Executive summary

The repository is a useful scaffolding prototype, not yet a verified implementation of the original Minecraft: Pocket Edition 0.7.0 Realms/API protocol. The recovered native-library strings identify candidate paths, but they do not establish HTTP methods, payloads, response formats, or authentication semantics.

**Recommendation: do not implement protocol-compatibility changes until the native call sites are traced and captured request/response behavior is documented.** Keep protocol guesses separate from confirmed behavior.

## Findings in the current prototype

### P0 — Compatibility gaps to resolve before claiming PE 0.7.0 support

1. **Rename route shape differs from the observed path.** The binary string is `/server/%lld/name/%s`; the prototype currently accepts `/server/:id/name?name=...` or a JSON body. These are not equivalent routes.
2. **Whitelist route shape differs from the observed path.** The binary string is `/server/%lld/whitelist/%s`; the prototype currently expects a query/body player and a prototype-specific POST action.
3. **Wire formats are assumptions.** The prototype returns JSON objects such as `{ "servers": [...] }`, `{ "sessionId": ... }`, and `{ "valid": true }`. The original client’s expected response bodies and status codes have not been confirmed.
4. **HTTP methods are unverified.** GET/POST support in this prototype is a design choice, not evidence of the original client’s method.
5. **Join is metadata-only.** It issues a random session token and increments a player count, but it does not establish a RakNet connection or start/join a playable world.

### P0 — Authorization and session semantics

1. Server create/open/close/rename/whitelist/heartbeat operations have no owner/session authorization. Anyone who can reach the service can change server metadata.
2. The optional `owner` field is recorded during creation but is not used to authorize later operations.
3. A session is just a random token mapped to a username. There is no verified account authentication, expiry, refresh, or binding to a server.
4. Whitelist membership is not the same as an invitation system. The native symbols include invite-related names; invite behavior has not been implemented or confirmed.
5. Do not accept or store Microsoft/Mojang passwords, refresh tokens, or other real account credentials in this project.

### P1 — Reliability and input handling

1. The JSON store is synchronously read/written on the request path. This is acceptable for a small prototype but can block the event loop under load.
2. If `data/store.json` exists but is invalid JSON, startup logs the error and starts with an empty store. A later write can replace the damaged file, risking data loss. Prefer fail-closed startup or preserve/quarantine the bad file.
3. Oversized request bodies trigger `req.destroy()`; sending a structured 413 response after destroying the socket may not reach the client. Body-size handling should be tested and redesigned.
4. Several state-changing actions use GET. That is risky for a public service and may conflict with the original protocol; the correct compatibility behavior must be determined from call sites, then protected appropriately.
5. The prototype’s player count can increase on every join request until a heartbeat overwrites it; repeated requests can inflate the displayed count.
6. URL decoding and malformed-path behavior need explicit tests. Input validation should be consistent across query strings, paths, and JSON bodies.

### P1 — Test coverage gaps

Current tests cover health, create/open/list, session validation/logout, and invalid seed. They do not yet cover:
- observed native path shapes for rename and whitelist;
- invalid/missing IDs and malformed percent-encoding;
- authorization and owner/invite rules;
- restart persistence and corrupt-store recovery;
- oversized or malformed request bodies;
- duplicate joins and heartbeat/player-count behavior;
- exact request/response fixtures from the original client.

## Evidence required before implementation

For every native connector method, inspect the decompiled call site and record:

- the caller/function and endpoint construction;
- HTTP method and headers;
- path/query/body encoding rules;
- cookies or session identifiers;
- response parser and required fields;
- error handling and expected status codes;
- whether the call is a player/session operation or a server heartbeat.

The endpoint strings already listed in `protocol-research.md` are useful leads, but are not enough to define a compatible server.

## Suggested order of work

1. Trace `MCOConnector` and the HTTP/request helper in the PE 0.7.0 native library; document evidence without changing API behavior.
2. Build a protocol matrix with a confidence/evidence column and sanitized fixtures where available.
3. Add regression tests from confirmed request/response behavior.
4. Implement the confirmed routes and response serializers, one endpoint at a time.
5. Add owner authorization and explicit invite/session rules without collecting real account credentials.
6. Treat RakNet/world simulation as a separate project milestone; do not describe this REST API as a playable server until that component exists.

## Current status

- Static review completed for `src/server.js`, `test/api.test.js`, `docs/protocol-research.md`, and the CI workflow.
- No application code was changed as part of this audit.
- CI results have not been verified in this audit.
- Original protocol call sites and exact wire formats remain unverified.
