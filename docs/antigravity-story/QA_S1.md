# Independent QA Report — Story Mode S1 Media Recheck

**QA Owner**: Independent QA (Separate from Dev)  
**Execution Timestamp**: 2026-10-10T04:13:51+07:00  
**Target Environment**: `http://localhost:3013`  
**Verdict**: **PASS (Bounded to S1 Read-Only Scope)**

---

## 1. Executive Summary & Quality Context

### 1.1 Media Defect & Resolution
In earlier QA rounds, video elements on `/drama/2/story` were rendered with duplicated `/static/static/...` paths (due to a double `/static` prefix bug in `sanitizeMediaUrl`), causing HTTP 404 responses and leaving `video.readyState` stuck at `0`.

Following Dev Round 6 fixes and strict QA assertion hardening:
- `sanitizeMediaUrl` normalizes static media paths to `/static/...` without path doubling.
- Main card CSS paddings and spacing are verified via strict computed style assertions:
  - `.final-video-card`: computed padding-top = `18.4px`, padding-left = `20px` (`1.15rem 1.25rem`).
  - `.shot-card`: computed padding-top = `14.4px` (`0.9rem`).
  - `.shots-grid`: computed gap = `16px` (`1rem`).
- Real media validation now strictly enforces:
  - **HTTP status**: 200 or 206 Partial Content.
  - **Content-Type**: strictly contains `video/` (e.g. `video/mp4`).
  - **Duration & Dimensions**: strictly finite and positive (`duration > 0`, `videoWidth > 0`, `videoHeight > 0`).
  - **ReadyState**: `readyState >= 1` (all 4 videos reached `4` / `HAVE_ENOUGH_DATA`).
- **Playback Actuation**: Programmatic playback is actuated strictly on the **final merged video** (`currentTime` advancing to `0.56s` out of 30.04s). HTTP response and metadata are verified for all 4 videos.

### 1.2 Bounded Verdict
- **Verdict**: **PASS (Bounded)**
- **Scope Boundary**: Confirms S1 read-only workspace, layout, and media presentation. No paid generation, Tora credit accounting, prompt regeneration, or backend database migrations are implemented or verified in this milestone.

---

## 2. Authorized Command Executions & Results

All authorized commands executed with exit code 0:

| # | Permitted Command | Exit | Results / Counts | Duration |
| :---: | :--- | :---: | :--- | :---: |
| 1 | `rtk node --test /Users/noppanan/huobao-drama/frontend/tests/story-mode.test.mjs` | **0** | **9 pass, 0 fail** | 58.0ms |
| 2 | `rtk node --experimental-test-coverage --test /Users/noppanan/huobao-drama/frontend/tests/story-mode.test.mjs` | **0** | **9 pass, 0 fail**<br>• Line: **99.48%**<br>• Branch: **89.62%**<br>• Funcs: **100.00%** | 78.7ms |
| 3 | `rtk npm --prefix /Users/noppanan/huobao-drama/frontend run build` | **0** | **Nuxt 3 / Nitro Build Complete** (`✨ Build complete!`) | 3.8s |
| 4 | `rtk python3 /Users/noppanan/huobao-drama/docs/antigravity-story/qa_s1.py` | **0** | **26 pass, 0 fail** (Chromium launched in `headless=False`) | ~8.5s |

---

## 3. Real Media Audit & Playback Verification (`/drama/2/story`)

All four video elements on `/drama/2/story` were programmatically audited with strict assertions:

| Video Element | Resolved Path (`src`) | HTTP Status | Content-Type | ReadyState | Duration | Resolution |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Final Merged Video** | `/static/merged/5fea83c1-9273-4454-a150-4988dce113df.mp4` | **206** | `video/mp4` | **4** | 30.04s | 1280x720 |
| **Shot 1 Video** | `/static/uploads/71a6e419-a569-4d1c-8bd9-6893d3170d35.mp4` | **206** | `video/mp4` | **4** | 10.01s | 1280x720 |
| **Shot 2 Video** | `/static/uploads/d55548f3-8ef8-466d-8fb1-12e8621ea87d.mp4` | **206** | `video/mp4` | **4** | 10.01s | 1280x720 |
| **Shot 3 Video** | `/static/videos/92c7128d-550d-4850-a009-574f218ffa4d.mp4` | **206** | `video/mp4` | **4** | 10.01s | 1280x720 |

