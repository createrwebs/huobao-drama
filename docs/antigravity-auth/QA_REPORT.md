# Independent QA Audit Report: Multi-User & Tora/New-API Integration

**Auditor:** Independent QA Subagent  
**Date:** 2026-10-10  
**Target Repositories:**
- **Huobao:** `/Users/noppanan/huobao-drama` (HEAD: `a4edb3c`)
- **New-API:** `/Users/noppanan/new-api` (HEAD: `a38907bad`, branch: `feat/formobile`)
- **PO Evaluation Reference:** `/Users/noppanan/huobao-drama/docs/ANTIGRAVITY_MULTI_USER_TASK_TH.md` (lines 63–77)

---

## 1. Executive Summary & Verdict

| Assessment Category | Status | Details |
|---|---|---|
| **Overall PO Acceptance Verdict** | **PASSED (100% of Mandatory Criteria 1–7)** | All multi-user isolation, Tora identity contract, unowned protection, media security, zero-quota guard, centralized billing, and credential security requirements are met. |
| **New-API Test Suite** | **PASS (18/18)** | `controller/huobao_test.go` covering A0 Identity Contract & A5 Credit Billing. |
| **Huobao Backend Test Suite** | **PASS (7/7)** | `auth-a1`, `migration-a2`, `ownership-a3`, `media-a4`, `billing-a5` all pass green. |
| **Backend Typecheck** | **PASS (0 errors)** | `tsc --noEmit` cleanly passes without type errors. |
| **Regression Test Suite** | **PASS (6/6)** | `request-logger.test.ts` (5 pass), `video-file-response.test.ts` (1 pass). |
| **Legacy / Baseline Status** | **DOCUMENTED** | `frontend/tests/story-mode.test.mjs` has 3 legacy assertion failures due to pre-existing `/storyvdo/` baseURL prefix changes, independent of multi-user auth. |

---

## 2. Test Execution Commands & Verification Results

### A. Huobao Multi-User & Billing Test Suites
- **Command:** `rtk npx tsx --test backend/tests/auth-a1.test.ts backend/tests/migration-a2.test.ts backend/tests/ownership-a3.test.ts backend/tests/media-a4.test.ts backend/tests/billing-a5.test.ts`
- **Working Directory:** `/Users/noppanan/huobao-drama`
- **Exit Code:** `0`
- **Output:**
  ```text
  ✔ A1.1: Crypto utilities provide secure tokens, encryption and masking (2.495667ms)
  ✔ A1.2: Tora verification contract, caching, and account separation (56.165208ms)
  ✔ A1.3: End-to-end auth routes (login, me, logout, cookies, and session lifecycle) (105.81575ms)
  ✔ A5: Centralized Tora Credit & Managed Video Billing Integration (1197.261792ms)
  ✔ A4: Private Media Protection, Tenant Isolation, Range 206, and Provider Signed URLs (603.532709ms)
  ✔ A2: Migration rehearsal, SQLite-consistent backup/restore, and unowned allocation invariants (49.857041ms)
  ✔ A3: Complete End-to-End Ownership Enforcement & Tenant Isolation Matrix (1214.35025ms)
  ℹ tests 7 | suites 0 | pass 7 | fail 0 | cancelled 0 | skipped 0 | duration_ms 1363.78
  ```

### B. New-API Controller & Billing Test Suites
- **Command:** `rtk go test -run "TestHuobao.*" -v ./controller`
- **Working Directory:** `/Users/noppanan/new-api`
- **Exit Code:** `0`
- **Output:**
  ```text
  Go test: 18 passed in 1 packages
  ```
  *(Tests verified: `TestHuobaoIdentity_A0_Contract` with 10 subtests + `TestHuobaoVideoBilling_A5` with 6 subtests).*

### C. Backend TypeScript Typecheck
- **Command:** `rtk pnpm --filter server run typecheck`
- **Working Directory:** `/Users/noppanan/huobao-drama`
- **Exit Code:** `0`
- **Output:**
  ```text
  $ tsc --noEmit
  (Clean exit, 0 errors)
  ```

### D. Huobao Regression Test Suites
- **Command:** `rtk npx tsx --test backend/tests/request-logger.test.ts backend/tests/video-file-response.test.ts`
- **Working Directory:** `/Users/noppanan/huobao-drama`
- **Exit Code:** `0`
- **Output:**
  ```text
  ✔ POST request does not leak synthetic credentials or body to console
  ✔ PUT request does not leak synthetic credentials or body to console
  ✔ PATCH request does not leak synthetic credentials or body to console
  ✔ GET requests retain method, path, status, and latency diagnostics
  ✔ failing status requests retain method, path, status, and latency diagnostics
  ✔ video file serving supports ranges and interrupted previews without stream crashes
  ℹ tests 6 | suites 1 | pass 6 | fail 0
  ```

---

## 3. Evaluation Against Mandatory PO Criteria (Lines 63–77)

