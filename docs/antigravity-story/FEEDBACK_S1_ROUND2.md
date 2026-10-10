# Dev rework: scoped operations are now explicitly allowed

Round 1 stopped on an unrelated bootstrap command (`rtk --version || which rtk || echo ...`) before edits. CLI SUCCESS with empty response is NOT a delivery. Do not retry that command or run any bootstrap/git/listing commands. rtk works; cwd is /Users/noppanan/huobao-drama. Use read/list/grep file tools for inspection.

PO will add only exact write paths and exact verification commands for this authorized S1. Use these exact file names: frontend/app/views/drama/story.vue, frontend/app/utils/story-mode.mjs, frontend/tests/story-mode.test.mjs; register /drama/:id/story in frontend/nuxt.config.ts and add the entry in frontend/app/views/drama/detail.vue. Locale files th/en/zh/ja/ko.json and DELIVERY_S1.md are allowed. No other product files are allowed this round. Import the pure helper as an ordinary Vite module; preserve current conventions. Prefer read-only brief controls in S1.

Only run these exact commands (no chains, redirects, shell probes, or cwd changes):

1. rtk node --test /Users/noppanan/huobao-drama/frontend/tests/story-mode.test.mjs
2. rtk node --experimental-test-coverage --test /Users/noppanan/huobao-drama/frontend/tests/story-mode.test.mjs
3. rtk npm --prefix /Users/noppanan/huobao-drama/frontend run build

Write the meaningful failing test first, run command 1, then implement and run the same test and coverage/build. Do not ask to approve anything broader or modify permission settings. Start the file changes promptly; read only the necessary sections of large files. Keep task scope from TASK_S1.md. Return a coherent partial delivery if four minutes is insufficient, naming unfinished items. No paid providers, backend/data changes or commits.
