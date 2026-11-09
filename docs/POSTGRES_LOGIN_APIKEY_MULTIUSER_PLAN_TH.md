# แผนย้าย Huobao ไป PostgreSQL + Login + API Key ต่อผู้ใช้ + แยกงานสร้างวิดีโอ

วันที่จัดทำ: 2 พฤศจิกายน 2026  
สถานะ: แผน implementation ก่อนเริ่มแก้ runtime  
ขอบเขต: backend Hono/TypeScript, frontend Nuxt/Vue, generation/worker และข้อมูล SQLite ปัจจุบัน

## เป้าหมายที่ต้องยอมรับร่วมกัน

เมื่อเปิด server mode ระบบต้องให้ผู้ใช้ login ก่อนใช้งาน API และหน้าแอป ผู้ใช้แต่ละคนต้องมีรายการ API key ของตนเองให้เลือกใน listbox มีค่า default ที่ระบบอนุญาต และสามารถสร้าง/ดู/แก้ไข/ลบงานสร้างวิดีโอของตัวเองเท่านั้น ผู้ใช้ต้องอ่านหรือแก้ไขงานของคนอื่นไม่ได้ แม้รู้ project ID, episode ID, storyboard ID, task ID หรือ URL ของไฟล์

PostgreSQL จะเป็นฐานข้อมูล runtime และ source of truth ของ server/production ส่วน SQLite เดิมเป็นต้นทางสำหรับ migration และเก็บเป็น rollback snapshot จนกว่าจะผ่าน canary. ฐาน `huobao_drama` ใน MAMP ที่สร้างก่อนหน้านี้เป็น staging/ตรวจข้อมูล ไม่ใช่เป้าหมายสุดท้ายของระบบนี้

API key ในแผนนี้หมายถึง provider/API configuration ที่ใช้สร้างภาพ/วิดีโอ (`ai_service_configs`) ซึ่งต้องแสดงเป็นรายการที่ mask แล้ว. Tora/New-API key ที่ใช้ login เป็น credential ของ session และไม่ควรแสดงเป็น provider key listbox ปะปนกัน

## หลักฐานจาก source ปัจจุบันและช่องว่างที่ต้องแก้

| พื้นที่ | สถานะที่ตรวจพบ | ผลกระทบ |
|---|---|---|
| DB runtime | `backend/src/db/index.ts` ใช้ `better-sqlite3`, WAL, `lastInsertRowid` และ `sqlite-core` | เปลี่ยน connection อย่างเดียวไม่ได้ ต้องเปลี่ยน dialect/schema และ insert ID |
| DB schema | `backend/src/db/schema.ts` ใช้ `sqliteTable`, integer boolean และ text timestamp | ต้องสร้าง `pgTable`/ชนิด PostgreSQL ให้ตรงทุกตารางและ migration จริง |
| Login | `auth.ts`, `authMiddleware`, `authSessions` มีโครง login/session แล้ว | ต้องบังคับ login ใน server mode ทุก API และตรวจ session/credential expiry อย่างสม่ำเสมอ |
| API config | `routes/aiConfigs.ts` มี owner filtering และ mask response บางส่วน | ต้องกำหนด listbox contract, default precedence, encryption และห้ามรับ raw key ใน generation request |
| Generation | `routes/tasks.ts`, `services/generation.ts`, `routes/worker.ts` มี `ownerUserId` บางจุด | ต้องตรวจทุก create/list/detail/update/delete/poll/callback/merge ให้ owner มาจาก actor หรือ signed job token เท่านั้น |
| Frontend | `useAuth.ts`, `LoginDialog.vue`, `useApi.ts` มี login และ `config_id` บาง flow แล้ว | ต้องเพิ่ม route guard, loading/401 state และใช้ listbox เดียวกันทุก flow ที่สร้างวิดีโอ |
| Settings | `app-settings.ts` ยังเป็น synchronous SQLite API; Vast client อ่าน global settings | ต้อง refactor เป็น async PostgreSQL repository และแยก admin/global กับ user settings |
| Local SQLite helpers | `flow-engine.ts`, `flow-reference-upload.ts`, backup/storage utilities ยังเปิด SQLite ตรง | ต้องกำหนดว่าเป็น local cache เท่านั้น หรือย้ายข้อมูลที่ server ต้องแชร์เข้า PostgreSQL/object storage |

