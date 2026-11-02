# Prompt ที่ตรวจและแก้แล้ว: Vast.ai Render Orchestrator สำหรับ Tora StoryVDO

วันที่ตรวจ: 28 ตุลาคม 2026 (Asia/Bangkok)

สถานะ: **แผนผ่านการ review เอกสารแล้ว แต่ยังไม่อนุมัติให้เปิดใช้เงินจริงหรือ deploy production**

ไฟล์นี้แทน prompt เดิมที่ผู้ใช้แนบมา และใช้เป็น brief สำหรับ Dev/QA รอบถัดไปได้เลย การแก้ครั้งนี้แก้เฉพาะแผน ยังไม่ได้แก้โค้ดระบบ Vast/Worker/R2 ที่มีอยู่ใน working tree

## ผลตรวจและจุดที่แก้

| ระดับ | ข้อบกพร่องใน prompt เดิม | กติกาใน prompt ฉบับนี้ |
|---|---|---|
| Blocker | สมมุติ endpoint Vast, query field, HTTP method และ response shape โดยไม่ตรวจเอกสาร/บัญชีจริง | ทำ contract probe กับ official docs และ mock server ก่อนเขียน adapter; ห้าม fallback จาก API error เป็นข้อมูลปลอม |
| Blocker | $20 ถูกใช้เหมือนเครดิตลูกค้า ทั้งที่เป็นเงินสำรองบัญชี Vast ของแพลตฟอร์ม | แยก operator Vast balance, customer quote และ Tora credit ledger คนละ domain; ห้ามหักหรือแสดงปะปน |
| Blocker | GPU/TFLOPS/ราคา/VRAM เป็นค่าตายตัวและบางรุ่นไม่เหมาะกับ Wan 14B | ใช้ catalogue เป็น metadata ที่ตรวจแหล่งที่มา; availability/capability ต้องมาจาก offer จริงและ workflow smoke test; 16GB ห้ามอ้างว่ารัน 14B ได้ |
| Blocker | สูตร duration × 16 + 1 และชื่อ ComfyUI nodes ถูกถือเป็นมาตรฐานสากล | ให้ adapter ของ workflow ตรวจ node registry/version และ frame constraints ของ container จริงก่อนคำนวณ/ส่งงาน |
| Blocker | worker/global queue ใช้ shared token และไม่มี claim lease/idempotency | ใช้ per-job short-lived credential, atomic claim lease, fencing token, signed callback และ retry/reconcile ที่ไม่ยิงงานซ้ำโดยเดา |
| Blocker | R2 มีแนวคิด direct upload แต่ไม่มี ownership, checksum, quota enforcement และ signed URL policy | key ผูก owner/job, upload ด้วย presigned URL จาก backend, HEAD/size/checksum verify, signed GET เท่านั้น, quota เป็น server-side fact |
| Critical | Vast key/R2 secret/worker secret มีทาง default/mock ในโค้ดหรือ prompt | production fail-closed เมื่อ secret/config หาย; ไม่มี hardcoded secret, default token, fake balance หรือ fake instance ใน production/test acceptance |
| Critical | Vast account operations และ instance destroy ไม่กำหนดสิทธิ์ | balance/search/create/destroy เป็น operator/admin-only และผูก instance lease กับ job/owner; user ทั่วไปห้ามเห็นบัญชี Vast หรือสั่งลบของคนอื่น |
| Critical | ไม่มี state machine ที่ durable และ recovery เมื่อ host preempt, timeout, backend restart หรือ upload สำเร็จไม่ครบ | เพิ่ม durable run/job/lease state, idempotency key, timeout/reconcile, artifact verification และ teardown ที่ทำซ้ำได้ |
| High | ไม่แยก direct provider/BYOK กับ managed Tora path | Vast เป็น managed render path แยกจาก direct provider และ Tora video billing ตาม successful output seconds; ห้าม gate หรือคิดเงินเส้นทางอื่นเงียบ ๆ |
| High | สั่งให้ AI เขียน “ทั้งระบบ” และเลือก framework ใหม่ได้ | แก้ของเดิมใน Hono/Nuxt/Drizzle ตามไฟล์จริง; ห้ามเปลี่ยน framework, schema หรือเพิ่ม microservice โดยไม่มี ADR/หลักฐานจำเป็น |
| High | ไม่มี test/evidence gate และเสี่ยงใช้ mock เป็นหลักฐาน production | แบ่ง fixture/local, Vast contract, Comfy smoke, R2 integration, adversarial security และ live canary; สถานะที่ยังไม่รันต้องเป็น NOT RUN/PARTIAL/BLOCKED |

## หลักฐานจาก working tree ที่ต้องแก้ก่อนเรียกว่าเสร็จ

ตรวจ source ปัจจุบันพบว่ามีส่วนที่เกี่ยวข้องอยู่แล้ว เช่น `backend/src/routes/vast.ts`, `backend/src/services/vast-client.ts`, `backend/src/routes/worker.ts`, `backend/src/utils/r2-storage.ts` และ `backend/src/services/workflows/wan2.1-i2v-workflow.json` ดังนั้น Dev ต้อง review/แก้ของเดิมก่อนเพิ่มไฟล์ใหม่

พบความเสี่ยงสำคัญใน source ปัจจุบันที่ prompt เดิมไม่ได้ห้ามไว้:

- Vast routes ยังต้องพิสูจน์ว่าเป็น admin/operator-only ทั้ง balance, search, create และ destroy
- Vast client มี mock balance/offer/instance fallback; ห้ามให้ fallback เหล่านี้ทำงานใน server/production mode หรือถูกนับเป็น acceptance
- R2 config มี fallback credential ใน source; ต้องลบและ fail closed เมื่อ environment ไม่ครบ พร้อมตรวจ secret rotation
- worker มี default shared token และ poll queue แบบ global; ต้องเปลี่ยนเป็น per-job credential + lease/claim ที่ผูก owner
- worker job รับ `screenshot_url` จาก request และมีเส้นทาง callback/upload ที่ต้องตรวจ SSRF, signature, owner, checksum และ replay
- `app_settings` ที่เก็บ Vast key เป็น global platform secret; ต้องกำหนด admin-only access, encryption/rotation และห้ามคืนค่า raw key

หลักฐานข้างต้นเป็นเหตุผลให้ **ยังไม่เริ่ม render จริงและยังไม่ deploy** จนกว่า gates ในเอกสารนี้จะผ่าน

## --- BEGIN PROMPT ---

คุณคือ Senior Cloud Systems Architect และ Full-Stack AI Engineer ให้พัฒนา **Vast.ai Cloud GPU Render Orchestrator สำหรับ Tora StoryVDO** บน codebase ที่มีอยู่จริง

### 1. Workspace และเอกสารที่ต้องอ่าน

ทำงานใน:

- Huobao: `/Users/noppanan/huobao-drama`
- New-API: `/Users/noppanan/new-api` เฉพาะ contract/เครดิตที่ต้องเชื่อม

อ่านก่อนแก้:

1. `AGENTS.md` และ `/Users/noppanan/.codex/RTK.md`
2. `docs/HUOBAO_MULTI_USER_PLAN_TH.md`
3. `docs/HUOBAO_NEW_API_INTEGRATION_PLAN_TH.md`
4. `docs/STORY_MODE_IMPLEMENTATION_PLAN_TH.md`
5. `docs/VAST_AI_DETAILED_EXECUTION_PLAN_TH.md`
6. `docs/VAST_AI_COMFYUI_R2_QUOTA_PLAN_TH.md`
7. `docs/VAST_AI_BATCH_RENDER_PLAN_TH.md`
8. `docs/VAST_AI_GITHUB_RESEARCH_TH.md`
9. `docs/VAST_AI_TEMPLATE_PROMPT_REF_SPEC_TH.md`
10. `docs/VAST_AI_UI_FLOW_DESIGN_TH.md`
11. `backend/src/routes/vast.ts`, `backend/src/services/vast-client.ts`, `backend/src/routes/worker.ts`, `backend/src/utils/r2-storage.ts`, `backend/src/services/workflows/wan2.1-i2v-workflow.json`
12. schema/migration, auth/ownership middleware, task/generation/merge/storage code และ tests ที่เกี่ยวข้อง

ใช้ `rtk` นำหน้าทุก shell command บันทึก baseline/diff ก่อนแก้ และรักษา staged/unstaged work เดิม ห้าม reset, overwrite หรือแก้ไฟล์ QA เพื่อทำให้ผลผ่าน

### 2. ขอบเขตและสิ่งที่ห้ามสมมุติ

- ใช้ Hono + TypeScript + Drizzle + MySQL runtime และ Nuxt/Vue ที่มีอยู่ ห้ามเปลี่ยน framework; SQLite ใช้ได้เฉพาะ isolated fixture/desktop transitional mode ตามส่วน B
- Vast เป็น **platform operator infrastructure** ไม่ใช่บัญชี Vast ของ user และไม่ใช่ Tora wallet
- direct provider/BYOK/Flow ยังคงเส้นทางเดิม ไม่ถูกบังคับผ่าน Vast หรือ Tora โดยอัตโนมัติ
- ห้าม hard-code API key, R2 secret, worker token, URL ที่มี credential, password หรือ default production secret
- ห้ามมี fake balance, fake offer, fake instance หรือ “success” จาก mock ใน server/production mode; mock ใช้เฉพาะ isolated tests ที่ระบุชัด
- ห้ามใช้ `screenshot_url`, `r2_key`, owner ID, price, duration หรือ success status จาก client เป็นหลักฐานสิทธิ์/การคิดเงิน
- ห้ามเรียก Vast, R2, Tora, ComfyUI จริงก่อนผ่าน local contract tests และ explicit canary gate

### 3. Contract-first discovery ก่อนเขียน adapter

ทำเอกสาร `docs/vast-render/CONTRACTS.md` ระบุ source URL, ตรวจวันที่, request/response ตัวอย่างแบบ redacted และสิ่งที่ยังไม่ยืนยัน สำหรับ:

- Vast account balance, offer search, create/instance status/destroy, billing/lease/preemption semantics
- ComfyUI `/system_stats`, `/prompt`, `/history`, `/ws`, upload/input และ custom node registry
- R2 S3 Put/Head/Get, presigned URL, checksum/ETag และ lifecycle/quota behavior
- Tora/New-API identity/credits/quote/reserve/settle ที่ใช้กับ managed video

ถ้า endpoint/field/method ใดพิสูจน์ไม่ได้ ให้ทำ adapter เป็น `NOT_CONFIGURED` และหยุด canary จุดนั้น ห้ามเดา endpoint แล้ว fallback เป็น mock

### 4. Domain และ billing ที่ต้องแยกกัน

เก็บข้อมูลเป็นคนละชุด:

1. **Vast operator cost**: actual lease seconds, rate, instance/offer, preemption, teardown และ platform cost
2. **Customer render quote**: estimate ที่มี expiry, markup/config snapshot, currency และ minimum price ถ้ามีนโยบายอนุมัติ
3. **Tora managed video billing**: reserve/settle ตาม successful output seconds × model/resolution rate จาก New-API; failed output = 0; usage unknown = `usage_pending` ไม่เดา
4. **R2 storage quota**: bytes ที่ตรวจจาก object metadata ต่อ owner ไม่ใช่ตัวเลขประมาณจากจำนวนช็อต