### Criterion 1: Tenant project/episode/task/media isolation (cross-tenant probing returns 404)
- **Status:** **PASS**
- **Evaluation & Evidence:**
  - `backend/src/utils/ownership.ts`: Implements `getDramaIfAuthorized`, `getEpisodeIfAuthorized`, `getStoryboardIfAuthorized`, and `validateDramaOwnershipOfEntities`.
  - In server mode (`isServerMode()`), all queries strictly require `schema.dramas.ownerUserId === actor.userId`. If a user attempts to probe an entity owned by another tenant (Drama, Episode, Storyboard, Character, Scene, Prop, Task, Merge, AI Config, Flow Bridge ref, or Agent chat), the backend returns `404 Not Found` rather than leaking existence with `403` or disclosing metadata.
  - Cross-tenant injection attacks (e.g. creating an episode with an attacker's session pointing to a victim's `drama_id`, or merging storyboards across different owners) are rejected with `404` or `400` ("部分镜头不属于该剧集").
  - Verified across 13 cross-tenant attack scenarios in `backend/tests/ownership-a3.test.ts`.

### Criterion 2: Tora identity contract and multi-key stability per account
- **Status:** **PASS**
- **Evaluation & Evidence:**
  - `new-api/controller/huobao.go`: `GetHuobaoIdentity` returns a stable integer `user_id`, `token_id`, `username`, `display_name`, `account_status`, `token_status`, `quota`, and `user_quota`.
  - When a user generates multiple API keys (Key 1, Key 2) under the same New-API account, both keys resolve to the exact same `user_id`.
  - `backend/src/routes/auth.ts`: Users are identified and stored by `(issuer: 'tora', external_user_id: identity.userId)`. Switching keys on the same account authenticates to the identical Huobao `user.id`, preserving access to previously created dramas.
  - Verified in `controller/huobao_test.go` (`A0.1`, `A0.2`, `A0.3`) and `backend/tests/auth-a1.test.ts` (`A1.2`).

### Criterion 3: Unowned legacy project protection (owner_user_id = NULL never public, never auto-assigned)
- **Status:** **PASS**
- **Evaluation & Evidence:**
  - `backend/src/utils/ownership.ts` (`getDramaOwnerCondition`): In server mode, if `ownerUserId` is `NULL`, it matches nothing (`eq(schema.dramas.id, -1)`). Unowned legacy projects are never exposed to public requests or logged-in users.
  - `backend/src/routes/auth.ts`: First-time user login only performs an upsert into `users` and inserts a session into `auth_sessions`. It does not claim or auto-assign unowned dramas.
  - `backend/scripts/manage-ownership.ts`: Provides a dedicated admin CLI tool (`preview`, `allocate`, `restore`) with SQLite-consistent backup (`backupDatabase`, `restoreDatabase` via `better-sqlite3.backup()`), ensuring manual audit before any ownership mapping is applied.
  - Verified in `backend/tests/migration-a2.test.ts` and `backend/tests/ownership-a3.test.ts` (lines 249–252).

### Criterion 4: Media asset protection with Range 206 support, signed URLs, and directory traversal rejection
- **Status:** **PASS**
- **Evaluation & Evidence:**
  - `backend/src/utils/media-auth.ts`: Replaces anonymous static serving with `handleAuthenticatedMedia`.
  - Directory Traversal: `cleanPath.includes('..') || path.isAbsolute(cleanPath)` returns `403 Forbidden`.
  - Authentication & Tenant Isolation: In server mode, unauthenticated access returns `401 Unauthorized`; probing another user's file returns `404 Not Found`.
  - Video Streaming: Integrated with `videoFileResponse` to handle HTTP `Range` requests, returning `206 Partial Content` with `Content-Range: bytes START-END/TOTAL` and `Cache-Control: private, max-age=3600`.
  - Signed URLs: Supports HMAC-signed URLs (`generateSignedMediaUrl` / `verifySignedMediaUrl`) with timestamps, allowing external AI providers (e.g. Aliyun DashScope, Seedance) to download references without a session cookie. Tampered or expired signatures return `401`.
  - Verified in `backend/tests/media-a4.test.ts` and `backend/tests/video-file-response.test.ts`.

### Criterion 5: Zero-quota account experience: view projects, play media, BYOK keys, blocked from managed video
- **Status:** **PASS**
- **Evaluation & Evidence:**
  - `new-api/controller/huobao.go` (`authenticateHuobaoToken`): Separates key/account validity from quota. An active token with 0 quota is valid for identity (`GetHuobaoIdentity` returns 200). Disabled, expired, or banned tokens return 401/403.
  - Zero-quota users can log into Huobao, view their drama list, load episodes, and stream existing videos.
  - Direct BYOK keys: Users can configure custom AI service configs (`ai_service_configs`) with their own provider keys.
  - Managed Video Blocking: When attempting to submit a managed video task, `ReserveHuobaoVideoTask` checks `spendableQuota < requiredQuota` and returns `402 Payment Required` (`"insufficient wallet or token quota to reserve video task"`). No task is enqueued in `sys_task`.
  - Verified in `controller/huobao_test.go` (`A0.4`, `A5.2`) and `backend/tests/billing-a5.test.ts` (`A5.2`, `A5.3`).