## กติกาความปลอดภัยและ ownership

1. actor ต้องมาจาก server-side session ที่ตรวจจาก `auth_sessions` และ `users`; ห้ามใช้ `user_id`, `owner_user_id`, role หรือ API key owner จาก body/query/header เป็นตัวตน
2. ทุก SQL ที่อ่านหรือแก้ข้อมูล private ต้องมี owner predicate ใน query หรือ resolve ผ่าน parent ที่มี owner predicate ก่อนเสมอ
3. ค่า `owner_user_id IS NULL` ของข้อมูลเก่าคือ `unassigned/quarantine`; ไม่เป็น public และไม่ตกเป็นของผู้ใช้คนแรกที่ login
4. การตอบกรณีผู้ใช้ไม่มีสิทธิ์ให้ใช้ 404 สำหรับ resource lookup เพื่อลดการเดา ID; ใช้ 403 เฉพาะ endpoint ที่รู้ว่าเป็น role/operation denial
5. provider key เก็บเข้ารหัส at rest, decrypt เฉพาะ backend ตอนเรียก provider, response เป็น `masked_key`/metadata เท่านั้น และห้าม log raw key
6. worker token เป็น short-lived, job-bound, audience-bound และ replay-protected; worker ห้ามรับ session cookie หรือ long-lived provider key
7. เครดิต Tora/New-API และ provider key เป็นคนละขอบเขต: login ใช้ยืนยันบัญชี/owner, managed video billing ใช้ New-API, direct BYOK ใช้ config ของ owner และไม่ย้ายข้ามบัญชี

## Target data model ใน PostgreSQL

### ตารางหลักที่ migrate

ย้ายตารางเดิมทั้งหมดที่มีข้อมูลหรือถูกเรียกโดย runtime: `users`, `auth_sessions`, `dramas`, `episodes`, `characters`, `scenes`, `props`, `storyboards`, ตาราง link, `sys_task`, `video_merges`, `assets`, `ai_service_configs`, `ai_service_providers`, `app_settings`, `style_presets` และ indexes ที่ใช้จริง

ชนิดข้อมูลเป้าหมาย:

- primary key ใช้ `BIGSERIAL`/`BIGINT GENERATED ... AS IDENTITY` ตามมาตรฐาน migration เดียวกันทุกตาราง
- owner/foreign key ใช้ `BIGINT` ชนิดเดียวกันและมี foreign key เฉพาะความสัมพันธ์ที่ source พิสูจน์ได้
- API key, prompt, metadata และ URL ใช้ `TEXT`; ค่าตัวเลขเงิน/markup/เครดิตใช้ `NUMERIC`, ไม่ใช้ floating point
- `is_active`, `is_default`, `is_favorite` ใช้ `BOOLEAN`
- timestamps ใช้ `TIMESTAMPTZ` เก็บ UTC; JSON payload ใช้ `JSONB` เมื่อ query/validation ต้องการ ส่วนข้อมูล prompt ที่ต้องรักษารูปแบบใช้ `TEXT`
- `deleted_at`, `revoked_at`, `completed_at` เป็น nullable `TIMESTAMPTZ`

### การเปลี่ยนแปลง schema ที่จำเป็น

1. `users.role` เพิ่มค่าเริ่มต้น `user`; ค่า `admin` ต้อง bootstrap ผ่าน env/one-time CLI หรือ database migration ที่ตรวจสอบได้ ห้ามให้ client เลือก role
2. `users` unique `(issuer, external_user_id)` และ index `(status, role)`
3. `auth_sessions` เก็บ `session_token_hash`, `user_id`, `encrypted_credential`, `created_at`, `expires_at`, `revoked_at`, `last_seen_at`, `token_id`; เพิ่ม index `(user_id, revoked_at, expires_at)`
4. `ai_service_configs` มี `owner_user_id NULL` ได้เฉพาะ platform default ที่ admin publish; เพิ่ม `key_version`, `secret_ref/encrypted_api_key`, `is_default`, `is_active`, `updated_at`; unique/partial index ป้องกัน default ซ้ำต่อ owner+service type
5. `sys_task` เพิ่ม/ตรวจ `owner_user_id NOT NULL` สำหรับงานใหม่, `config_id`, `idempotency_key`, `payload_fingerprint`, `provider_job_id`, `lease_expires_at`, `fencing_token`, `completed_at`; งาน legacy ที่ไม่มี owner เข้า quarantine
6. `video_merges` ต้อง resolve owner ผ่าน episode/drama หรือเพิ่ม `owner_user_id` สำหรับงานที่ไม่มี parent; ห้าม list แบบ global
7. `assets` และ upload record ต้องมี owner; object key สร้างจาก owner/job ฝั่ง server
8. เพิ่ม `admin_audit_log` สำหรับ role, provider config, cloud setting, markup และ migration operation โดย redact secret
9. เพิ่ม `config_versions` หรือ version fields ให้ราคา/provider config ที่มีผลกับงานใหม่; job เก็บ config snapshot/id/version

