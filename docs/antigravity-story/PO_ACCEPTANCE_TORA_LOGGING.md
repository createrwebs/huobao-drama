# PO acceptance — request-body logging prerequisite

10 ตุลาคม 2026: Codex PO รับงานหลัง QA Antigravity คนละ conversation จากผู้เขียน. Dev 873e25b8-3939-4b51-a029-dc48cf5b48f4; QA 4c842d89-5b20-49b9-a891-79291340ce8e.

ขอบเขต product diff: ลบ body cloning/read/print ใน backend/src/middleware/logger.ts; method/path/status/latency และ errorHandler คงเดิม. ไม่แก้ AI provider/config/generation/auth/DB. Regression เป็น Hono request จริงในหน่วยทดสอบด้วย synthetic sentinels; ไม่ใช้ key จริง.

Exact command: `rtk node --import /Users/noppanan/huobao-drama/backend/node_modules/tsx/dist/loader.mjs --test /Users/noppanan/huobao-drama/backend/tests/request-logger.test.ts`. Dev RED exit1 3fail/2pass; GREEN exit0 5pass; independent QA exit0 5pass/0fail. Raw proof dev-tora-logging-round2.ndjson และ qa-tora-logging-round1.ndjson; รายงาน QA_TORA_LOGGING.md. Hash audit frozen-logging-before-qa.json และ qa-logging-readonly-audit.json ยืนยัน QA ไม่แก้ product/test.

รับเฉพาะ prerequisite นี้. ไม่อ้างว่า logger ทั้งแอปปลอดภัยจากทุก error/upstream log; ไม่ใช่ implementation ของ Tora key/credit/billing. M1–M3 และ live New-API integration ยังไม่ผ่าน. ไม่มี commit/push/deployment.