การเปลี่ยนราคากลางคันต้องไม่เปลี่ยน quote/job snapshot เดิม การดาวน์โหลดซ้ำ/merge ซ้ำ/retry callback ไม่คิดเงินซ้ำ และ login/key ใหม่ไม่ย้าย owner หรือ billing binding ของงานที่เริ่มแล้ว

### 5. Auth, ownership และ operator control

- ทุก request ที่เกี่ยวกับ drama/episode/storyboard/task/asset/file ต้องผ่าน actor จาก session และ ownership helper เดิม
- Vast account endpoints และ instance teardown เป็น admin/operator-only; user เห็นเฉพาะ quote, job ของตน และสถานะที่ redacted
- `vast_api_key` ถ้าเก็บใน DB ต้องเข้ารหัส, masked response, audit access, rotation และห้าม log; production ขาด secret ให้ fail closed
- worker ใช้ credential ต่อ job ที่สุ่ม, หมดอายุ, ผูก job/owner/audience และใช้ครั้งเดียว/มี replay protection; ห้าม default shared token
- callback จาก worker ต้องมี signature, timestamp/nonce, job ID, instance ID และตรวจ state transition แบบ idempotent
- input URL ทุกตัวต้องเป็น object ที่ backend ออก signed URL หรือ allowlist เท่านั้น; ห้าม worker fetch arbitrary URL (ป้องกัน SSRF)

### 6. Durable state machine และ idempotency

สร้างหรือ reuse ตารางที่พิสูจน์ได้สำหรับ run/job/instance lease/artifact โดยมีอย่างน้อย:

```text
draft → quoted → reserved → provisioning → booting → ready
→ rendering → uploading → verifying → completed
                         ↘ retryable_failure / needs_reconcile / failed
                         ↘ cancelled → tearing_down → destroyed
```

- ทุก create/claim/submit/callback/settle/teardown มี idempotency key และ payload fingerprint
- worker claim ใช้ transaction/compare-and-swap พร้อม lease expiry และ fencing token; งานหนึ่งไม่ถูก claim สอง worker พร้อมกัน
- restart, network timeout, host preemption และ upload timeout ต้อง reconcile จากหลักฐานเดิมก่อน retry; ห้าม resubmit provider job เพราะไม่พบ response
- teardown ต้อง retry ได้และมี orphan-instance reconciler สำหรับงานที่ DB กับ Vast ไม่ตรงกัน
- auto-stop 180 วินาทีเป็น grace policy ที่ configurable ไม่ใช่ guarantee; ห้ามหยุด instance ที่มี leased/running job, pending upload, unknown state หรือ lock ของอีก run
- manual stop ต้องแยก `cancel_requested` กับ `destroyed` และแสดงว่าค่าใช้จ่ายสุดท้ายยังรอ reconcile

### 7. Vast adapter และ GPU capability

- ค้น offer จาก official contract ที่ตรวจแล้ว; normalize units/field names และเก็บ raw response แบบ redacted สำหรับ diagnostics
- catalogue 15 รุ่นเป็น UI metadata เท่านั้น ไม่ใช้แทน availability, actual VRAM, driver, CUDA, price หรือ capability ของ offer
- Wan 2.1 14B ต้องมี capability matrix ที่ทดสอบจริง (VRAM, precision, offload, resolution, fps, custom nodes); 16GB เป็น profile โมเดลเบา/preview เท่านั้นจนกว่าจะมีหลักฐาน
- rate card/markup/FX/minimum price เป็น config ที่ versioned และ admin-only; ห้าม hard-code live market price เป็นข้อเท็จจริง
- ตรวจ balance ก่อน reserve ด้วย operator policy ที่ configurable; ค่า `$20` เป็น **operator reserve guard เท่านั้น** ไม่ใช่ user credit และห้ามแสดงเป็นยอดของ user
- create/destroy/status ต้องรองรับ HTTP timeout, retry policy, rate limit, error classification และ request correlation ID โดยไม่ log bearer key

### 8. ComfyUI Video Generation Models & Multi-Architecture Workflows

ระบบต้องรองรับ 3 โมเดลทางเลือกตามความต้องการของผู้ใช้:
1. **Cobijada MiniMax-H3 Hybrid Pruned (INT8)** (`Winnougan/Cobijada_Minimax-H3_Hybrid_Pruned_ComfyUI`):
   - โหมด Cinematic HD + Foley Audio: สถาปัตยกรรม Joint Audio-and-Video DiT รวม First/Last Keyframe (FL) และ Reference-driven (REF) สำหรับงานดราม่าที่เน้นอารมณ์สีหน้าตัวละครสมจริงแบบ Hailuo AI พร้อมสร้างเสียงบรรยากาศและ Foley ในตัว
   - VRAM: ~19.5 GB (รันบน 24GB GPUs เช่น RTX 3090, 4090 ได้สบาย)
2. **FastWan 2.2 TI2V 5B FullAttn** (`FastVideo/FastWan2.2-TI2V-5B-FullAttn-Diffusers`):
   - โหมด Fast Turbo Draft: กลั่นกรองโมเดลด้วย DMD รันเพียง **3 steps** จบใน **3-5 วินาทีต่อช็อต** เหมาะสำหรับพรีวิวด่วนหรืองานสปีดจัด ช่วยลดต้นทุน GPU 10 เท่า
   - VRAM: 16 GB+ (รันบน RTX 4070 Ti Super, RTX 3090)