## Login contract และการบังคับใช้งาน

### Backend API

คง endpoint หลักที่มีอยู่และทำสัญญาให้ชัด:

- `POST /api/v1/auth/login`: รับ Tora/New-API key ผ่าน HTTPS, เรียก identity verification ที่กำหนด, upsert `(issuer, external_user_id)`, rotate session และ set HttpOnly cookie
- `GET /api/v1/auth/me`: คืน user, role, session expiry, masked managed identity และสถานะเครดิตที่อ่านได้; ไม่คืน raw credential
- `POST /api/v1/auth/logout`: revoke session และล้าง cookie
- `POST /api/v1/auth/refresh` ถ้าต้องต่อ session: rotate token และตรวจ identity/expiry ใหม่

`authMiddleware` ต้องทำงานก่อน route ทุกตัว โดยยกเว้นเฉพาะ health, login, static และ worker endpoints ที่มี signature/token policy แยกต่างหาก. ใน `HUOBAO_SERVER_MODE=true` หรือ production หากไม่มี actor ให้ตอบ 401; ห้ามให้ frontend route ที่เรียก API เดินต่อแบบ anonymous แล้วสร้าง owner เป็น null

Session policy:

- cookie `HttpOnly`, `Secure` เมื่อ HTTPS, `SameSite=Lax`, `Path=/`
- CSRF/Origin check สำหรับ mutation ที่ใช้ cookie
- login rate limit และ audit เฉพาะ metadata
- session credential เข้ารหัสด้วย deployment secret; rotate/revoke เมื่อ key invalid, account disabled หรือ logout
- ถ้า identity service ตรวจไม่ได้ ให้ protected request เป็น 503/identity unavailable ไม่ข้าม auth

### Frontend login gate

- `app.vue`/middleware ตรวจ `useAuth().checkAuth()` ก่อนโหลด project data
- เมื่อ 401 ให้หยุด request ซ้ำ, เปิด LoginDialog และรักษา route ที่ผู้ใช้กำลังอยู่ไว้หลัง login
- แยกสถานะ `signed out`, `identity unavailable`, `credits unavailable`, `credits exhausted` ให้ UI ไม่ตีความเป็นสถานะเดียว
- ไม่เก็บ Tora key หรือ provider key ใน localStorage, URL หรือ query string
- logout ต้องล้าง owner-scoped caches, selected project, API key options และ pending mutation state

**Gate L:** session ปลอม/หมดอายุ/revoked ใช้ไม่ได้, logout ใช้ต่อไม่ได้, anonymous server request ถูกปฏิเสธ และ login บัญชีเดิมด้วย key ใหม่ยัง resolve เป็น user เดิม

## API key listbox และ default policy

### Backend contract

ปรับ `GET /api/v1/ai-configs?service_type=video` ให้คืนเฉพาะรายการที่ actor ใช้ได้:

```json
{
  "items": [
    {
      "id": 12,
      "name": "My Tora Video",
      "provider": "tora",
      "model": "minimax",
      "service_type": "video",
      "masked_key": "sk-****9a2f",
      "is_default": true,
      "scope": "user"
    }
  ],
  "default_id": 12
}
```

รายการที่อนุญาตประกอบด้วย:

1. config ของ owner ที่ `is_active=true`
2. platform default ที่ admin publish และตั้ง `scope=platform`, ถ้านโยบายอนุญาตให้ user ใช้
3. ไม่รวม config ของ user อื่น, disabled config, raw `api_key` และ global secret ที่ยังไม่ publish

Default precedence:

