# Independent Antigravity QA — S1 (five minute maximum)

Human authorized Codex to manage Dev/QA. You are a fresh Antigravity conversation, independent from Dev. Product files are READ-ONLY. Use ECC criteria in ecc/typescript-reviewer.md, ecc/code-reviewer.md, ecc/security-reviewer.md and ecc/e2e-runner.md. Scope only the actual S1 diff and acceptance from TASK_S1.md/DELIVERY_S1.md. Do not fix code or rewrite the whole plan. The plan gate is approved; commit is not requested. No paid generation, credential access, installs, permission edits, database writes, deploy or push.

Inspect frontend/app/views/drama/story.vue, frontend/app/utils/story-mode.mjs, frontend/nuxt.config.ts, the changed detail link, locales, and behavioral tests. Read neighboring patterns as needed. Specific security focus: escaped story input, safe media href/src values, no credential/config exposure, no mutation from the new view, and stale results when route/episode changes. Report exact-line concrete failures; do not manufacture stylistic findings. Review red/green/build evidence and coverage; never assume CLI SUCCESS is proof.

You may write only docs/antigravity-story/qa_s1.py and QA_S1.md. Python Playwright is installed on this machine. Use a small Python script to launch a real browser against http://localhost:3013 (headless=False preferred), mock GET responses for an isolated fixture drama/episodes via Playwright route interception, and fail/abort any POST/PUT/PATCH/DELETE caused by S1. Do not edit the user's real story or generate media. Save screenshot(s) and a trace under docs/antigravity-story/qa-artifacts/. Fixture media is test data, not a real generated video. No new package installation.

Test at least: populated ordered shots + correct seconds; no episodes/no shots; GET error + retry (drama, shots and merges); switching episodes and route drama ID while an old response is delayed; unsafe markup/media links cannot execute; pending AI/create-all actions disabled; selected-episode studio navigation points to the existing route; final result where fixture provides it. Actual API fields are storyboard_number, description, image_prompt, video_prompt, composed_image, first_frame_image, video_url; completed merges use merged_url. No fictional shot_number/prompt/image_url fixtures. Check Thai text/theme using real app conventions. Also do one read-only check of the existing real drama page if reachable. Use the actual new route from delivery, not guessed variants. Assert outcomes and retain diagnostic evidence for failures. Stop early on access blockers.

Only these exact terminal commands are permitted (all start rtk; no shell chains/redirection/bootstrap commands):

1. rtk node --test /Users/noppanan/huobao-drama/frontend/tests/story-mode.test.mjs
2. rtk node --experimental-test-coverage --test /Users/noppanan/huobao-drama/frontend/tests/story-mode.test.mjs
3. rtk npm --prefix /Users/noppanan/huobao-drama/frontend run build
4. rtk python3 /Users/noppanan/huobao-drama/docs/antigravity-story/qa_s1.py

Do not run rtk --version, which, arbitrary ls/git commands or invent flags; file tools suffice for inspection. If permitted commands are denied, preserve the reason and report NOT RUN/BLOCKED. Never bypass permission or count an unexecuted plan as browser testing.

QA_S1.md must contain verdict PASS/FAIL/PARTIAL/BLOCKED, exact command/exit/test counts, actual browser launch/headless mode, absolute screenshot/trace paths, code/security findings with file+line+scenario, coverage if actually measured, limitations and manual recheck. Return confirmed blockers promptly. Only mark PASS if required behavioral/build/browser checks pass. Product code remains read-only. Finish within five minutes; no hidden continuation after reporting final.