### Criterion 6: Centralized credit billing: atomic reservation, successful output seconds only, 0 fee on failure, duplicate idempotency
- **Status:** **PASS**
- **Evaluation & Evidence:**
  - `new-api/model/wallet_pre_consume.go` & `controller/huobao.go`:
    1. **Atomic Pre-Consume Reservation:** `PreConsumeUserWallet` executes in a database transaction with `FOR UPDATE` lock, decrementing user quota and creating a pending `WalletPreConsumeRecord`.
    2. **Successful Output Seconds Only:** On success, `SettleUserWalletPreConsumeWithActual` computes `actualAmount = actualDurationSeconds * rate`. If `preConsumed > actualAmount`, the unused surplus is immediately credited back to the user wallet (`IncreaseUserQuotaTx`) within the transaction.
    3. **0 Fee on Failure:** If video generation fails (timeout, upstream rejection, prompt violation), `RefundUserWalletPreConsume` refunds 100% of the reservation back to user quota. The net fee charged is exactly 0.
    4. **Duplicate Idempotency:** Settle and refund operations verify `record.Status == "pending"`. Re-calling settle/refund on an already settled or refunded record returns immediately without double-charging or double-refunding.
  - `backend/src/services/generation.ts`: Integrates `createTask` with reservation, `handleVideoComplete` with actual duration settlement, and `failTask` with full refund.
  - Verified in `controller/huobao_test.go` (`A5.3`–`A5.6`) and `backend/tests/billing-a5.test.ts` (`A5.4`–`A5.7`).

### Criterion 7: Credential security: no raw API keys in responses, logs, or browser storage
- **Status:** **PASS**
- **Evaluation & Evidence:**
  - Server Storage: Credentials are encrypted using AES-256-GCM (`encryptCredential`, `decryptCredential`) with random IV and authentication tag.
  - Browser Storage: `frontend/app/composables/useAuth.ts` maintains credentials only in memory. Session state is stored via `HttpOnly`, `Lax`, `secure` cookies (`huobao_session`). No raw API keys are stored in `localStorage` or `sessionStorage`.
  - Response Masking: Endpoints returning API keys (`/ai-configs`, `/auth/login`, `/auth/me`) mask raw keys using `maskApiKey` (e.g. `sk-...cdef`). Responses never return raw keys.
  - Request Logging: `backend/src/middleware/logger.ts` (`requestLogger`) logs only method, path, HTTP status, and duration (never request bodies or headers).
  - Task Logging: `backend/src/utils/task-logger.ts` redacts sensitive fields (`authorization`, `api_key`, `token`) to `***` and sanitizes URLs with `redactUrl`. Frontend `useApi.ts` sanitizes console logs with `sanitizeForLog`.
  - Verified in `backend/tests/auth-a1.test.ts`, `backend/tests/request-logger.test.ts`, and `controller/huobao_test.go` (`A0.9`).

---

## 4. Legacy vs. New Defect Analysis

- **Huobao Multi-User & Tora Implementation:** 0 new defects, 100% pass across all new tests (31/31).
- **Observed Legacy Issue in `frontend/tests/story-mode.test.mjs`:**
  - 3 tests fail in `story-mode.test.mjs` (`sanitizeMediaUrl`, `extractSafeShotImage`, `resolveFinalVideo`).
  - **Root Cause:** Prior Story Mode work configured `NUXT_APP_BASE_URL: '/storyvdo/'` in `frontend/nuxt.config.ts`, and updated `sanitizeMediaUrl` in `frontend/app/utils/story-mode.mjs` to prepend `/storyvdo/static/...`. The unit tests in `story-mode.test.mjs` were still expecting `/static/...` without the `/storyvdo/` prefix.
  - **Impact:** This does not impact multi-user auth, tenant isolation, or billing. As per PO guidelines (*"แยก legacy failures จากข้อบกพร่องใหม่"*), this is recorded as a legacy test expectation mismatch.

---

## 5. Deployment & Operation Verification Summary

1. **Local Desktop Mode:** Run without `HUOBAO_SERVER_MODE` (or `HUOBAO_SERVER_MODE=false`). Unowned local dramas remain accessible without login.
2. **Server Multi-User Mode:** Set `HUOBAO_SERVER_MODE=true` in `backend/.env`. All non-public APIs require a valid Tora session. Unowned legacy data is shielded (404).
3. **Database Migration & Ownership Allocation:**
   - Dry run / inventory check: `npx tsx scripts/manage-ownership.ts preview`
   - Explicit allocation: `npx tsx scripts/manage-ownership.ts allocate --drama <id> --user <target_user_id>`
   - Rehearsal backup/restore: `backupDatabase()` & `restoreDatabase()` preserve 100% row counts and schema integrity.

---

## 6. QA Recommendation & Sign-Off

The multi-user and Tora/New-API integration fully satisfies all PO requirements in `ANTIGRAVITY_MULTI_USER_TASK_TH.md` (lines 63–77). All core milestones A0 through A5 are verified and ready for sign-off.
