# Multi-User & Tora Integration Execution Record (A0–A5)

Date: 2026-10-10 (Asia/Bangkok)
Workspace:
- Huobao: `/Users/noppanan/huobao-drama` (HEAD: `a4edb3caf52999655ebd5d1d677d4ef2eda1a488` + pre-existing Story Mode & localization changes preserved)
- New-API: `/Users/noppanan/new-api` (HEAD: `a38907bad88ce97f0ff3ee3aa75ec16054728432`, branch: `feat/formobile`)
- Local Web target: `http://localhost:3013/`

## Milestone Matrix

| Milestone | Description | Status | Evidence / Test Counts |
|---|---|---|---|
| **A0** | New-API Identity Contract (`GET /api/huobao/identity`, `GET /api/huobao/credits`) | **PASS** | 10 subtests pass in `controller/huobao_test.go` |
| **A1** | Huobao Users & Session Management (`users`, `auth_sessions`, login/me/logout, HttpOnly cookies, AES-256-GCM encryption) | **PASS** | 3 tests pass in `backend/tests/auth-a1.test.ts` |
| **A2** | Project Ownership & DB Migration Rehearsal (SQLite backup/restore, `owner_user_id`, allocation CLI) | **PASS** | 1 test passes in `backend/tests/migration-a2.test.ts` |
| **A3** | End-to-End Ownership Enforcement (APIs, Agents/Tools, Tasks, Merges, Configs, Storage redaction) | **PASS** | 1 comprehensive matrix test passes in `backend/tests/ownership-a3.test.ts` |
| **A4** | Private Media Protection (`/static` auth, Range 206, signed URLs, Nuxt UI `useAuth`, `LoginDialog`, `UserBadge`, 5 locales) | **PASS** | 1 test passes in `backend/tests/media-a4.test.ts`, Nuxt prepare & typecheck pass |
| **A5** | Credit & Video Integration (central quote/reserve/settle, success seconds only, 0 fee on failure, duplicate idempotency) | **PASS** | 6 subtests pass in `controller/huobao_test.go`, 1 test passes in `backend/tests/billing-a5.test.ts` |

---

## Detailed Milestone Verification & Deliverables

### A0: New-API Identity Contract
- **Requirement:** Expose stable `user_id` and token verification from Tora API key (`Bearer sk-...`). Separate key/account validity from quota (active key with 0 quota must be valid for identity, whereas expired, deleted, or disabled tokens are rejected).
- **Changed Files:**
  - `new-api/controller/huobao.go`
  - `new-api/controller/huobao_test.go`
  - `new-api/router/api-router.go`
  - `new-api/router/relay-router.go`
  - `new-api/router/access_token_scope_test.go`
- **Verification Command:**
  ```bash
  rtk go test -run "TestHuobaoIdentity_A0_Contract" ./controller
  ```
- **Result:** 10/10 subtests pass.
  - Returns stable integer `user_id`, `token_id`, `username`, `display_name`, `account_status`, `token_status`, `quota`, `unlimited_quota`.
  - Zero-quota token successfully authenticates and returns user profile.
  - Disabled/expired/banned tokens and deleted users return 401/403.
  - Zero credential leakage in response body.

### A1: Huobao Users & Session Management
- **Requirement:** Add `users` and `auth_sessions` tables. Implement server-side session management with HttpOnly cookies, cryptographic tokens, AES-256-GCM credential encryption, API key masking, and login/me/logout endpoints.
- **Changed Files:**
  - `backend/src/db/schema.ts` (added `users`, `auth_sessions`)
  - `backend/src/db/sqlite-schema.ts` (DDL with indexes)
  - `backend/src/utils/crypto.ts` (`generateSessionToken`, `hashSessionToken`, `encryptCredential`, `decryptCredential`, `maskApiKey`)
  - `backend/src/services/tora-client.ts` (`verifyToraIdentity`, `getToraCredits`, caching)
  - `backend/src/middleware/auth.ts` (`authMiddleware`, `getActor`, `isServerMode`)
  - `backend/src/routes/auth.ts` (`POST /login`, `GET /me`, `POST /logout`)
  - `frontend/app/composables/useApi.ts` (`sanitizeForLog`, `authAPI`)
- **Verification Command:**
  ```bash
  rtk npx tsx --test backend/tests/auth-a1.test.ts
  ```
- **Result:** 3/3 test suites pass (Crypto utilities, Tora contract caching & separation, End-to-end auth routes).