### 3.1 Playback & Visual Evidence
- **Playback Actuation (Final Video Only)**: The final merged video was programmatically played (muted) via Playwright; `currentTime` advanced from `0.000s` to **`0.560s`** (out of 30.04s duration) without errors, and was paused before downstream navigation.
- **Card Styling & Padding (Strict Numeric Checks)**:
  - `.final-video-card`: `padding: 18.4px 20px` (`finalPadTop > 0`).
  - `.shot-card`: `padding: 14.4px` (`shotPadTop > 0`).
  - `.story-brief-card`: `briefPadTop > 0`.
  - `.shots-grid`: `gridGap: 16px` (`shotsGridGap > 0`).

---

## 4. Complete Browser Test Breakdown (26 Checks)

1. **Server Reachability** (`PASS`): Connected to `http://localhost:3013`.
2. **Browser Launch** (`PASS`): Launched Chromium headed window with `th-TH` locale.
3. **Prompt Fallback to Image Prompt** (`PASS`): Rendered `Fallback Image Prompt Shot 2` when `video_prompt` was empty/whitespace.
4. **Image Fallback to First Frame Image** (`PASS`): Rendered `/static/fixtures/shot2_frame.png` when `composed_image` was empty string.
5. **Shot Description XSS Protection** (`PASS`): `<script>` tags in shot description rendered as escaped text without execution (`window.__SHOT_XSS__` is undefined).
6. **Partial Readiness Accuracy** (`PASS`): Episode 101 correctly calculated **33%** (`ความพร้อมของตอน: 33%`) for 1 of 3 shots completed in video. Description text is not falsely counted as a prompt.
7. **Exact Storyboard Duration Sum** (`PASS`): Summed storyboards duration to **11 วินาที (00:11)**, strictly ignoring legacy `episodes.duration` (45m).
8. **Readonly Brief & Disabled AI Action** (`PASS`): Story brief textarea is strictly `readonly`; AI Plan button has `disabled` and `aria-disabled="true"`.
9. **Unsafe Media URL Rejection** (`PASS`): `javascript:` and `//` schemes rejected; UI rendered `.media-placeholder`.
10. **Merge Error Banner & Shots Preservation** (`PASS`): Initial 500 error on merge fetch preserved all 3 loaded storyboards; `.merge-error-box` appeared.
11. **Merge Error Retry Recovery** (`PASS`): Clicking retry on merge error box loaded `/static/fixtures/merged_ep1.mp4` and revealed `.final-video-player`.
12. **Complete Readiness Accuracy** (`PASS`): Episode 103 fixture (2 of 2 video shots) calculated and displayed **100%** (`ความพร้อมของตอน: 100%`).
13. **Empty Shots State (Episode 102)** (`PASS`): Switching to Episode 102 rendered `.state-box` with text `ไม่พบช็อตสตอรี่บอร์ดในตอนนี้`.
14. **Async Race Setup Confirmation** (`PASS`): Confirmed delayed route callback for Episode 102 started before switching back to Episode 101.
15. **Episode Token Race Guard** (`PASS`): Delayed Episode 102 response was discarded by `createAsyncRequestGuard`; Episode 101 shots and active tab remained intact.
16. **No Episodes State (Drama 997)** (`PASS`): Navigating to Drama 997 rendered `.state-box` with text `ไม่พบตอนในเรื่องนี้`.
17. **Drama GET 500 Error Display** (`PASS`): Navigating to Drama 996 rendered `.error-box`.
18. **Episode Shots GET 500 Error Display** (`PASS`): Episode 109 initial storyboards request returned 500, rendering episode `.error-box`.
19. **Episode Shots GET 500 Retry Recovery** (`PASS`): Clicking retry on episode error box successfully loaded `Recovered Shot 1`.
20. **Visual Main-Card Styles & Spacing** (`PASS`): Verified card paddings (`final=18.4px 20px`, `shot=14.4px`) and spacing (`gridGap=16px`) with strict positive numeric assertions.
21. **Real Drama Content Verification** (`PASS`): Title `ย้อนเวลาไปเป็นราชายุคสุโขทัย`, 3 cards, duration **30 วินาที (00:30)**.
22. **Real Media HTTP & Metadata Validation** (`PASS`): All 4 videos verified without double static (HTTP 206, `Content-Type: video/mp4`, `readyState == 4`, `duration > 0`, finite non-zero dimensions).
23. **Final Video Real Playback Actuation (Final Video Only)** (`PASS`): Actuated playback on final merged video; `currentTime` advanced to `0.56s` (out of 30.04s).
24. **Real Drama Studio Navigation** (`PASS`): Navigated to `http://localhost:3013/drama/2/episode/1`.
25. **Real Drama Detail Entry Button** (`PASS`): Verified `.story-mode-entry-btn` on `/drama/2`.
26. **Zero Mutation Enforcement** (`PASS`): Zero `POST`, `PUT`, `PATCH`, or `DELETE` requests initiated.