3. **Wan 2.1 14B Image-to-Video** (FP8 Baseline):
   - โหมด Studio Standard 720p 16FPS: 25 steps คมชัด รายละเอียดฉากและแสงเงาสูง

- ใช้ container image digest, ComfyUI version และ custom-node commit ที่ pin ไว้; ไม่ใช้ `latest` เป็น production dependency
- workflow JSON ต้องเป็น output จาก node registry/version ที่ตรวจแล้ว มี schema validation และ smoke workflow (มีเทมเพลตใน `backend/src/services/workflows/`)
- frame count เป็น function ของ adapter ที่ตรวจ constraint ของโมเดล/container จริง
- validate resolution/fps/duration/seed/prompt/negative prompt และ reference inputs ด้วย allowlist; reject unsupported combinations ก่อน reserve
- start frame/character reference ต้องใช้ signed object URL ที่ owner อนุญาตและบันทึก hash; ไม่มี reference ให้สถานะ `reference_missing`
- custom R2 upload node ห้ามถือ long-lived R2 secret; worker ใช้ presigned PUT ที่ผูก key/content-type/expiry/job และ backend ตรวจ HEAD, size, MIME, checksum, duration และ playable container ก่อน completed

### 9. Provisioning, SSH Automation และ worker

- SSH Key Automation: ผู้ใช้มี SSH Public Key อยู่ที่ `/Users/noppanan/.ssh/id_ed25519.pub` ตอนสั่งจองเครื่อง Vast.ai ให้รองรับการส่ง SSH Public Key เข้าไปใน Instance (ผ่าน API `ssh_key` field หรือ account key) เพื่อรองรับ Local Port Forwarding (`ssh -p <port> root@<host> -L 8188:127.0.0.1:8188`) สำหรับมอนิเตอร์และดีบักสด
- ใช้ image/model manifest ที่มี URL allowlist, SHA-256, expected bytes และ disk/VRAM preflight
- ดาวน์โหลดโมเดลด้วย `aria2c -x 16 -s 16` จาก fast mirror เข้าโฟลเดอร์โมเดล ComfyUI
- worker ไม่รับ Vast API key และไม่สั่ง destroy เองจาก client; worker ทำ render/upload/callback ตาม scoped job token เท่านั้น
- health readiness ต้องตรวจ process, model loaded, free VRAM, disk, Comfy queue และ version—not HTTP 200 อย่างเดียว
- progress เป็น telemetry ที่ไม่น่าเชื่อถือจนกว่าจะมี artifact verification; client ห้ามส่ง completed/actual duration เอง

### 10. R2 quota, privacy และ media serving

- object key รูปแบบ `users/{ownerId}/runs/{runId}/shots/{shotId}/...` ที่สร้างจาก server เท่านั้น; ไม่รับ path จาก client
- ทุก object มี owner/job/content-type/size/checksum/duration/createdAt และสถานะ retention
- quota 5 GB เป็น policy config; enforcement ใช้ transactional reservation + verified HEAD/usage aggregation และ cleanup policy ไม่ใช่ `shots × 15 MB`
- private object ใช้ signed GET หรือ authenticated range proxy; ห้าม public domain/immutable public cache สำหรับ media ส่วนตัว
- upload/download limits, content validation, path traversal, oversized response และ deletion/retention ต้องมี tests

### 11. API/UI ที่ต้องทำบนโครงสร้างเดิม

ใช้ route/service ที่มีอยู่ก่อน ถ้าต้องเพิ่มให้กำหนด contract และ owner guard ก่อน:

- quote/search: อ่านได้ตามสิทธิ์; operator-only สำหรับข้อมูล Vast ที่ละเอียด
- create run/claim/status/cancel/retry/download: owner + idempotency + state transition
- admin settings: Vast key/rate card/provider manifest ไม่คืน secret
- UI แสดง estimate พร้อม `estimate` label, actual cost แยกภายหลัง, Tora credit แยกจาก Vast reserve, job status และ reason ที่อ่านได้
- ปุ่ม destroy แสดงผลกระทบและยืนยันซ้ำ; ไม่อ้างว่า stop สำเร็จจน API/state verify แล้ว
- Story Mode/episode ที่มีอยู่ต้องไม่เสีย; direct provider/BYOK ไม่ถูกย้ายเข้าคิว Vast โดยอัตโนมัติ

### 12. Tests และ acceptance gates

เขียนและรันตามลำดับ โดยเก็บ command/exit/count/artifact และแยกสถานะ:

1. **Static/security gate**: no secrets/defaults/mock production path, route auth/ownership, SSRF/path/URL validation, logs redacted
2. **Unit**: frame adapter, quote/markup separation, idempotency/state transitions, quota accounting, checksum/duration validation
3. **Contract fixtures**: Vast/ComfyUI/R2/Tora request-response fixtures with malformed/error/rate-limit/timeout cases
4. **Local integration**: isolated SQLite + fake Vast + fake Comfy + fake S3/R2; no paid calls; duplicate/restart/preemption/upload failure
5. **Browser QA**: two user contexts + operator context; cross-owner task/file/instance probes; screenshots/trace
6. **Canary**: one approved GPU, one short non-production shot, explicit operator approval, actual artifact and teardown evidence; no batch rollout

Acceptance ต้องพิสูจน์อย่างน้อย: user A/B isolation, A1/A2 same-account ownership, no fake success without configured provider, duplicate submit no duplicate job/charge, host preemption recovery, private R2 range playback, completed output verified, failed output zero video fee, operator-only Vast controls, and teardown with no orphan instance.

### 13. Deliverables ที่ตรงกับ repo นี้

