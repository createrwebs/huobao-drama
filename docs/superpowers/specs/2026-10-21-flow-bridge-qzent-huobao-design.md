# Flow Bridge + Qzent Flow2API + Huobao Drama Design

**Date:** 2026-10-21  
**Status:** Approved for specification; implementation has not started  
**Scope:** Local Chrome bridge, Qzent Flow2API integration, and Huobao Drama media generation integration

## 1. Goal

Provide one local workflow that lets a user sign in to Google Flow in Chrome, connect the existing Flow Bridge extension to a local daemon, export Google Flow cookies in Qzent's accepted array format, validate Qzent readiness, generate images and videos through Qzent, and persist the resulting media in Huobao Drama linked to dramas, episodes, scenes, characters, or storyboards.

Google cookies are the upstream Flow session credential. `SNlM0e` and `FdrFJe` from `WIZ_global_data` are page/bootstrap values, not standalone OAuth bearer credentials, and must not be exported as Qzent authentication.

## 2. Existing context

The repository already contains:

- A Manifest V3 extension at `flow-drama-autopilot/bridge-extension`.
- A WebSocket client targeting `ws://127.0.0.1:9222`.
- Operations for tabs, cookies, Flow page values, fingerprints, projects, CAPTCHA probes, and status.
- Qzent-compatible cookie normalization in `bridge-extension/qzent-cookies.js`.
- Huobao routes in `backend/src/routes/flowBridge.ts`.
- Existing Flow account, storage, storyboard, and generation services.
- A Hono backend under `/api/v1` and a Nuxt/Vue frontend.

The existing Flow engine path must remain compatible during migration. The Qzent path is an explicit provider/engine path, not an unrelated replacement.

## 3. Non-goals

This change will not implement a new Google Flow RPC client inside Huobao, extract Google OAuth tokens, treat `SNlM0e`/`FdrFJe` as bearer tokens, expose cookies to the frontend/logs/chat, bind the daemon to LAN, retry ambiguous generation POSTs, add PBI integrations, or replace the existing media storage model. Qzent remains responsible for Flow Web bootstrapping, RPCs, CAPTCHA, projects, and upstream generation.

## 4. Architecture

```text
Chrome flow.google.com
        │ Manifest V3 extension
        ▼
Local Flow Bridge daemon :9222
        │ normalized cookies / status
        ▼
Huobao backend :5679 ───── Qzent Flow2API
        │                         │
        ▼                         ▼
Huobao storage/database ◄── generated media/results
```

The extension is the only component allowed to read Chrome cookies. The local daemon provides the extension protocol and controlled server-side integration. Huobao owns application tasks, media persistence, and storyboard linkage. Qzent owns Google Flow session handling and generation.

## 5. Local bridge daemon

Create a standalone TypeScript service:

```text
bridge/
├── package.json
├── tsconfig.json
├── src/server.ts
├── src/protocol.ts
├── src/pairing.ts
├── src/state.ts
├── src/cookie-store.ts
├── src/qzent-client.ts
└── README.md
```

It binds to `127.0.0.1:9222` by default and supports a documented local port override.

### Pairing

The first localhost connection may be tokenless. The daemon then sends `config.set` with a cryptographically random pairing token. The extension persists it and reconnects with it. Later connections require the token. The token is never shown in popup text, logs, API responses, or diagnostics. A local reset invalidates it.

### Protocol

Support the operations currently used by the extension:

```text
ping
config.get
config.set
config.reset
tabs.list
tabs.open
tab.attach
tab.detach
tab.current
events.read
cookies.list
cookies.names
flow.fingerprint
flow.navigate
flow.projects
flow.captcha
flow.at
status
```

Wire format:

```json
{ "id": "request-id", "op": "status", "params": {} }
```

Responses are `{ "id": "request-id", "result": {} }` or `{ "id": "request-id", "error": { "message": "safe diagnostic" } }`. Events use `{ "event": "bridge.cookies_rotated", "params": {} }`. No arbitrary CDP/evaluate/call escape hatch is allowed.

### Cookie handling

Accepted Qzent domains are `google.com`, `.google.com`, `flow.google.com`, and `.flow.google.com`. Accepted names must match the current Qzent Flow Web parser, including:

```text
SID HSID SSID APISID SAPISID NID OSID __Secure-OSID
__Secure-1PSID __Secure-3PSID __Secure-1PAPISID __Secure-3PAPISID
SIDCC __Secure-1PSIDCC __Secure-3PSIDCC
__Secure-1PSIDTS __Secure-3PSIDTS
```

Normalized output contains only `name`, `value`, `domain`, `path: "/"`, and `secure: true`. The daemon rejects jars without `SID`, `__Secure-1PSID`, or `__Secure-3PSID`, and rejects values containing CR, LF, semicolon, or NUL. The Qzent array must never contain `SNlM0e`, `FdrFJe`, `at`, `fsid`, fingerprint values, or bridge tokens.

### Secret boundary

Secrets must not be stored under the source tree, logged, returned from status endpoints, included in diagnostics, or returned to the frontend. Local storage must use restrictive permissions where supported. Temporary exports should be cleared when possible.

## 6. Qzent integration

Huobao supports server-side configuration:

```text
FLOW2API_BASE_URL
FLOW2API_API_KEY
FLOW2API_TIMEOUT_MS
FLOW2API_ENABLED
```

The API key is server-side only. Add a typed Qzent client that validates the base URL, uses `Authorization: Bearer <FLOW2API_API_KEY>`, supports `GET /v1/models`, OpenAI-compatible image/video requests, Gemini-compatible image requests where required, timeouts, safe error mapping, and upstream task/media IDs. Request bodies and authorization headers must not be logged.

