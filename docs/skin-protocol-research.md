# Skin protocol investigation — Minecraft PE 0.7.0

Date: 2026-10-19
Target: Minecraft: Pocket Edition 0.7.0 (Android package `com.mojang.minecraftpe`, native library `libminecraftpe.so`).
Purpose: determine whether skins are part of the Realms HTTP API, the game connection protocol, local assets, or some combination. This is a research note, not a compatibility claim.

## Findings so far

### 1. No skin route is present in the currently recorded Realms endpoint inventory

The strings recovered so far from the 0.7.0 native library include Realms/session paths such as `/server/list`, `/server/%lld/join`, `/server/%lld/open`, `/server/%lld/close`, `/server/create?... `, `/m/session`, and `/auth/validate-player/%s/%s`. The recorded list does not contain an obvious `/skin`, `/texture`, or `/cape` endpoint.

**Interpretation:** there is currently no evidence that the known Realms REST API exposes a skin service. This does not prove that the client has no skin support: skin data could be local, embedded in another request, or carried by the multiplayer protocol.

### 2. Historical release notes are not proof of the wire protocol

Public version histories describe 0.7.0 primarily as the Realms alpha/multiplayer update and list other gameplay/UI changes, but do not establish the precise skin behavior or data format. Later Bedrock skin-pack formats and modern player-skin packets must not be copied into a protocol-11 implementation without evidence; they belong to different client/protocol generations.

## Questions that need binary-level evidence

1. Does this exact APK contain a skin picker, skin image assets, skin identifiers, or a player-skin serialization routine?
2. Does the multiplayer connection send a skin identifier or texture bytes when a player joins?
3. Does the server send other players' appearance data to clients, and in what packet/message?
4. Is the Realms API ever called for skin/profile data, or does it only manage sessions and Realm metadata?
5. If skin data is present, is it a built-in Steve/Alex-like texture, a local custom texture, or server-supplied texture data?

## Investigation procedure

Use the exact 0.7.0 APK and preserve its hash/version so results are tied to a known binary.

1. Inventory archive contents and native libraries. Record all skin/texture-related filenames, dimensions, and formats; do not assume that an asset name alone proves runtime use.
2. Search native and Java/Dalvik strings for terms such as `skin`, `texture`, `cape`, `player`, `image`, `png`, and `persona`. Treat a match as a lead, not a conclusion.
3. Locate references/call sites for any relevant strings and functions. Determine whether each one belongs to UI, local rendering, Realms HTTP traffic, or multiplayer serialization.
4. Inspect player/entity serialization and packet handling for protocol version 11. Compare sender and receiver code paths, field order, lengths, and texture representation.
5. If possible, capture a test connection between two copies of the same version using a private test environment. Compare packets for players with different locally selected appearances. Do not use real account credentials or production service secrets.
6. Add only verified results to the compatibility matrix and tests. Preserve unknowns explicitly.

## Evidence table

| Claim | Status | Why |
| --- | --- | --- |
| The recorded Realms endpoint strings expose a dedicated skin route | Not observed | No skin route in the current recovered endpoint inventory |
| PE 0.7.0 definitely has no skin support | Unproven | Absence from endpoint strings does not rule out local assets or game-protocol data |
| Modern Bedrock skin packet formats work with PE 0.7.0 | Not established | Modern packet docs describe newer protocol generations |
| The API prototype currently serves skin images or skin metadata | No | The current source implements only Realm/session metadata prototype routes |
| A playable server needs a skin implementation to be tested independently of the REST API | Likely separate concern | Player appearance must be traced in the game-connection/entity protocol, if supported |

## Required artifact for the next analysis pass

The actual APK or at minimum its exact `libminecraftpe.so` and a list of extracted asset paths are needed to inspect call sites and assets beyond the strings already recorded. A filename/string inventory alone cannot establish skin serialization.

## References

- Historical PE 0.7.0 version history: https://www.digminecraft.com/version_history/pocket_edition/release_0_7.php
- PE 0.7.0 alpha overview (protocol version 11): https://minecraft.fandom.com/wiki/Pocket_Edition_v0.7.0_alpha
- Modern skin-pack documentation is only background context and is not treated as a PE 0.7.0 specification: https://learn.microsoft.com/en-us/minecraft/creator/documents/packagingaskinpack?view=minecraft-bedrock-stable
