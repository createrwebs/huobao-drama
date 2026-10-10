# PO acceptance — S1 read-only Story Mode and native skills

10 ตุลาคม 2026 (Asia/Bangkok). Codex PO รับงานเฉพาะ S1 และ native continuity skills หลังตรวจ source diff, independent Antigravity QA และ artifacts จริง. User approved plan; Dev/QA คนละ conversation; ใช้ authenticated agy CLI ไม่ใช่ Gemini API key. ไม่มี paid calls/commit/push/deploy.

## Accepted

- /drama/:id/story อ่านละคร/ตอน/ช็อตเดิม แสดง brief แบบ read-only, ordered cards, ผลรวม duration ของ storyboards เป็นวินาที, readiness ของสื่อที่มี, final merged video และลิงก์ studio. ลิงก์เข้าจาก detail. ไม่เขียนทับข้อมูลหรือเปิด generation/AI actions ที่ยังไม่ implement.
- Error/retry แยก drama, shots และ merge; merge GET fail ยังรักษาช็อตเดิม. Async episode requests ทิ้งผลช้า; drama/episode guards แยก. Prompt/image empty strings มี fallback ที่ถูกต้อง. User text escaped; unsafe URLs rejected.
- PO ส่งกลับ Dev เมื่อ actual videos เป็น /static/static/... 404 แม้ QA DOM checks ผ่าน. Dev round6 แก้ stored static/... convention และ house card spacing. Final QA ตรวจไฟล์จริง 4 ไฟล์ HTTP206 video/mp4, readyState4, duration finite positive และ 1280x720; เล่นเฉพาะ final video เวลาเดิน 0.56s และ pause ก่อน navigation. ไม่ถือ label requested seconds เป็น actual billing usage.
- Native continuity skills ไทย/base fallback ผ่าน actual Huobao loader 6 tests. Sources pin c2426e03c0e7722bebcc6a488b6658dc38c65ac3 from zenstory-ai/drama-skills, MIT attribution retained. ใช้ start/action/end, physical continuity locks, first-frame=start, real reference distinction และไม่ overwrite finished media. ไม่ติดตั้ง upstream CLI/framework.

## Exact validation

| Command | Owner | Result |
|---|---|---|
| rtk node --test /Users/noppanan/huobao-drama/frontend/tests/story-mode.test.mjs | S1 independent QA | exit0, 9pass/0fail |
| rtk node --experimental-test-coverage --test /Users/noppanan/huobao-drama/frontend/tests/story-mode.test.mjs | S1 independent QA | exit0, 9pass; line99.48%, branch89.62%, funcs100% |
| rtk npm --prefix /Users/noppanan/huobao-drama/frontend run build | S1 independent QA | exit0, Nuxt/Nitro build complete after last product edit |
| rtk python3 /Users/noppanan/huobao-drama/docs/antigravity-story/qa_s1.py | S1 independent QA | exit0, 26pass/0fail, headed Chromium; final stricter assertions run |
| rtk node --import /Users/noppanan/huobao-drama/backend/node_modules/tsx/dist/loader.mjs --test /Users/noppanan/huobao-drama/backend/tests/story-continuity-skills.test.ts | skills independent QA | exit0, 6pass/0fail, 4suites |

Final UI evidence: qa-artifacts/run_20261010_041351/qa_run_summary.json, actual_drama_2_story_playback.png and trace.zip; QA_S1.md and qa-s1-round7-final-run.ndjson. Earlier failed/partial runs retained; PASS applies only to final stated scope. Pure-helper/build evidence is qa-s1-round5-media.ndjson (product unchanged for harness-only rounds6/7). Native report QA_SKILLS.md.

Scope proof: source-audit.json (139 tracked baseline sources, exactly8 approved changed files), locale-audit.json (29 new keys per five locales, no original keys changed/deleted), qa-readonly-audit.json (181 frozen files, no S1 QA edits). A separate concurrent Dev intentionally removed request-body logging in logger.ts; its own independent QA/hash acceptance is PO_ACCEPTANCE_TORA_LOGGING.md. No route/schema/generation/adapter changes.

## Not accepted / NOT RUN

- S2 protected AI draft/publish, S3 durable create-all/recovery and S4 Tora M1–M3 are unimplemented. S1 cannot yet generate a new complete story automatically. Original Huobao/Firemux key card is still unchanged. Main Tora key/credit/success-only billing objective is not complete.
- Same-component live SPA route-ID inflight race NOT RUN: no public in-component switch between drama IDs; source/helper guards reviewed. Address-bar/full-page goto is not proof of this race.
- Real LLM output quality/render quality, new paid provider job, staging billing/ledger and production integration NOT RUN. Existing local media playback is real but predates this work.
- Tora production probe had TLS SSL_ERROR_SYSCALL exit35 and no HTTP reply. This limits live testing, not local implementation. Colab/Drive/H3 and TTS remain parked per plan.
- Global header common.title is a pre-existing untranslated label; not introduced or corrected in S1. No broad legacy suite/new billing safety claim.

Next priority remains central M1 read-only token/wallet credit contract + safe masked Tora connection without locking direct providers, then M2 success settlement and M3 managed generation/recovery. Story S2/S3 must preserve existing media/revisions and stay disabled for paid paths until settlement is verified. No production price/host/policy guesses.
