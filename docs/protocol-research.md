# PE 0.7.0 protocol research notes

## Scope

This document tracks endpoint strings recovered from the Minecraft: Pocket Edition 0.7.0 native library and separates observed evidence from assumptions in the community API.

## Endpoint strings observed

The native library contains these strings:

- `/server/list`
- `/server/%lld/join`
- `/server/%lld/close`
- `/server/%lld/open`
- `/info/status`
- `/m/session/logout`
- `/server/heartbeat?nplayers=%d`
- `/m/session`
- `/auth/validate-player/%s/%s`
- `/server/create?name=%s&type=%s&seed=%d`
- `/server/%lld/name/%s`
- `/server/%lld/whitelist/%s`

The native library also contains names such as `MCOConnector`, `callValidateSession`, `callVerifyPlayer`, `callCreateServer`, `callRemoveFromInvite`, `callSetServerName`, `callAddInvite`, `callCloseServer`, `callOpenServer`, `callGetStatus`, `callUpdateServerList`, `callLogoutSession`, `callPing`, and `callJoinServer`. The service host string `https://peoapi.minecraft.net` is present as well.

## Evidence limits

A string found in a binary proves that the string is present, not that a specific method, header, body schema, response schema, or status code is used. The API currently implements convenient prototype behaviors for development; do not label them as confirmed original wire behavior.

## Required call-site investigation

For each connector method, record:

1. The function that builds the request and its HTTP method.
2. Whether arguments are path-escaped, query-escaped, or inserted directly.
3. Headers, cookies, session identifiers, and request body.
4. Expected success response: JSON, text, empty body, or another format.
5. Error handling, expected error body, and status-code behavior.
6. Whether the route is user-session traffic or game-server heartbeat traffic.

## Compatibility matrix

| Endpoint | Path observed | Method/body/response verified? |
| --- | --- | --- |
| Server list | `/server/list` | No |
| Join | `/server/%lld/join` | No |
| Close | `/server/%lld/close` | No |
| Open | `/server/%lld/open` | No |
| Status | `/info/status` | No |
| Session logout | `/m/session/logout` | No |
| Heartbeat | `/server/heartbeat?nplayers=%d` | No |
| Session | `/m/session` | No |
| Validate player | `/auth/validate-player/%s/%s` | No |
| Create | `/server/create?name=%s&type=%s&seed=%d` | No |
| Rename | `/server/%lld/name/%s` | No |
| Whitelist | `/server/%lld/whitelist/%s` | No |

## Next milestones

- Inspect decompiled call sites and map each native method to request construction and response parsing.
- Add sanitized request/response fixtures only when their provenance is understood.
- Implement exact response serializers and regression tests per endpoint.
- Add owner/session authorization and explicit invite semantics before public deployment.
- Build a separate RakNet-compatible game-server component. REST metadata alone cannot host a playable world.

Never store real Microsoft/Mojang credentials or refresh tokens in this project.