- contract/review: `docs/vast-render/CONTRACTS.md`, `THREAT_MODEL.md`, `STATE_MACHINE.md`, `RUNBOOK.md`
- backend: reuse/extend `backend/src/services/vast-client.ts`, `backend/src/routes/vast.ts`, existing task/generation/storage/auth helpers; add migrations and tests only when required
- worker: pinned container/onstart/Comfy adapter with manifest, no secrets, job-scoped auth and callback verification
- workflow: versioned JSON plus node registry/container digest and smoke fixture; no generic “production workflow” claim without execution
- frontend: update existing `VastRenderModal.vue`/API composables only after backend contracts; show estimate vs actual and operator reserve separately
- tests/evidence: isolated fixtures, contract logs, browser artifacts, canary report, and explicit NOT RUN list

ห้ามสร้าง `vast-orchestrator.ts` แบบ standalone ที่ซ้ำ logic กับ `vast-client.ts` โดยไม่ตรวจ callers ก่อน ห้ามเปลี่ยน schema/ลบข้อมูลเดิม และห้ามเรียก live provider เพื่อให้แผนดูเหมือนผ่าน

### 14. Definition of Done

งานจะถือว่าผ่านเมื่อ source, tests, docs และ evidence สอดคล้องกันทั้งหมด; ไม่มี secret/default/mock production path; route/file/job isolation ผ่าน; state/idempotency/recovery ผ่าน; R2 artifact verified; Tora billing separation ผ่าน; canary หนึ่งงานสำเร็จและ teardown ตรวจได้

ถ้า external contract, credentials, price, model node หรือ live canary ยังตรวจไม่ได้ ให้รายงาน `BLOCKED` หรือ `PARTIAL` พร้อมสิ่งที่ต้องใช้ต่อ ห้ามเขียนคำว่า production-ready จาก fixture อย่างเดียว

## --- END PROMPT ---

## สรุปสถานะหลัง review

- เอกสารแผนแก้แล้วและยังไม่ได้เริ่ม implementation รอบใหม่
- โค้ด Vast/Worker/R2 ที่มีอยู่ใน working tree เป็นงานก่อนหน้า ยังไม่ถือว่าผ่าน prompt ฉบับนี้
- ก่อนเริ่ม Dev ต้องแก้ secret/default/mock/operator-control blockers ตามหลักฐานข้างต้น และสร้าง contract docs ก่อน
- live Vast/Tora/R2/Comfy render ยังเป็น `NOT RUN` จนกว่าจะผ่าน local gates และ canary approval

## แผนปฏิบัติการฉบับปิดงาน

ส่วนนี้เป็นลำดับบังคับสำหรับ Dev/QA และมี precedence เหนือเอกสาร Vast รุ่นก่อนที่มีตัวเลขราคา, endpoint, mock หรือคำว่า production-ready ขัดกัน เอกสารเก่าใช้เป็น research/context เท่านั้น ส่วน source ปัจจุบันและ contract ที่ตรวจแล้วเป็นหลักฐานสูงสุด

### M0 — Freeze, secret containment และ contract inventory

**เจ้าของ:** PO + Security reviewer  
**ผลส่งมอบ:** baseline, `docs/vast-render/CONTRACTS.md`, `THREAT_MODEL.md`, `RUNBOOK.md`

- ตรวจ `git status`, source callers, DB/schema/migrations, route registration และ current env โดยไม่ reset งานเดิม
- หยุดการใช้ production path ของ Vast/Worker/R2 ระหว่างแก้แผน
- ลบ fallback credential/default worker token/mock production behavior ใน working tree; ถ้าพบ credential ที่ใช้งานจริงให้ rotate/revoke ก่อนทำขั้นถัดไป
- กำหนด secret source, rotation, masking, log redaction และ startup fail-closed
- ตรวจ official contract ของ Vast, ComfyUI/custom nodes, R2 และ Tora/New-API; สิ่งที่ตรวจไม่ได้ติดป้าย `NOT_CONFIGURED`

**Gate M0:** ไม่มี secret/default/mock production path; contract file มี source/date/unknowns; security reviewer ลงผล `PASS`. ถ้าไม่ผ่าน ห้ามทำ schema หรือ UI ต่อ

### M1 — Domain model, ownership และ durable state

**เจ้าของ:** Backend Dev  
**ผลส่งมอบ:** migration/schema, state transition module, focused unit tests

- reuse owner/session helpers ของ Huobao และสร้าง run/job/instance lease/artifact records เท่าที่จำเป็น
- เพิ่ม `owner_user_id`, `run_id`, `idempotency_key`, payload fingerprint, lease expiry, fencing token, provider job ID, state, error class และ timestamps
- แยก platform Vast operator account ออกจาก customer quote/Tora billing/R2 quota
- migration ต้อง backup/rehearse/rerun/restore ได้ และไม่ย้าย owner ของข้อมูลเดิมโดยเดา
- state transition ต้องเป็น allowlist และ compare-and-swap; invalid transition ตอบ conflict ไม่เขียนทับเงียบ ๆ

**Gate M1:** two-user fixture, duplicate submit, concurrent claim, restart และ invalid transition ผ่าน; row counts/IDs/media links ก่อนหลัง migration เท่าเดิม

### M2 — Vast control plane แบบ operator-only

**เจ้าของ:** Backend Dev + Security reviewer  
**ผลส่งมอบ:** adapter ใน `vast-client.ts`, guarded `vast.ts`, contract fixtures