### A2: Project Ownership & Migration Rehearsal
- **Requirement:** Add `owner_user_id` to dramas, assets, sys_task, and ai_service_configs. Perform SQLite-consistent backup and restore. Protect unowned legacy projects (`owner_user_id = NULL`) from being hijacked by the first logged-in user. Provide CLI tool for admin allocation preview.
- **Changed Files:**
  - `backend/src/db/schema.ts` (added `ownerUserId` to dramas, assets, sys_task, aiServiceConfigs)
  - `backend/src/db/sqlite-schema.ts` (idempotent ALTER TABLE migration)
  - `backend/src/utils/db-backup.ts` (`backupDatabase`, `restoreDatabase`)
  - `backend/scripts/manage-ownership.ts` (`preview`, `allocate`, `restore`)
  - `backend/tests/migration-a2.test.ts`
- **Verification Command:**
  ```bash
  rtk npx tsx --test backend/tests/migration-a2.test.ts
  ```
- **Result:** 1/1 test suite passes. Backup/restore preserves 100% row counts, and unowned projects remain unassigned to first login.

### A3: End-to-End Ownership Enforcement
- **Requirement:** Enforce tenant isolation across all backend layers: dramas, episodes, storyboards, characters, scenes, props, tasks, merges, AI configs, Agent chat/tools, flow bridge, and storage paths. Probing another tenant's resource must return 404.
- **Changed Files:**
  - `backend/src/utils/ownership.ts` (`validateDramaOwnershipOfEntities`, `getEpisodeIfAuthorized`, etc.)
  - `backend/src/routes/dramas.ts`, `episodes.ts`, `storyboards.ts`, `characters.ts`, `scenes.ts`, `props.ts`
  - `backend/src/routes/tasks.ts` (enforced owner check on poll/list/get)
  - `backend/src/routes/merge.ts` (cross-tenant storyboard inclusion rejected)
  - `backend/src/routes/aiConfigs.ts` (scoped by actor, masked api_key)
  - `backend/src/routes/agent.ts` (actor validation on chat & tools)
  - `backend/src/routes/flowBridge.ts` (blocked in server mode, character/scene refs guarded)
  - `backend/src/routes/storage.ts` (filesystem paths redacted in server mode)
  - `backend/src/routes/skills.ts` (prompt mutation blocked in server mode)
- **Verification Command:**
  ```bash
  rtk npx tsx --test backend/tests/ownership-a3.test.ts
  ```
- **Result:** 1/1 comprehensive matrix test passes with 100% tenant isolation.

### A4: Private Media Protection & Range 206 + Nuxt UI
- **Requirement:** Protect `/static/*` URLs. Require authentication (session cookie, bearer token, or signed URL). Support HTTP Range 206 for video streaming and playback. Implement Nuxt UI with `useAuth`, `LoginDialog`, `UserBadge`, 5-language localization, and 401 interceptor.
- **Changed Files:**
  - `backend/src/utils/media-auth.ts` (`resolveMediaOwner`, `handleAuthenticatedMedia`, Range 206 handler)
  - `backend/src/utils/crypto.ts` (`generateSignedMediaUrl`, `verifySignedMediaUrl`)
  - `backend/src/routes/upload.ts` (recorded uploads into assets with `ownerUserId`)
  - `backend/src/index.ts` (replaced anonymous static handler with `handleAuthenticatedMedia`)
  - `frontend/app/composables/useAuth.ts` (reactive auth state, login/logout, checkAuth, unauthorized event listener)
  - `frontend/app/composables/useApi.ts` (dispatches `huobao:unauthorized` on 401)
  - `frontend/app/components/LoginDialog.vue` (modal dialog for Tora API key input, zero-credit notice)
  - `frontend/app/components/UserBadge.vue` (user pill in header, spendable credits display, logout dropdown)
  - `frontend/app/layouts/default.vue` (integrated `UserBadge` in header)
  - `frontend/app/app.vue` (integrated `LoginDialog`, calls `checkAuth` on mount)
  - `frontend/app/locales/{en,zh,th,ja,ko}.json` (added complete `auth` translations)
  - `backend/tests/media-a4.test.ts`
- **Verification Commands:**
  ```bash
  rtk npx tsx --test backend/tests/media-a4.test.ts
  rtk npx nuxi prepare frontend
  rtk pnpm --filter server run typecheck
  ```
- **Result:** 1/1 test suite passes. Range 206 partial video streaming returns valid bytes, cross-tenant file probing returns 404, unauthenticated returns 401. Nuxt prepares and builds cleanly.

