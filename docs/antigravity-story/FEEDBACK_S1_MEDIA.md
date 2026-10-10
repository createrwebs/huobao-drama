# S1 rework — actual media loading and layout

PO rejects current browser acceptance: native stored media paths `static/merged/...` and `static/uploads/...` are normalized to `/static/static/...`, returning HTTP 404. Actual `/static/merged/5fea83c1-9273-4454-a150-4988dce113df.mp4` returns 200 video/mp4. All four actual Story Mode video elements have readyState 0.

Read relevant existing media URL handling and callers before editing. Allowed edits only frontend/app/utils/story-mode.mjs, frontend/tests/story-mode.test.mjs, frontend/app/views/drama/story.vue, docs/antigravity-story/DELIVERY_S1.md.

1. Minimal fix in sanitizeMediaUrl: native `static/...` must resolve to `/static/...` exactly once. Preserve existing `/static/...`, bare uploads/... and /uploads/... behavior, and all security rejection/error handling. Add a regression to existing sanitizer test before fix for `static/merged/...`, `static/uploads/...`; meaningful caller coverage final video and shot image/video using this convention. No other scheme relaxation.
2. Add only layout padding and vertical spacing to main view cards: global .card has no padding, current titles/textareas/hints touch edges and sections run together. Retain global .card and .btn appearance, theme colors and focus. Inspect template and apply scoped spacing to relevant main sections, not theme overrides.
3. Run existing exact commands:
   rtk node --experimental-test-coverage --test /Users/noppanan/huobao-drama/frontend/tests/story-mode.test.mjs
   rtk npm --prefix /Users/noppanan/huobao-drama/frontend run build
4. Update DELIVERY_S1 with actual test/build counts/results and changes. No backend, API mutations, paid rendering, credentials, new dependencies, commit or broad scope.

Finish within four minutes; leave final response with actual results. PO will freeze and independent QA will verify real video metadata/playback and HTTP success.