---

## 5. Scope Classification: NOT RUN State

### 5.1 Same-Component Live SPA Route-ID Inflight Race
- **Status**: **NOT RUN in Live Browser**
- **Rationale**: In the Vue/Nuxt application, Story Mode lives at `/drama/:id/story`. There is no in-app navigation element (e.g. dropdown or link) within `story.vue` to transition directly between different drama IDs; navigating between drama projects occurs via catalog/detail views, which unmounts the component. Address bar URL changes or full-page `goto` resets the document and does not test the SPA component guard.
- **Source Code & Unit Test Verification**:
  1. `story.vue` lines 346–348 invokes `episodeGuard.invalidate()` and `dramaGuard.start(id)` on every `loadData()`.
  2. `frontend/tests/story-mode.test.mjs` test 9 covers `createAsyncRequestGuard`:
     - Verifies `start(id)` increments tokens.
     - Verifies `invalidate()` immediately revokes older handles.
     - Verifies transition to new ID invalidates earlier tokens.
- **Manual Dev Harness Requirement**: Testing this specific live race requires adding an in-component debug switcher (e.g., `<button @click="navigateTo('/drama/1/story')">`) or an internal dev harness that drives client-side route parameter changes while an API request is artificially delayed.

---

## 6. Artifact Paths & Evidence Files

- **Screenshot — Actual Drama 2 (before detail navigation)**:  
  `/Users/noppanan/huobao-drama/docs/antigravity-story/qa-artifacts/run_20261010_041351/actual_drama_2_story.png`
- **Screenshot — Actual Drama 2 Video Playback Frame (0.56s)**:  
  `/Users/noppanan/huobao-drama/docs/antigravity-story/qa-artifacts/run_20261010_041351/actual_drama_2_story_playback.png`
- **Screenshot — Populated & Merge Recovered**:  
  `/Users/noppanan/huobao-drama/docs/antigravity-story/qa-artifacts/run_20261010_041351/01_populated_and_merge_recovered.png`
- **Screenshot — 100% Completed Episode**:  
  `/Users/noppanan/huobao-drama/docs/antigravity-story/qa-artifacts/run_20261010_041351/03_completed_episode_100pct.png`
- **Playwright Trace Archive**:  
  `/Users/noppanan/huobao-drama/docs/antigravity-story/qa-artifacts/run_20261010_041351/trace.zip`
- **Machine-Readable Run Summary (with Media Facts)**:  
  `/Users/noppanan/huobao-drama/docs/antigravity-story/qa-artifacts/run_20261010_041351/qa_run_summary.json`
- **Historical Evidence Preserved**:  
  - Initial run failure diagnostic: `run_20261010_035644/failure_diagnostic.png`
  - Previous run artifacts: `run_20261010_035706/`, `run_20261010_040128/`, and `run_20261010_040841/`