1. `config_id` ของ request ถ้ารายการนั้นเป็นของ owner หรือ platform default ที่อนุญาต
2. user default ของ service type
3. platform default ของ service type
4. ถ้าไม่มี ให้ตอบ 409 `NO_API_KEY_CONFIGURED` และไม่สร้าง task

การเปลี่ยน default ต้องเป็น transaction เดียว: clear default ของ owner+service type แล้ว set รายการใหม่ พร้อม unique partial index/constraint. ห้ามใช้ “รายการแรกใน array” เป็น default โดยไม่บันทึกใน DB

### Generation contract

- client ส่ง `config_id` ได้เฉพาะ ID จาก listbox; client ห้ามส่ง raw `api_key`, `base_url` หรือ provider credential เพื่อ override
- backend โหลด config หลังตรวจ owner และ snapshot `config_id`, `config_version`, provider, model, resolution และ pricing/billing context ลง `sys_task`
- retry/poll/callback ใช้ config snapshot ของ task ไม่อ่าน default ใหม่กลางงาน
- หาก config ถูกปิดหลัง submit งานเดิมยังใช้ snapshot ตาม policy หรือเปลี่ยนเป็น `needs_reconcile`; งานใหม่ห้ามใช้ config disabled
- API key test endpoint รับ key ชั่วคราวได้เฉพาะ admin/user owner ตาม policy, ไม่ persist หากไม่กด save และ redact logs

### Frontend listbox

สร้าง composable เดียว เช่น `useVideoApiKeyOptions()` ใช้กับ:

- episode video generation
- storyboard/shot generation
- batch render/Vast/worker submit ที่เลือก provider video
- task retry ที่อนุญาตให้ใช้ snapshot เดิมหรือเลือก config ใหม่ตาม policy

UI ต้องแสดงชื่อ provider/model และ masked key, badge `Default`, disabled state และข้อความเมื่อไม่มี key. ไม่แสดง API key เต็ม. เมื่อ login/logout เปลี่ยนให้ refetch options และ reset selection ที่ไม่ใช่ owner

**Gate K:** user A list ไม่เห็น config ของ B, เลือก config ของ B แล้วได้ 404/403, ไม่มี config แล้วไม่สร้าง task, default ซ้ำไม่ได้, retry ไม่เปลี่ยน credential โดยไม่ตั้งใจ และ raw key ไม่ปรากฏใน network response/frontend state

## การแยกโปรเจกต์และวิดีโอตามผู้ใช้

### Project/parent ownership

- `POST /dramas` ต้องมี actor และเขียน `owner_user_id=actor.userId` จาก server
- `GET /dramas`, stats และ search filter owner ใน SQL ก่อน pagination/count
- `GET/PUT/DELETE /dramas/:id` ตรวจ owner; ห้ามรับ owner จาก body
- episode, storyboard, character, scene, prop, link table และ merge resolve ผ่าน drama/episode owner; validate parent-child IDs อยู่ใน project เดียวกัน
- project ID ที่ไม่ใช่ของ actor ตอบ 404 และไม่คืน title/status/count

### Task ownership

- `POST /tasks` ต้องตรวจ login, parent owner, config owner และ set `owner_user_id` จาก actor
- `GET /tasks`, `/tasks/:id`, delete, retry และ `generation-tasks` filter owner ใน query หรือ parent guard
- `sys_task.owner_user_id` ต้องไม่เปลี่ยนเมื่อ retry; `created_by/session_id` เก็บเพื่อ audit ได้
- worker poll/claim ต้องใช้ job token + owner/job binding; ไม่ให้ worker เห็นรายการ global
- callback ตรวจ signature, job ID, owner binding, state transition และ idempotency; callback จาก task อื่นตอบ 404/409
- merge/download/storage ตรวจ owner ก่อนเปิด path, signed URL หรือ range response
- orphan/unassigned tasks ไม่เปิดให้ user; admin/reconciler เท่านั้น

### API routes ที่ต้อง audit แบบ matrix

`dramas`, `episodes`, `characters`, `scenes`, `props`, `storyboards`, `tasks`, `merge`, `upload`, `storage`, `flowBridge`, `worker`, `aiConfigs`, `settings`, `vast`, `prompts`, `skills` และ route ใหม่ทั้งหมดต้องมีรายการ method, actor requirement, owner source, config source, response on denial และ test case ใน `docs/POSTGRES_ROUTE_MATRIX.md`

## PostgreSQL adapter และ runtime cutover