The user flow is:

```text
Open Flow in Chrome → Copy Qzent Cookies → import cookie array
→ Qzent validates session → Huobao shows sanitized readiness
```

Status must distinguish `bridge_connected`, `qzent_reachable`, `qzent_authenticated`, `google_flow_session_valid`, `image_generation_available`, and `video_generation_available`.

## 7. Huobao image generation

The provider resolver sends prompt, model, aspect ratio, optional references, and application IDs to Qzent. Huobao validates the result, downloads media into existing image storage, creates/updates the asset or storyboard relation, and completes the local task with a local URL and upstream metadata.

Supported inputs include text prompt, model, aspect ratio, reference images, and drama/episode/scene/character/storyboard IDs.

## 8. Huobao video generation

Huobao creates a local processing task, submits one Qzent request, stores the upstream task/media ID, polls with bounded backoff, downloads the completed video, creates a poster using existing utilities, links it to the storyboard/scene, and marks the task completed.

Supported inputs include text-to-video, start/end frames, reference images, duration, aspect ratio, resolution, and audio/watermark only when supported by the selected model.

Do not retry an ambiguous generation submission. Retry polling and downloads only when safe. Mark ambiguous submissions as `needs_verification` and preserve upstream IDs/errors.

## 9. Backend boundaries

Reuse existing `flowBridge` routes, storage, and storyboard utilities. Add typed boundaries such as:

```text
backend/src/services/flow-bridge-daemon.ts
backend/src/services/qzent-flow2api.ts
backend/src/services/flow-provider-resolver.ts
backend/src/services/flow-media-import.ts
```

Required capabilities:

```text
GET  /api/v1/flow-bridge/status
GET  /api/v1/flow-bridge/accounts
POST /api/v1/flow-bridge/accounts/import
POST /api/v1/flow-bridge/accounts/switch
GET  /api/v1/flow-bridge/models
POST /api/v1/flow-bridge/test/image
POST /api/v1/flow-bridge/test/video
POST /api/v1/flow-bridge/v1/chat/completions
POST /api/v1/flow-bridge/v1/video
```

Responses must be sanitized and never return Google cookies, Qzent keys, authorization headers, or raw secret-bearing upstream bodies.

## 10. Frontend

The Flow Bridge UI shows local bridge status, endpoint, sanitized error, Chrome Flow session status, Qzent reachability/authentication, opaque account ID, cookie count, available models, and generation status. Actions include reconnect, import cookies, check Qzent, test image/video, and generate image/video. Existing prompt, model, storyboard, and media patterns are reused. The frontend never calls Google Flow with cookies.

## 11. Error categories

Use stable categories:

```text
bridge_unavailable
bridge_pairing_required
invalid_google_cookies
flow_session_expired
qzent_unreachable
qzent_unauthorized
qzent_model_unavailable
generation_submission_ambiguous
generation_timeout
media_download_failed
media_persistence_failed
flow_quota_exceeded
flow_permission_denied
flow_captcha_required
```

User-facing errors must be actionable and must omit credentials and raw secret-bearing payloads.

## 12. Testing

Unit tests cover protocol validation, pairing, localhost binding, cookie filtering, required session cookies, absence of page tokens, Qzent URL/key handling, request normalization, error mapping, and redaction.

Integration tests use a fake extension WebSocket client and a local Qzent mock:

```text
fake extension → bridge daemon → Qzent mock → Huobao backend → storage/database fixture
```

They cover reconnect, cookie import/status, model discovery, image persistence, video submission/polling/download/poster/linkage, expired session, unauthorized key, ambiguous submission, and backend restart recovery.

A real-account smoke test is manual and local-only. It may use the user's own cookies and Qzent key but must not commit, log, or transmit them to chat or fixtures. It should test one image and one video only when the account has permission and credits.

## 13. Acceptance criteria

1. Starting the daemon makes the existing extension show `Connected`.
2. The extension reconnects after daemon restart.
3. All required extension operations work without arbitrary CDP access.
4. A Qzent-compatible cookie array can be produced.
5. The array excludes page tokens, bridge tokens, and unrelated domains.
6. Huobao validates Qzent reachability and discovers models.
7. A mock integration test submits and persists an image.
8. A mock integration test submits, polls, and persists a video.
9. Generated media links to an existing storyboard/scene without duplicating storage.
10. The frontend shows sanitized bridge, Qzent, session, model, and generation status.
11. No test, log, response, or committed file contains a real cookie or API key.
12. Typecheck, targeted tests, integration tests, and affected frontend build pass.

## 14. Implementation order

1. Standalone bridge protocol and pairing.
2. Extension connection/status validation.
3. Cookie import/normalization and Qzent export.
4. Qzent client, readiness, and model checks.
5. Huobao image adapter and persistence.
6. Huobao video adapter, polling, persistence, and poster generation.
7. Frontend status and generation controls.
8. Integration tests and manual smoke-test instructions.

Each phase preserves the existing Flow engine path until the Qzent path has its own passing tests.

## 15. Operational assumptions

- The user configures a reachable Qzent Flow2API instance and API key outside source control.
- The daemon and extension run on the same machine.
- Qzent remains responsible for Google Flow CAPTCHA and upstream account constraints.
- Huobao downloads media server-side so result URLs do not need to remain open in Chrome.
- Existing unrelated working-tree changes are not part of this feature unless explicitly included in the implementation plan.