- แยก `search/quote` กับ `create/status/destroy`; create/destroy/balance เป็น operator/admin-only
- ใช้ timeout, retry/backoff, rate-limit handling, correlation ID และ redacted diagnostics
- เก็บ raw offer/instance payload แบบไม่ติด bearer key เพื่อ reconcile; normalize unitsก่อนคำนวณ
- `$20` เป็น operator reserve policy ที่ config ได้ ไม่แสดงเป็นเครดิต user และไม่หัก Tora
- ถ้า secret หรือ contract หาย ต้องตอบ `NOT_CONFIGURED`/`503`; ห้ามคืน fake offer/balance/instance

**Gate M2:** mock/contract tests ครบ success, 401/403, 404, 429, timeout, malformed response; user A/B ยิง operator route แล้วถูกปฏิเสธ; operator destroy ทำซ้ำได้โดยไม่ทำลาย instance อื่น

### M3 — Worker, provisioning และ Comfy capability

**เจ้าของ:** Worker/AI Dev  
**ผลส่งมอบ:** pinned image/manifest, onstart, Comfy adapter, workflow schema/smoke fixture

- pin container digest, ComfyUI version, custom-node commit, model manifest, SHA-256 และ expected bytes
- worker รับเฉพาะ per-job short-lived token; ไม่รับ Vast API key/R2 long-lived secret และไม่สั่ง destroy เอง
- health probe ต้องตรวจ model loaded, VRAM, disk, queue, version และ node registry
- workflow adapter validate prompt/reference/resolution/fps/duration/frame constraints จาก registry จริง; ไม่ใช้สูตร frame ตายตัวจนกว่าจะพิสูจน์
- reference media ใช้ signed URL จาก backend และบันทึก hash; arbitrary URL/SSRF ถูกปฏิเสธ

**Gate M3:** local fake Comfy smoke ผ่าน; malformed node/frame/reference ถูก reject; model download checksum/disk failure เปลี่ยนเป็น retryable state; ไม่มี credential ใน image/notebook/log

### M4 — R2 artifact pipeline และ quota

**เจ้าของ:** Storage Dev + Security reviewer  
**ผลส่งมอบ:** owner-scoped object mapping, presigned upload/download, quota tests

- key สร้างจาก server ในรูป `users/{owner}/runs/{run}/shots/{shot}`; client ส่ง path ไม่ได้
- backend ออก presigned PUT ผูก job/content-type/expiry; worker upload แล้ว callback แบบ signed
- backend HEAD ตรวจ size/MIME/checksum/duration/playable container ก่อน `completed`
- private media ใช้ signed GET/authenticated range; public domain/cache ต้องปิดสำหรับไฟล์ private
- quota ใช้ verified bytes + reservation/cleanup policy ไม่ใช้จำนวนช็อตคูณค่าเฉลี่ย

**Gate M4:** A เปิดไฟล์ B ไม่ได้ทั้ง URL เดิม/ใหม่/Range/download; upload ซ้ำหรือ callback ซ้ำไม่สร้าง artifact ซ้ำ; quota over-limit ถูกปฏิเสธ; corrupted MP4 ไม่เป็น completed

### M5 — Run orchestration, recovery และ billing binding

**เจ้าของ:** Backend Dev + Billing reviewer  
**ผลส่งมอบ:** run API, worker claim/callback, reconcile/teardown, billing fixtures

- create run ทำ quote snapshot + idempotency ก่อน reserve; งาน bind owner/account/token/config ตั้งแต่ submit
- claim ใช้ lease/fencing; callback ตรวจ signature/state/job/instance และกัน replay
- host preemption, backend restart, provider timeout และ upload failure ต้อง reconcile จาก provider/job evidence ก่อน retry
- auto-stop ทำงานเฉพาะเมื่อไม่มี leased/running/pending-upload/unknown job; manual cancel แยกจาก destroyed
- Tora reserve/settle คิดเฉพาะ successful output seconds × model/resolution จาก New-API; failure 0, unknown `usage_pending`, download/merge retry ไม่หักซ้ำ
- operator Vast cost และ customer/Tora ledger ต้อง snapshot แยกกัน

**Gate M5:** duplicate submit/callback/poll/settle ไม่ซ้ำ; A/B อ่าน task กันไม่ได้; logout/key rotation ไม่ย้าย billing; preemption แล้วไม่ resubmit แบบเดา; orphan reconciler ตรวจพบและปิด instance ที่ไม่มี owner/job

### M6 — UI และ browser QA

**เจ้าของ:** Frontend Dev + Independent Antigravity QA  
**ผลส่งมอบ:** Vast modal/API states, operator panel, screenshots/traces

- ใช้ `VastRenderModal.vue` และ `useApi.ts` หลัง backend contract ผ่านแล้ว
- แสดง `estimate`, operator reserve, Tora credit, actual cost และ `usage_pending` แยกกัน
- ปุ่ม destroy/cancel แสดงผลกระทบและไม่รายงานสำเร็จก่อน state verify
- UI ของ user เห็นเฉพาะ project/job/file ของตน; operator view แยกเมนูและสิทธิ์
- QA ใช้ browser contexts A/B/operator และตรวจ list/detail/file/task/instance/cancel/retry/logout

**Gate M6:** browser evidence จริง, cross-owner probes ผ่าน, ไม่มี page/network errors ที่ปิดบัง auth failure, screenshot/trace และ exact test counts ถูกเก็บ; mock fixture แยกจาก live claim

### M7 — Canary และ rollout decision

**เจ้าของ:** PO + Operator ที่มีสิทธิ์บัญชี Vast/Tora  
**ผลส่งมอบ:** canary report และ rollback record

เงื่อนไขก่อน canary:

- M0–M6 ผ่านครบและ source audit ไม่มี secret/default/mock production path
- มี non-production user/project, bounded shot, approved GPU/price, model manifest และ budget ceiling
- operator ยืนยัน Vast balance/reserve และ Tora billing contract ที่ใช้จริง
- มี rollback: ปิด feature flag, ยกเลิก queued run, reconcile running leases, teardown instance, retain artifact/logs และคืน reservation ตาม policy

canary ต้องทำทีละ 1 run/1 GPU/1 short shot และตรวจ artifact/actual duration/owner/access/ledger/teardown ก่อนเปิด batch. ถ้า live contract, credential, price, node หรือ artifact verification ใดไม่ชัด ให้สถานะ `BLOCKED`/`PARTIAL` และหยุด rollout

## ข้อกำหนดเพิ่มเติมที่ผู้ใช้ยืนยัน: Admin Control Plane และ MySQL

ส่วนนี้เป็นข้อกำหนดบังคับของงานเดียวกัน และมี precedence เหนือข้อความเดิมที่ยังเปิดให้ผู้ใช้ทั่วไปแก้ global settings ได้ หรือยังวาง SQLite เป็น runtime หลัก

### A. แยกหลังบ้านสำหรับ admin เท่านั้น

หลักฐานจาก source ปัจจุบันที่ต้องแก้ก่อนเปิดใช้งาน:

- `backend/src/db/schema.ts` มี `users` แต่ยังไม่มี role ของผู้ใช้; `AuthenticatedActor` ใน `backend/src/middleware/auth.ts` ก็ยังไม่มี role
- `backend/src/routes/settings.ts` เปิดอ่าน/เขียน `app_settings` และ Vast pricing โดยไม่เห็น admin guard ใน route
- `backend/src/routes/prompts.ts` เปิดเขียน prompt global และ `backend/src/routes/skills.ts` ปิดการแก้ไขทั้ง server mode แทนการอนุญาตเฉพาะ admin
- `backend/src/services/app-settings.ts` ใช้ key-value global และ synchronous `better-sqlite3`; เปลี่ยน driver เฉย ๆ จะทำให้ callers ที่สร้าง agent context พัง

สิ่งที่ Dev ต้องทำ:

1. เพิ่ม `users.role` ด้วยค่าเริ่มต้นปลอดภัย (`user`) และทำ `requireAdmin` จาก actor ที่อ่าน role จากฐานข้อมูลทุกครั้ง ห้ามรับ role จาก client หรือ token payload ที่ไม่ได้ตรวจสอบ แยก `admin` สำหรับ global configuration ออกจาก user ที่แก้ได้เฉพาะข้อมูลของตนเอง
2. แยก route เป็น user-safe settings กับ `/admin/*` สำหรับ agent registry/prompt/skill, cloud connection, Vast operator settings และ markup/rate card ทุก `GET` ที่คืนค่า global config ต้องผ่าน policy เดียวกัน ไม่ใช่กันเฉพาะ `PUT`
3. เก็บ audit สำหรับ admin mutation (`actor`, action, resource, version, before/after ที่ redact แล้ว, timestamp, request ID) และทำ version/draft/publish/rollback ให้ config ที่มีผลกับงานใหม่เท่านั้น
4. Agent settings ที่ admin จัดการได้คือ model/provider binding, prompt, skill และ capability registry ระดับแพลตฟอร์ม; `ai_service_configs` หรือ BYOK ของผู้ใช้ยังต้อง owner-scoped และห้าม admin endpoint ทำให้ user ของอีกคนถูกเปิดเผยโดยไม่จำเป็น
5. Cloud settings ที่ admin จัดการได้คือ provider, endpoint, bucket, region, retention/quota และ credential reference ของ Vast/R2/Tora/Comfy ตามที่ระบบเปิดใช้จริง เก็บ secret แบบเข้ารหัส/หมุนได้/คืนค่าเป็น masked เท่านั้น ปุ่ม test connection ต้องใช้ allowlist endpoint และ timeout ป้องกัน SSRF; production ต้อง fail-closed เมื่อยังไม่ตั้งค่า
6. Markup/rate card ต้องเก็บเป็น decimal และ versioned อย่างน้อย `markup_percent`, `usd_to_thb_rate`, `min_shot_price_thb`, `r2_overage_price_per_gb`, `effective_at`; ตอนสร้าง quote/run ให้ snapshot ราคาและ version ลงงานนั้น เพื่อให้การเปลี่ยน markup ภายหลังไม่เปลี่ยนยอดงานเดิม

**Gate A:** user ยิง admin route ได้ `403`; admin เห็น/แก้ global config ได้โดยไม่เห็น secret ดิบ; audit และ rollback ตรวจได้; prompt/skill publish ไม่กระทบงานที่กำลังรัน; quote สองงานต่าง version แสดงราคาที่ snapshot ไว้ถูกต้อง

### B. ย้ายฐานข้อมูล runtime ไป MySQL

เป้าหมายคือ MySQL เป็น source of truth สำหรับ server/production และไม่ให้ SQLite ทำหน้าที่เป็น runtime สำรองแบบเงียบ ๆ โดย `backend/src/db/index.ts` ปัจจุบันยังสร้าง `better-sqlite3`, ตั้ง WAL และเรียก `maybeAutoImportMysql` ซึ่งเป็น one-way import เข้า SQLite ไม่ใช่ MySQL runtime

ลำดับบังคับ:

1. สร้าง MySQL schema/migrations สำหรับทุกตารางและ index เดิมด้วย InnoDB, `utf8mb4`, UTC timestamps, foreign keys และ `DECIMAL` สำหรับเงิน/เครดิต/markup/quota; เพิ่ม `users.role`, admin audit, config versions และ owner keys ตาม A
2. ใช้ Drizzle MySQL/`mysql2` แบบ async ทั้งระบบ เปลี่ยน repository/service ที่เรียก `.get()/.run()` synchronous โดยเฉพาะ `app-settings.ts`, `agents/context.ts`, `extraction.ts`, `video-prompts.ts`, `final-prompt.ts` และ Vast client ให้รอ DB readiness อย่างถูกต้อง ห้ามคง helper sync แล้วแอบอ่าน SQLite
3. ตรวจและแก้ dialect assumptions ทั้งหมด: ไม่มี `WAL`, `busy_timeout`, `lastInsertRowid` หรือ `returning()` ที่ driver/version ไม่รองรับ; insert ID, upsert, JSON, boolean, timestamp และ transaction ต้องมี implementation/test บน MySQL จริง
4. ทำ migration rehearsal จาก SQLite snapshot ไปฐาน MySQL ว่าง โดยเก็บ IDs, owner IDs, timestamps, config versions และ media URLs เดิม ตรวจ row count/checksum/foreign key/orphan และทดสอบ backup/restore กับ rerun; ห้ามเดา owner ของข้อมูลที่ไม่ผูกบัญชี
5. เปลี่ยน startup ให้ server mode ต้องมี `DATABASE_URL`/MySQL config ที่ตรวจสอบได้และ fail-closed เมื่อเชื่อมต่อไม่ได้ ลบ one-way auto-import จาก production path หลัง cutover; SQLite เหลือได้เฉพาะ fixture/desktop transitional mode ที่ประกาศชัดและห้ามใช้เป็น shared production database
6. ใช้ transaction/row lock ของ MySQL กับ reservation, worker lease/fencing, idempotency และ billing settlement เพื่อกัน double charge/double claim ภายใต้ concurrent requests; เพิ่ม index สำหรับ owner, state, lease expiry, idempotency และ audit lookup

**Gate B:** migration rehearsal และ restore ผ่าน, row/ID/owner/media checksums ตรง, server boot ด้วย MySQL เท่านั้น, concurrent reservation/lease/settlement tests ผ่าน, process ที่ไม่มี MySQL หรือ schema migration ค้างอยู่หยุดด้วย error ชัดเจน และไม่มี SQLite write ใน production logs

### ลำดับ milestone ที่ต้องแทรก

- **M0.1 — Admin/auth contract:** ปิด route matrix, role bootstrap, `requireAdmin`, secret/audit policy และ contract tests ก่อนแก้ UI
- **M0.2 — MySQL contract:** ปิด schema/dialect/backup/rollback plan และสร้าง isolated MySQL rehearsal ก่อนย้ายข้อมูลจริง
- **M1 — Domain migration:** ทำ M0.1–M0.2 ให้ผ่าน แล้วจึงเพิ่ม owner/config-version/audit records และ MySQL repositories
- M2–M7 เดินต่อได้เมื่อ Gate A และ Gate B ผ่านเท่านั้น; ทุก gate เดิมต้องเพิ่มผลตรวจ admin isolation และ MySQL execution evidence

### ตาราง acceptance สุดท้าย

| Gate | หลักฐานที่ต้องมี | สถานะที่ยอมรับ |
|---|---|---|
| Security | secret scan, route matrix, SSRF/path/log audit, operator/user isolation | PASS เท่านั้น |
| Data | migration rehearsal, backup/restore, owner mapping, no orphan exposure | PASS เท่านั้น |
| Control plane | Vast contract fixtures, rate/timeout/error, idempotent teardown | PASS หรือ NOT_CONFIGURED ก่อน canary |
| Worker/Comfy | pinned manifest, node registry, smoke output, checksum | PASS เท่านั้นก่อน canary |
| Storage | signed upload/get, HEAD verification, Range, quota and retention | PASS เท่านั้นก่อน canary |
| Billing | quote/reserve/settle separation, success seconds, no double charge | PASS เท่านั้นก่อน canary |
| Admin control plane | role enforcement, admin-only agent/cloud/markup settings, masked secrets, audit/rollback | PASS เท่านั้นก่อน canary |
| MySQL runtime | rehearsal/restore, dialect checks, async repositories, concurrent lock tests, no production SQLite write | PASS เท่านั้นก่อน canary |
| Browser | A/B/operator contexts, real screenshots/traces, exact counts | PASS เท่านั้นก่อน canary |
| Live canary | one approved run, artifact, ledger, teardown and rollback evidence | PASS จึงเปิด batch |

### สิ่งที่ยังไม่รวมในรอบนี้

ทีมแชร์โปรเจกต์, public sharing, OAuth SSO, marketplace, Colab/Drive/H3 worker และ multi-GPU parallelism เป็นงานแยก ไม่ให้ Dev ขยาย scope เข้าไปใน M0–M7; Admin control plane, MySQL cutover และ markup ที่ระบุในส่วน A/B อยู่ใน scope บังคับ

### คำสั่งเริ่มงานสำหรับ Dev

เริ่มที่ M0 เท่านั้น สร้าง contract/security/runbook documents, role/route matrix, MySQL DDL/rollback plan และรายงาน baseline ก่อนแก้ product code. ห้ามเริ่มจาก UI, worker หรือ live Vast call. เมื่อ M0.1 และ M0.2 ผ่านค่อยส่ง M1 ให้ QA ตรวจ แล้วเดินตามลำดับ M0 → M7 โดยบันทึก `PROGRESS.md`, exact commands, changed files, migration checksums, artifacts และ `PASS/FAIL/PARTIAL/BLOCKED/NOT RUN` ทุก milestone

