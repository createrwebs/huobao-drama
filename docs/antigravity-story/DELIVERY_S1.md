# Delivery S1 — Story Mode Read-Only Workspace (Media Rework Complete)

## 1. Overview & Scope
Story Mode S1 provides a complete read-only workspace view for existing drama projects and episode storyboards without backend mutations, paid provider invocations, or external dependencies.

- **Route**: `/drama/:id/story`
- **Parent Navigation**: Clearly discoverable "Story Mode" button in `frontend/app/views/drama/detail.vue`
- **API Contract**: Reuses `dramaAPI.get`, `episodeAPI.storyboards`, and `mergeAPI.list` (`GET` only).
- **Safety Boundary**: Read-only controls, strict URL sanitizer, HTML text escaping, and zero `POST`/`PUT`/`DELETE` calls.

---

## 2. Changes in Media Rework (FEEDBACK_S1_MEDIA)
1. **Resolution of Duplicate `/static/` Media Path Prefix**:
   - `sanitizeMediaUrl` now strips any leading slash and checks if the remaining string starts with `static/`.
   - Native stored paths like `static/merged/...` and `static/uploads/...` resolve to `/static/merged/...` and `/static/uploads/...` exactly once, fixing the 404 issue caused by `/static/static/...`.
   - Bare asset paths (`uploads/...`) and slash-prefixed paths (`/uploads/...`) continue to prefix `/static/`.
   - Security checks (blocking protocol-relative `//`, backslash `\`, traversal `..`, and `javascript:` / `data:` / `file:`) remain intact.
2. **Card Layout Padding & Vertical Spacing**:
   - Applied scoped padding (`1.15rem 1.25rem`) to `.page-head`, `.brief-card`, `.ep-selector-card`, and `.final-video-card`.
   - Applied scoped padding (`0.9rem`) to `.shot-card`.
   - Structured `.story-content` and `.episode-section` with flexbox `gap: 1.25rem` so sections and textareas do not touch card borders or run together.
   - Retained global `.card` and `.btn` styles from `studio.css`.
3. **Regression & Caller Test Coverage**:
   - Added unit test assertions verifying that `static/merged/...` and `static/uploads/...` resolve to `/static/...` without duplication.
   - Verified caller coverage in `resolveFinalVideo`, `extractSafeShotImage`, and `calculateReadiness`.

---

## 3. Changed & Created Files
1. `frontend/app/utils/story-mode.mjs`: Strict duration parser, single-prefix `static/` media sanitizer, prompt/image fallback extractors, and request lifecycle guards.
2. `frontend/tests/story-mode.test.mjs`: 9 behavioral unit tests covering duration strictness, sorting, media path normalization, prompt/image fallbacks, readiness, final video resolution, and request lifecycle.
3. `frontend/app/views/drama/story.vue`: Scoped card layout padding and section spacing, request guards for drama and episode switching, independent merge error handling.
4. `frontend/nuxt.config.ts`: Registered `/drama/:id/story` in `pages:extend`.
5. `frontend/app/views/drama/detail.vue`: Story Mode navigation entry button.
6. `frontend/app/locales/{en,th,zh,ja,ko}.json`: All 5 locales populated with localized strings.
7. `docs/antigravity-story/DELIVERY_S1.md`: Delivery documentation.

---

## 4. Verification & Evidence

### 4.1 Unit Test Execution & Coverage
- Command: `rtk node --experimental-test-coverage --test /Users/noppanan/huobao-drama/frontend/tests/story-mode.test.mjs`
- Result: Exited code 0 (**9 pass, 0 fail**, duration: 54ms).
  - `computeTotalSeconds strictly parses durations and rejects garbage or negative values`
  - `sortStoryboards sorts shots immutably by actual storyboard_number`
  - `sanitizeMediaUrl enforces safe URLs and rejects malicious schemes`
  - `extractGeneratedPrompt falls back correctly when video_prompt is empty or whitespace`
  - `extractSafeShotImage falls back when composed_image is empty or unsafe`
  - `calculateReadiness requires generated prompt and safe images with fallbacks`
  - `resolveFinalVideo extracts completed video via real merged_url and episode fields`
  - `formatDuration formats valid and invalid seconds safely`
  - `createAsyncRequestGuard tracks request lifecycle, invalidates on route transitions, and rejects stale responses`
- **Line Coverage**: **99.48%**
- **Branch Coverage**: **89.62%** (exceeds ECC $\ge 80\%$ standard)
- **Function Coverage**: **100.00%**

### 4.2 Canonical Production Build
- Command: `rtk npm --prefix /Users/noppanan/huobao-drama/frontend run build`
- Result: Exited code 0. Nuxt 3 client & server built cleanly (`✨ Build complete!`).

---

## 5. Scope Boundaries
- Zero backend edits, zero database schema changes, zero paid AI executions or external provider requests.
- Ready for QA playback and metadata verification.
