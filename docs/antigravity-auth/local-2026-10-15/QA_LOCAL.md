# Independent QA Local Runtime Verification Report

- **Date:** 2026-10-15T09:11:24+0700
- **Verdict:** **PASS**
- **Test Mode:** Actual Runtime (Node v26 / Hono Backend / Nuxt Frontend / Chromium Browser)
- **Target Base URL:** `http://localhost:3013/storyvdo/`
- **Backend API:** `http://localhost:5679`
- **Synthetic Tora Upstream Fixture:** `http://127.0.0.1:54811` (PID: 4236)

---

## 1. Summary of Execution

| Check Category | Result | Details |
|---|---|---|
| **Backend TypeScript Typecheck** | **PASS** | `tsc --noEmit` exit code 0 |
| **Isolated Unit/Integration Tests** | **PASS** | 6/6 test suites executed in isolated temp SQLite/data |
| **Backend Runtime Listener** | **PASS** | Port 5679, PID 4574 (Alive: True) |
| **Frontend Nuxt Dev Server** | **PASS** | Port 3013, PID 4575 (Alive: True) |
| **Synthetic Upstream Fixture** | **PASS** | Port 54811, PID 4236 (Alive: True) |
| **Real API & Nuxt Proxy Matrix** | **PASS** | 16/16 contract & tenant checks executed |
| **Browser Playwright E2E** | **PASS** | 5 browser journey steps verified |

---

## 2. Unit & Integration Test Suites (Per File)

| Test File | Status | Exit Code | Duration | Tests / Pass / Fail |
|---|---|---|---|---|
| `backend/tests/auth-a1.test.ts` | **PASS** | 0 | 826.47ms | 3/3/0 |
| `backend/tests/ownership-a3.test.ts` | **PASS** | 0 | 1524.2ms | 1/1/0 |
| `backend/tests/media-a4.test.ts` | **PASS** | 0 | 478.53ms | 1/1/0 |
| `backend/tests/migration-a2.test.ts` | **PASS** | 0 | 474.94ms | 1/1/0 |
| `backend/tests/billing-a5.test.ts` | **PASS** | 0 | 1159.48ms | 1/1/0 |
| `backend/tests/request-logger.test.ts` | **PASS** | 0 | 241.97ms | 5/5/0 |

---

## 3. Real API Contract & Tenant Isolation Checks

| Check ID | Description | Status | Evidence |
|---|---|---|---|
| `API-01` | Unauthenticated request rejected with 401 | **PASS** | Returned HTTP 401 |
| `API-02` | Invalid login key rejected with 401 | **PASS** | Returned HTTP 401 |
| `API-03` | User A login with Key A1 | **PASS** | User ID: 1 |
| `API-04` | User A creates drama project | **PASS** | Drama A ID: 1 |
| `API-05` | User B login with Key B | **PASS** | User ID: 2 |
| `API-06` | User B creates drama project | **PASS** | Drama B ID: 2 |
| `API-07` | User A list includes Drama A and excludes Drama B | **PASS** | Returned IDs: [1] |
| `API-08` | User B list includes Drama B and excludes Drama A | **PASS** | Returned IDs: [2] |
| `API-09` | User B GET Drama A returns 404 | **PASS** | HTTP 404 |
| `API-10` | User B PUT Drama A returns 404 | **PASS** | HTTP 404 |
| `API-11` | User B DELETE Drama A returns 404 | **PASS** | HTTP 404 |
| `API-12` | Secondary Key A2 sees existing Drama A | **PASS** | User ID: 1 |
| `API-13` | Zero-credit user logs in successfully | **PASS** | Spendable credits: 0 |
| `API-14` | Logged out session invalidated (401) | **PASS** | Returned HTTP 401 |
| `API-15` | Fabricated session token rejected with 401 | **PASS** | HTTP 401 |
| `API-16` | Nuxt Vite proxy correctly forwards API to backend | **PASS** | Proxy response: {'status': 'ok', 'timestamp': '2026-10-15T02:11:36.998Z'} |

---

## 4. Browser Playwright E2E Verification

- **Browser Launched:** True (bundled-chromium (headless=false) mode)
- **Executed Steps (5):**
  - `anon_view`: **PASS** (#tora-api-key visible: true)
  - `user_a_login`: **PASS** (User: Test User A, Drama A present: true, Drama B absent: true)
  - `user_b_login`: **PASS** (User: Test User B, Drama B present: true, Drama A absent: true)
  - `cross_tenant_browser_denied`: **PASS** (API 404 returned: true (status 404), Drama A title absent: true)
  - `logout_flow`: **PASS** (#tora-api-key visible: true, /auth/me status: 401)

- **Artifacts Captured (5 screenshots, 2 traces):**
  - Screenshot: `screenshot_01_anon_login_dialog.png`
  - Screenshot: `screenshot_02_user_a_dashboard.png`
  - Screenshot: `screenshot_03_user_b_dashboard.png`
  - Screenshot: `screenshot_04_cross_tenant_denied.png`
  - Screenshot: `screenshot_05_logged_out.png`
  - Trace: `trace_user_a.zip` (contains synthetic fixture sessions only)
  - Trace: `trace_user_b.zip` (contains synthetic fixture sessions only)

---

## 5. Explicit QA Boundaries (NOT RUN)

The following areas were intentionally bounded and **NOT RUN** to guarantee safety and prevent accidental production side effects:
1. **Live Production Tora Authentication:** Verified via loopback synthetic fixture contract only. Fixture credits are explicitly synthetic.
2. **Real Payment / Credit Billing Transactions:** Tested via quota contracts; no real credit charges executed.
3. **Paid Video Rendering Workers:** GPU/Colab/R2 cloud worker calls not dispatched.
4. **Real MySQL Production Migration:** Isolated SQLite test DBs used; production data untouched.

---

## 6. Running Services & Process Control

Local child listeners left running on successful execution:
- Backend: PID `4574` on `http://localhost:5679`
- Frontend: PID `4575` on `http://localhost:3013/storyvdo/`
- Synthetic Tora: PID `4236` on `http://127.0.0.1:54811`

To stop all three processes when testing is finished:
```bash
kill 4574 4575 4236
```