### Implementation

1. เพิ่ม runtime dependency `pg` หรือ `postgres` และ Drizzle PostgreSQL adapterที่เลือกไว้เพียงตัวเดียว; production/server ห้าม fallback ไป SQLite
2. สร้าง `backend/src/db/pg-schema.ts` ด้วย `pgTable` ให้คอลัมน์และชื่อ field ที่ route ใช้ตรงกัน; ใช้ schema เดียวที่ export ให้ repositories
3. ปรับ `backend/src/db/index.ts` ให้เลือก PostgreSQL จาก `DATABASE_URL`/PG variables ใน server mode และ fail startup ถ้าไม่มี connection/config/migration
4. เปลี่ยน `getInsertId` จาก `lastInsertRowid` เป็น `.returning({ id })` หรือ `result.rows[0].id`; ตรวจทุก caller รวม worker `returning`
5. ลบ/แยก `maybeAutoImportMysql` และ SQLite startup DDL ออกจาก production path; migration CLI เป็น explicit command เท่านั้น
6. เปลี่ยน `app-settings.ts` เป็น async repository หรือ cache ที่มี async refresh; แก้ callers ใน `agents/context.ts`, `extraction.ts`, `video-prompts.ts`, `final-prompt.ts`, `ai.ts`, `routes/settings.ts`, `vast-client.ts`
7. ตรวจทุก `onConflictDoUpdate`, boolean, JSON, timestamp, `ILIKE`, pagination, transaction และ row lock ให้ใช้ PostgreSQL semantics
8. local-only SQLite helpers ต้องติดป้าย/guard ชัดเจน; ข้อมูลที่ต้องใช้ร่วมกันใน server เช่น flow references, uploads และ generated artifacts ต้องอยู่ PostgreSQL metadata + object storage ตาม owner

### Migration จาก SQLite

**P0 — Freeze และ backup**

- หยุด writes หรือเปิด maintenance mode
- checkpoint WAL แล้วทำ consistent backup ด้วยวิธีที่ตรวจได้; เก็บ checksum, file size, schema version และ row counts
- source of truth คือ SQLite snapshot; MySQL staging ใช้ตรวจเทียบได้แต่ไม่ใช้เป็นแหล่งเดา owner

**P1 — PostgreSQL schema/migration**

- สร้าง DB แยกและ migration versioned; ใช้ InnoDB-specific DDL จาก MySQL เดิมเป็น reference เท่านั้น
- สร้าง tables, indexes, foreign keys, constraints, role/default/config versions และ audit tables
- migration ต้อง rerun ได้และห้าม `DROP` ตารางที่มีข้อมูลโดยไม่มี explicit migration

**P2 — Import**

- import users/sessions ก่อน resources; preserve primary IDs, timestamps, owner IDs, provider config IDs และ media URLs
- copy legacy owner-null records เข้า quarantine/unassigned report; ห้าม assign ให้ user แรก
- encrypt provider API keys ระหว่าง import หาก source เป็น plaintext; ถ้า encryption key ไม่พร้อมให้หยุดก่อน import secret
- set PostgreSQL sequences หลัง import

**P3 — Verify**

- row count ทุกตาราง, primary key set/checksum, owner mapping, parent-child/FK, active sessions, config default uniqueness และ media object existence
- ตรวจ sample user A/B และ task/asset/file path ที่เป็นของแต่ละคน
- restore PostgreSQL backup ลง DB ใหม่แล้วรัน smoke suite ซ้ำ

**P4 — Cutover/canary**

- ตั้ง `DATABASE_URL` PostgreSQL และ `HUOBAO_DB_DIALECT=postgres` ใน server mode
- เปิด read-only smoke ก่อน, แล้วค่อยเปิด writes ให้ user ทดสอบ 1–2 บัญชี
- rollback ด้วย feature flag/maintenance + PostgreSQL backup; ห้ามสลับกลับไปเขียน SQLite แบบ dual-write โดยไม่ได้ออกแบบ
- หลัง canary ผ่านจึงปิด SQLite/MySQL staging writes และเก็บ snapshot ตาม retention

**Gate P:** PostgreSQL boot ได้โดยไม่มี SQLite import, migration rerun/restore ผ่าน, row/ID/owner/media checks ผ่าน, concurrent create/claim/settle ผ่าน และไม่มี SQLite write ใน server logs

