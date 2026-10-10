# Dev task S1 — Story Mode read-only workspace

Human approved the Story Mode plan and authorized Codex to manage Dev/QA. This round is S1, a complete read-only view of existing story data, not the full paid pipeline. Workspace: /Users/noppanan/huobao-drama. Preserve unrelated flow-drama-autopilot/flow-agent-ref and all existing project/media data. All shell commands start with rtk. No deployment, push, commit, dependency installs, credential reads, permission edits, or paid AI requests.

Use ECC TDD criteria from ecc/tdd-guide.md. The plan/reuse phase is already approved in ../STORY_MODE_IMPLEMENTATION_PLAN_TH.md. Do not re-plan the whole feature. Begin with a small behavioral failing test, implement, validate. Dev is not QA and cannot accept its own delivery.

## Scope and approach

Add a Story Mode view for an existing drama, routed alongside the real current Nuxt/Vue routes. Read current router configuration first (frontend/app/router.options.ts may not exist; use actual nuxt hooks/components). Keep existing studio routes intact. Add a clearly discoverable link on frontend/app/views/drama/detail.vue. Reuse dramaAPI.get, episodeAPI.storyboards and existing merge result APIs in frontend/app/composables/useApi.ts. GET only in S1. The detail response includes episodes: inspect backend/src/routes/dramas.ts only to establish the response contract; do not alter backend.

Show story title/brief, an episode selector, total seconds from actual storyboard durations (not episodes.duration, which has legacy minutes), ordered shot cards with description/prompt and existing media, readiness/progress, an existing final video result if present, and links to the selected episode's existing studio. Handle loading, no episodes, no shots, failed GET + retry, and completed output. Async selection changes must not display a previous episode's late response. Preserve source data; no POST/PUT/DELETE from S1.

Provide a simple story brief display/form, but do not imply editing is persisted: either read-only controls with explanation, or label edits as draft-only with no enabled save. AI plan/create-all actions remain visibly pending/disabled until S2-S4; no fake success or fake credits. Use existing style tokens/components, accessible labels/navigation, Thai/English and fallback text for other supported locales. Do not use v-html for story content or expose configs/keys. Result/media links must use the existing local media convention safely.

Keep scope frontend-only: new view/page and a small shared pure projection helper if useful; detail link; affected locale keys; meaningful Node tests + test fixtures. No workflow run table or schema/central billing change in S1. Read only targeted source files; avoid repeatedly opening the huge episode.vue. Use a helper and Node built-in tests for ordering, seconds, missing/failed/completed states rather than a test that merely greps the implementation.

## Acceptance

1. Existing drama → Story Mode → select episode → ordered shots/progress/result → open existing studio works without changing backend data.
2. Empty/error/loading states usable. Legacy episode duration does not become video seconds. Switching episodes cannot mix results. Existing media remains reachable and user text is escaped.
3. No enabled paid generation/credit mutation or silently enabled save. Direct/studio routes and provider setup unchanged.
4. Record real red/green check evidence if permitted; otherwise record denied commands and NOT RUN. No fabricated screenshot, build result or coverage. Report changed files and actual scope.

## Verification and delivery

Prefer rtk node --test frontend/tests/story-mode.test.mjs and rtk node --experimental-test-coverage --test frontend/tests/story-mode.test.mjs (adapt filename to actual new test and report exact command). Existing relevant route/model selection/launcher tests as needed. Frontend canonical build: rtk npm --prefix frontend run build. Do not introduce a new test framework. Timebox this round to four minutes; stop coherently and return any pending work rather than continuing hidden after timeout.

Write DELIVERY_S1.md here: changed files, route, behavioral test count, actual red/green commands/results, build/coverage/denials, limitations, S2 frontier. Final response must name delivery/artifacts and whether edits occurred. If RunCommand is denied, use scoped file tools for source/test edits and accurately mark command checks NOT RUN; do not bypass permission or keep retrying the same denied command.