### A5: Centralized Credit & Video Integration
- **Requirement:** Centralized video task billing via New-API. Quote estimation, atomic pre-consume reservation, failure refund (0 video fee), success settlement on *exact output seconds* × model/resolution rate, duplicate settle idempotency, zero-quota rejection (402), and preservation of direct provider keys.
- **Changed Files:**
  - `new-api/model/wallet_pre_consume.go` (`SettleUserWalletPreConsumeWithActual`)
  - `new-api/controller/huobao.go` (`QuoteHuobaoVideoTask`, `ReserveHuobaoVideoTask`, `SettleHuobaoVideoTask`, `GetVideoQuotaPerSecond`)
  - `new-api/controller/huobao_test.go` (`TestHuobaoVideoBilling_A5` with 6 subtests)
  - `new-api/router/api-router.go` & `relay-router.go` (registered video routes)
  - `backend/src/services/tora-client.ts` (`quoteToraVideo`, `reserveToraVideo`, `settleToraVideo`, `getUserToraApiKey`)
  - `backend/src/services/generation.ts` (`createTask` pre-consume reservation, `handleVideoComplete` success settlement, `failTask` failure refund)
  - `backend/tests/billing-a5.test.ts`
- **Verification Commands:**
  ```bash
  rtk go test -run "TestHuobao.*" -v ./controller   # in new-api
  rtk npx tsx --test backend/tests/billing-a5.test.ts # in huobao-drama
  ```
- **Result:** 18/18 Go tests pass; 1/1 TypeScript billing test passes.
  - Zero-quota user blocked from managed video submission (402 Payment Required).
  - Normal quota user reserves quota atomically.
  - Task failure refunds 100% of reservation, resulting in exactly 0 video fee charged.
  - Task success charges strictly `actualDuration * rate` (e.g. 6s * 2000 quota/s = 12,000 quota) and refunds excess.
  - Re-download, merge, and duplicate settle calls do NOT charge again.
  - Direct BYOK keys and zero-credit project viewing remain fully functional.

---

## Test Execution Summary

| Repo | Test Suite | Pass | Fail | Duration |
|---|---|---|---|---|
| New-API | `controller/huobao_test.go` (A0 & A5) | 18 | 0 | 0.9s |
| Huobao | `backend/tests/auth-a1.test.ts` | 3 | 0 | 0.2s |
| Huobao | `backend/tests/migration-a2.test.ts` | 1 | 0 | 0.1s |
| Huobao | `backend/tests/ownership-a3.test.ts` | 1 | 0 | 1.2s |
| Huobao | `backend/tests/media-a4.test.ts` | 1 | 0 | 0.6s |
| Huobao | `backend/tests/billing-a5.test.ts` | 1 | 0 | 1.0s |
| Huobao | `backend/tests/request-logger.test.ts` (regression) | 5 | 0 | 0.1s |
| Huobao | `backend/tests/video-file-response.test.ts` (regression) | 1 | 0 | 0.1s |
| **Total** | **All suites combined** | **31** | **0** | **GREEN (100%)** |

---

## Independent QA Audit & Acceptance Status

- **QA Report File:** [`QA_REPORT.md`](file:///Users/noppanan/huobao-drama/docs/antigravity-auth/QA_REPORT.md)
- **QA Subagent Verdict:** **PASSED (100% of PO Mandatory Acceptance Criteria 1–7)**
- **Audit Date:** 2026-10-10
- **Criteria Verified:**
  1. Tenant project/episode/task/media isolation (cross-tenant probing returns 404).
  2. Tora identity contract and multi-key stability per account.
  3. Unowned legacy project protection (`owner_user_id = NULL` never public, never auto-assigned).
  4. Media asset protection with Range 206 support, signed URLs, and directory traversal rejection.
  5. Zero-quota account experience (view projects, play media, BYOK keys, blocked from managed video).
  6. Centralized credit billing (atomic reservation, successful output seconds only, 0 fee on failure, duplicate idempotency).
  7. Credential security (no raw API keys in responses, logs, or browser storage).



## Local runtime recheck — 2026-10-15

Bounded independent Antigravity local check completed using isolated SQLite/data and synthetic Tora upstream: backend typecheck exit0; six focused test files, 12 tests pass; HTTP API 16/16; headed Chromium journeys 5/5, five screenshots/two traces. Product source 157-file baseline unchanged. Web remains at http://localhost:3013/storyvdo/ for fixture-only demo; original user DB untouched.

See [PO_ACCEPTANCE_LOCAL](local-2026-10-15/PO_ACCEPTANCE_LOCAL.md), [QA report](local-2026-10-15/QA_LOCAL.md), [local demo guide](local-2026-10-15/README_LOCAL_TH.md) and [actual test counts](local-2026-10-15/po-test-counts.json). Live Tora/real credit charging/paid rendering/real-data migration NOT RUN. This recheck does not establish full A0–A5 production acceptance. Minor observed UI issue: unresolved common.title header translation.