## แผน milestone สำหรับ Dev/QA

### M0 — Freeze, inventory, contracts

ผลส่งมอบ: route matrix, DB dialect decision, migration manifest, secret policy, backup/rollback runbook, baseline counts

Gate: working tree ถูกบันทึก, source SQLite snapshot checksum มี, PostgreSQL target ว่าง, no production cutover

### M1 — PostgreSQL schema/adapter

ผลส่งมอบ: `pg-schema.ts`, PostgreSQL migrations, connection pool/readiness, dialect tests, async app settings, `getInsertId` replacement

Gate: typecheck/build ผ่าน, CRUD ของ users/dramas/tasks/configs ผ่านบน PostgreSQL, no SQLite fallback in server mode

### M2 — Login/session enforcement

ผลส่งมอบ: login/me/logout/refresh policy, middleware, frontend route guard, CSRF/rate limit, 401/503 states

Gate: anonymous denied, session expiry/revoke works, login key never stored client-side, local mode policy explicit

### M3 — API key catalog/default

ผลส่งมอบ: owner-scoped listbox API, default transaction/constraint, encrypted key repository, admin platform defaults, frontend composable/component

Gate: user A/B isolation, masked response, no raw override, no config means no task, default uniqueness

### M4 — Owner isolation for project/task/video

ผลส่งมอบ: SQL owner filters, parent guards, task snapshot, worker claim/callback binding, merge/download/storage guards, quarantine tool

Gate: two-user browser/API matrix; A cannot list/read/update/delete/retry/download B; IDs and URL guessing reveal no metadata

### M5 — SQLite to PostgreSQL data migration

ผลส่งมอบ: import CLI, owner mapping report, secret encryption report, sequence/FK/checksum verification, restore rehearsal

Gate: counts/IDs/media links match, owner-null quarantine explicit, rerun idempotent, backup restore passes

### M6 — Frontend integration and local QA

ผลส่งมอบ: login-first flow, API key listbox/default badge, owner-scoped project/task screens, 401 recovery, screenshots/traces

Gate: browser contexts A/B, login/logout, create video with selected key, task list/detail/retry/download, no cross-user data

### M7 — Canary and production cutover

ผลส่งมอบ: PostgreSQL canary report, rollback record, monitoring/alerts, operator sign-off

Gate: one bounded video per test user, artifact and billing/provider result verified, no SQLite/MySQL runtime writes, rollback tested

## Acceptance matrix

| Area | PASS evidence |
|---|---|
| PostgreSQL | server boots on PostgreSQL only; schema/migrations and restore pass |
| Login | anonymous protected API is 401; revoked/expired session denied; key not leaked |
| API key | list is owner-scoped/masked; default transaction works; raw key never in UI/network response |
| Projects | list/detail/edit/delete owner-scoped; legacy unassigned quarantined |
| Video tasks | create/poll/retry/callback/merge/download owner-scoped and idempotent |
| Worker | job token bound to task/owner; replay/cross-task callback rejected |
| Billing | task config/price snapshot stable; Tora/New-API owner binding preserved |
| Frontend | A/B browser contexts cannot see/edit each other; login redirect/recovery works |
| Operations | metrics for DB, auth failures, task owner violations, migration and rollback available |

## สิ่งที่ไม่ทำในรอบนี้

ไม่ทำ OAuth provider ใหม่, password login, public project sharing, cross-user collaboration, เปลี่ยน provider API contract, เปลี่ยนราคา live, หรือเอา MySQL staging มาเป็น production source of truth. ถ้าต้องการ admin console สำหรับแก้ global agent/cloud/markup ให้เดินตามข้อกำหนด Admin Control Plane ในแผน Vast เดิมและใช้ PostgreSQL repository ชุดเดียวกัน

## คำสั่งเริ่มงานสำหรับ Dev

เริ่ม M0 เท่านั้น: ตรวจ source callers, สร้าง PostgreSQL route/DB contract และ backup manifest, ห้ามเริ่มจาก UI หรือปิด SQLite ทันที. หลัง M0 ผ่านค่อยทำ M1 แล้วส่ง QA ตรวจแต่ละ gate โดยบันทึก exact command, migration version, row counts, changed files, screenshots/traces และสถานะ `PASS/FAIL/PARTIAL/BLOCKED/NOT RUN` ใน `docs/PROGRESS.md`
