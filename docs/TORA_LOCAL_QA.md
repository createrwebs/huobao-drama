# ToraAPI local integration and QA

This is a **local integration prototype**, not the production auth/tenant migration.

## What is implemented

- Default ToraAPI login UI; the key is sent as `{ apiKey }` to the local backend.
- Backend validates login with the existing Tora service, then calls `GET /v1/models` with the supplied key in a Bearer header. Public `/api/pricing` metadata categorizes only those returned IDs; it cannot add models to the key's list. `GET /auth/models` exposes Chat/Image/VDO/Other metadata without credentials.
- An opaque HttpOnly, SameSite=Strict local cookie identifies an in-memory session. The key and upstream cookie never appear in config responses or logs. Sessions expire after eight hours and are lost on restart.
- Web integration mode (`TORA_WEB_MODE=1`) reads session-scoped configs, excludes loopback/local Flow and Antigravity, and prevents fallback to shared local AI configs.
- Managed text/image configs are built from the live catalog, not static legacy presets. Endpoint metadata determines the protocol (for example, a Gemini-named model supporting `openai` is called through Chat Completions). Stale prompt-file models are ignored, unknown explicit selections are rejected, and managed fallback candidates stay within the catalog. Gateway destinations are server-controlled.
- Direct-provider/desktop workflows remain available when `TORA_WEB_MODE` is not enabled.

## Local launch

Use the backend's normal `npm start` with these environment variables:

| Variable | Value/purpose |
|---|---|
| `TORA_WEB_MODE` | `1` enables local Tora integration and protected API access |
| `PORT` | `5680` for the tested instance |
| `FRONTEND_DIST` | Absolute path to `frontend/.output/public`, after `npm run generate` in frontend |
| `SQLITE_PATH` | An isolated scratch/test SQLite path, **not** the existing data DB |
| `HUOBAO_DATA_DIR` | Isolated scratch/test media directory; this legacy environment name remains internal |
| `TORA_AUTH_API_BASE_URL` | Optional separate existing auth service; defaults to `https://www.toraapi.com/storyvdo/api/v1` |
| `TORA_ALLOWED_ORIGINS` | Explicit origin allowlist if using a separate development frontend |

Do not deploy this application at its own configured authentication-upstream address: that would recurse. Hosted deployment needs the actual production auth implementation integrated into this checkout, not a proxy back to itself.

## Verification performed on October 13, 2026

| Gate | Result |
|---|---|
| Backend targeted tests | 13 passed |
| Backend `npm run typecheck` | Passed |
| Frontend targeted Tora/provider tests | 21 passed |
| Frontend `npm run generate` | Passed |
| Playwright against live local backend/static frontend | 7 passed; no browser JS exceptions |
| Real upstream negative login | Invalid placeholder key returned HTTP 401; UI cleared key and no session persisted |
| Earlier full frontend structural suite (before catalog change) | 28 passed, 19 failed (47 total) |
| Earlier full backend structural suite (before catalog change) | 39 passed, 20 failed (59 total) |

Successful login/config retrieval, independent-client isolation, expiration and logout in backend tests use **explicit synthetic upstream fixtures**. These are contract tests, not proof of successful login against a real Tora account.

Playwright checks: branding/local-provider hiding, disabled empty submit, real invalid-login rejection and input clearing, secret-free console, no automatic local-provider requests, no JS exceptions, no session after failed-login reload, and mobile horizontal-overflow check (grouped into seven reported checks).

Additional browser verification: the Chat/Image/VDO catalog panel rendered exact grouped IDs and cleared the entered key in an **explicit UI-only fixture**. This does not establish successful live upstream model retrieval or generation.

Static-build verification also rejects `@vite/client` in generated `index.html`: stop the Nuxt dev process before generating because both processes share `.nuxt` and can race the prerender manifest.

## Remaining release blockers

1. The user exercised a valid login before the catalog update, but the script-rewriter request failed with `AI_APICallError` while using a legacy Gemini-native selection. The corrected catalog flow has not yet been exercised with the user's valid key. Enter it directly into the local app again after the restart; do not paste it into chat.
2. No real text/image/video generation or billing was tested.
3. Video catalog IDs are displayed when returned for the key, but execution is intentionally excluded: Tora's documented unified video protocol must be implemented and contract-tested; the old native Firemux URL suffixes cannot simply be moved to the Tora host.
4. Session persistence and full per-user project/media ownership are not implemented. Existing local project data is not a hosted multi-tenant security boundary.
5. The complete structural suites are not green. Several tests still reference removed `app/pages/drama/[id]/...` paths; other provider/design assumptions need investigation. No pre-change baseline comparison was run, so failures are not all classified as pre-existing.
6. No commit, push, production deployment, or extension publication was performed.
