# แผนล็อกอินและแยกโปรเจกต์ตามผู้ใช้ Huobao–Tora

วันที่ตรวจ: 10 ตุลาคม 2026 (Asia/Bangkok)
สถานะ: แผนที่เสนอ ยังไม่ได้ implement auth, migration หรือ multi-user QA. รอบนี้แก้เฉพาะเอกสาร ไม่เปลี่ยนระบบที่ localhost:3013.

## ผลที่ต้องได้

ผู้ใช้เชื่อมบัญชี Tora → เห็นโปรเจกต์ของตัวเอง → สร้าง/แก้/เปิด Story Mode/ดาวน์โหลดได้เฉพาะข้อมูลของตน. API key หลายอันของบัญชี Tora เดียวกันต้องเปิดโปรเจกต์ชุดเดิมได้; บัญชีอื่นต้องไม่ได้ แม้รู้ ID หรือ URL. เครดิตวิดีโอใช้ New-API เป็นเจ้าของบัญชีและการคิดเงินจริงตาม [แผนหลัก](HUOBAO_NEW_API_INTEGRATION_PLAN_TH.md).

แยกสิทธิ์เข้าแอปออกจากสิทธิ์ใช้เครดิต: เครดิต Tora เป็นศูนย์ยังเปิดโปรเจกต์เดิมและใช้ direct provider ของตนได้ แต่สร้างผ่าน Tora ไม่ได้. การล็อกอินในโหมด server ใช้ป้องกันข้อมูลทุก provider; ไม่ใช่การเพิ่ม Tora credit gate ให้ direct keys/Flow. โหมด local/desktop เดิมยังทำงานแบบพื้นที่ส่วนตัวโดยไม่บังคับ Tora login.

## ผลอ่านต้นทางและค้น fork

ตรวจ source จริงจาก clone โดยไม่ติดตั้งหรือรันโค้ดภายนอก. SHA และขอบเขตการค้นอยู่ใน [research manifest](auth-research/RESEARCH_2026-10-10.json).

| แหล่ง | สิ่งที่ยืนยันจากโค้ด | ใช้กับเราหรือไม่ |
|---|---|---|
| chatfire-AI/huobao-drama, SHA `26de7df59806588e98e103a21bd0bfd26d4a55a6` | index ไม่มี app authentication; dramas ไม่มีเจ้าของ; list/detail/create/update/delete ไม่กรองบัญชี | ไม่มี auth/multi-user สำเร็จรูปให้เปิดใช้ใน snapshot นี้ |
| A1pha3/huobao-drama, SHA `cfa41e39dbf39c5da5dfc1ff396c7e9540044395` | เป็นฐาน Go/Vue รุ่นเก่า; ตรวจ router/middleware/models แล้วไม่พบ app login/owner guard. ลิงก์ login ใน AIConfigDialog เป็นบริการ API ภายนอก | ไม่เหมาะย้ายฐานกลับไป Go เพื่อเพิ่มล็อกอิน |
| goosmanlei/huobao-drama และ mahmudul0x1/huobao-drama | snapshot clone ได้ SHA เดียวกับต้นทาง; index/schema/dramas เท่ากัน | ไม่เพิ่ม auth ในไฟล์หลักที่ตรวจ |
| Aibrother258/JisuVideo-ai | ปรากฏในรายการ fork แต่ clone ตอบ Repository not found | ตรวจ implementation ไม่ได้; ไม่นับเป็นตัวเลือกที่พร้อมใช้ |
| dav-niu474/huobao-drama-ai, SHA `eece93fa0d2cb3b72551f80a1aa63b9d1d6111d6` | มี NextAuth, User, Drama.userId; list กรอง user และ create ผูก session; เป็นโปรเจกต์ออกแบบใหม่อ้างอิง Huobao ไม่ใช่ patch สำหรับ Hono/Nuxt | ใช้เป็นแนวทาง ownership; ไม่ย้ายทั้งแอปหรือ copy auth ทั้งชุด |

ต้นทาง: [server entry](https://github.com/chatfire-AI/huobao-drama/blob/26de7df59806588e98e103a21bd0bfd26d4a55a6/backend/src/index.ts), [schema](https://github.com/chatfire-AI/huobao-drama/blob/26de7df59806588e98e103a21bd0bfd26d4a55a6/backend/src/db/schema.ts), [drama routes](https://github.com/chatfire-AI/huobao-drama/blob/26de7df59806588e98e103a21bd0bfd26d4a55a6/backend/src/routes/dramas.ts). คำว่า userData isolation ใน README หมายถึง directory ของ desktop app ไม่ได้ยืนยันผู้ใช้หลายบัญชีใน server เดียวกัน.

โปรเจกต์อ้างอิงมีล็อกอินจริง แต่ยังไม่ใช่หลักฐานว่าแยกข้อมูลครบ:

- [drama routes](https://github.com/dav-niu474/huobao-drama-ai/blob/eece93fa0d2cb3b72551f80a1aa63b9d1d6111d6/src/app/api/dramas/route.ts) ผูก session กับเจ้าของได้.
- [episode routes](https://github.com/dav-niu474/huobao-drama-ai/blob/eece93fa0d2cb3b72551f80a1aa63b9d1d6111d6/src/app/api/episodes/%5Bid%5D/route.ts) GET ตรวจเจ้าของ แต่ PATCH/DELETE ใน snapshot ตรวจ login แล้วทำงานด้วย episode ID โดยไม่ตรวจเจ้าของ.
- [storyboard PATCH](https://github.com/dav-niu474/huobao-drama-ai/blob/eece93fa0d2cb3b72551f80a1aa63b9d1d6111d6/src/app/api/storyboards/%5Bid%5D/route.ts) ไม่ตรวจ session/owner ภายใน handler; [middleware](https://github.com/dav-niu474/huobao-drama-ai/blob/eece93fa0d2cb3b72551f80a1aa63b9d1d6111d6/src/middleware.ts) ตรวจว่ามี cookie ชื่อ session เท่านั้น ไม่ยืนยันความถูกต้องของ session ในจุดนั้น.
- Drama.userId nullable และ [detail guard](https://github.com/dav-niu474/huobao-drama-ai/blob/eece93fa0d2cb3b72551f80a1aa63b9d1d6111d6/src/app/api/dramas/%5Bid%5D/route.ts) อนุญาตกรณีไม่มีเจ้าของ. เราจะไม่ใช้ owner=null เป็นข้อมูลสาธารณะ.

นี่เป็นผล static review ไม่ใช่ผลเจาะระบบหรือ runtime QA ของเว็บไซต์คนอื่น. ค้น metadata fork 100 รายการตามดาว + 100 รายการล่าสุด รวม 197 repo ไม่ซ้ำ และค้น login/authentication/多用户/登录 ผ่าน web search และ issue search; อ่านโค้ดต้นทาง, fork 3 repo และโปรเจกต์อ้างอิงหนึ่ง repo. **ยังไม่พบ fork ที่ยืนยันได้ว่าเติม auth และ isolation ครบพร้อมใช้กับฐานปัจจุบัน**; ไม่อ้างว่าตรวจโค้ดครบทุก fork.

## ทางเลือกที่เสนอ

เพิ่ม auth/ownership บน Hono + Nuxt + Drizzle + SQLite เดิม. ไม่ย้าย framework, ไม่เพิ่ม wallet ใน Huobao, ไม่เปิดสมัครสมาชิก/รหัสผ่านซ้ำกับ Tora รอบแรก. ใช้แนวทาง session → user → project จากโปรเจกต์อ้างอิง แต่เขียน guard ให้ตรงโค้ดเราและทดสอบข้ามบัญชีเอง.

เริ่มจาก login ด้วย Tora API key ผ่าน backend ของ Huobao; หน้าออก key/เติมเครดิตใช้ Tora เดิม. OAuth/SSO แบบกดเข้าสู่ระบบด้วย Tora พักไว้จนตรวจได้ว่า Tora เป็น identity provider ที่รองรับ protocol นี้จริง. New-API ที่รองรับ login ด้วย Google/GitHub ไม่ได้แปลว่า New-API ทำหน้าที่ OAuth identity provider ให้ Huobao อยู่แล้ว.

## A0 — สัญญาตัวตนกับ New-API ต้องชัดก่อนทำ UI

ข้อเท็จจริง local New-API ที่ตรวจ:

- `middleware/auth.go:451` TokenAuthReadOnly อ่าน token.UserId และ token.Id ได้ แต่อนุญาต token expired/exhausted เพื่ออ่านข้อมูลบางประเภท; มีการปฏิเสธ disabled token และ disabled user ในโค้ดจริง. อย่าใช้เพียง HTTP 200 เป็นหลักฐานว่า login ได้.
- `controller/token.go:287` GetTokenUsage คืน token quota และข้อจำกัดโมเดล แต่ไม่ได้คืน stable user identity หรือยอด wallet ที่ใช้ได้จริง. `GET /api/usage/token/` จึงไม่พอสำหรับผูกเจ้าของโปรเจกต์.
- TokenAuth สำหรับงานสร้างมี quota gate; ใช้ตรง ๆ เป็น login gate จะทำให้เครดิตหมดแล้วเปิดโปรเจกต์/เติมเงินลำบาก.

เสนอเพิ่ม **`GET /api/huobao/identity` ที่ New-API** (endpoint ใหม่ ยังไม่มี implementation) สำหรับ server-to-server ด้วย Bearer key. Reuse model/cache/auth parsing ที่มีอยู่ แล้วกำหนด checks เฉพาะ identity: key มีจริง, ไม่ถูกปิด/ลบ, ไม่หมดอายุ, บัญชี active, นโยบาย IP ที่ใช้กับ Huobao server ผ่าน; ไม่ปฏิเสธ login เพียงเพราะ quota เป็นศูนย์. ห้ามเรียก UserAuth ด้วย model API key แล้วสมมุติว่าเป็นบัญชี session.

Response ขั้นต่ำ: verified `user_id`, `token_id`, `account_status`, `token_status`, `expires_at`, display name ที่จำเป็น. ไม่คืน raw key, password hash หรือสิทธิ์ admin จาก client. Config issuer/base URL ที่ backend กำหนดเท่านั้น; login request ไม่ให้เลือก URL เอง. Owner mapping เป็น `(issuer ที่ตั้งไว้, user_id ที่ยืนยันแล้ว)` ไม่ใช้ key string, prefix, email หรือ client-supplied user_id เป็นตัวตน.

เครดิตใช้ quote/credits contract ตามแผนหลัก แสดงยอด spendable ที่ระบบกลางคำนวณแล้ว; ไม่ใช้ token.RemainQuota แทน wallet หรือ hard-code ตัวแปลงเงินใน Huobao. Strict managed-generation authorization ยังตรวจ token/account/model/IP/quota ทุกครั้ง. Live contract ต้องทดสอบกับ deployment Tora ที่ใช้จริงก่อนประกาศว่าพร้อม; local source ไม่ยืนยัน deployment version.

**ผ่านเมื่อ:** key สองอันบัญชีเดียวให้ user_id เดียว; ต่างบัญชีให้คนละ ID; empty/invalid/revoked/expired ถูกปฏิเสธ; active key quota=0 ยืนยันตัวตนได้แต่ submit managed ไม่ได้; ไม่มี credential ใน response/logs. หากเพิ่ม endpoint กลางไม่ได้ ให้พัก Tora login และ managed rollout ไม่ใช้ quota/name เดาเจ้าของ.

## A1 — session และตัวตนใน Huobao

- เพิ่ม `users` เฉพาะ local ID + issuer/external user ID unique + display name/status/timestamps; ไม่มี password หรือ wallet ใหม่.
- เพิ่ม `auth_sessions`: hash ของ random opaque session ID, user ID, credential/token binding, created/expiry/revoked time. ใช้ crypto มาตรฐานของ Node และ DB เดิม; ไม่สร้าง JWT/RBAC framework เพิ่มโดยไม่จำเป็น.
- `POST /api/v1/auth/login` รับ Tora key ผ่าน HTTPS → backend ตรวจ A0 → upsert user → rotate session → Set-Cookie. `GET /api/v1/auth/me` คืนตัวตนปลอดภัย; `POST /api/v1/auth/logout` revoke session และล้าง cookie. Login/logout/me เป็น API ที่เสนอใหม่.
- Cookie: HttpOnly, Secure บน production HTTPS, SameSite=Lax, Path=/; localhost dev มีข้อยกเว้น Secure เฉพาะ explicit dev config. ตรวจ Origin/CSRF สำหรับ mutation; rate-limit login. ห้ามใช้การมี cookie เฉย ๆ เป็น auth.
- Raw key ส่งครั้งเดียวตอนเชื่อม ไม่เก็บใน localStorage/URL/cookie. หาก worker ต้องใช้ต่อ เก็บ credential ที่เข้ารหัสฝั่ง server พร้อม token/account binding; encryption secret เป็น deployment secret ไม่อยู่ใน DB/logs. API ส่งคืนเฉพาะ masked key. เคลียร์ key input หลังใช้.
- identity cache อายุจำกัดไม่เกิน 60s รอบแรก; revalidate expiry/revocation/user status และ revoke session ที่ใช้ไม่ได้. เมื่อข้อมูลตรวจสิทธิ์หมดอายุแล้วระบบกลางติดต่อไม่ได้ ให้ protected request ตอบ 503 ไม่ข้าม auth. แยกสถานะ signed in / managed unavailable ใน UI ให้ชัด.
- middleware สร้าง authenticated actor ให้ routes/services/agents; ห้ามใช้ user_id/role ที่มากับ body/header เป็น actor. Credits=0 ไม่ revoke session.
- โหมด server multi-user และ local standalone เป็น config ตอน startup ไม่ใช่ query/header ที่ผู้ใช้สลับได้. Local anonymous mode bind loopback; production multi-user ต้อง fail startup หากยังเปิด anonymous mode หรือ migration/secret ไม่พร้อม.

**ผ่านเมื่อ:** session ปลอม/หมดอายุ/หลัง logout ใช้ไม่ได้; login ไม่เปิด session ของบัญชีเดิมให้คนใหม่; error ไม่คืน secrets; local direct workflow ยังผ่าน regressions. การเปลี่ยน API key บัญชีเดิมไม่สร้าง user ใหม่.

## A2 — เจ้าของโปรเจกต์และ migration ที่รักษาข้อมูลเดิม

- เพิ่ม `dramas.owner_user_id` และ index สำหรับ owner + deleted_at/updated_at; owner มาจาก authenticated actor ตอน create และแก้จาก body ไม่ได้.
- ตอน/ช็อต/ตัวละคร/ฉาก/props ตรวจเจ้าของผ่านสายสัมพันธ์ไป drama; ไม่เพิ่ม user_id ซ้ำทุกตารางโดยไม่มีเหตุจำเป็น. ตรวจ parent ID + child ID ว่าอยู่ในเรื่องเดียวกันทุก update/link/bulk operation.
- `sys_task`, uploads/assets ที่ยังไม่ผูกโปรเจกต์, AI credentials และข้อมูลเฉพาะผู้ใช้ต้องมี owner ที่คงที่ เพราะบางรายการไม่มี dramaId. videoMerges ต้อง resolve episode/drama owner ให้ได้; รายการที่ resolve ไม่ได้ไม่เปิดให้ user ปกติ.
- Backup แบบ SQLite-consistent ก่อน migration (backup API หรือหยุด writes/checkpoint ตามวิธีที่พิสูจน์แล้ว ไม่ copy main DB ขณะ WAL มีข้อมูลค้าง). Migration มี version/transaction, rerun ได้, เพิ่มคอลัมน์จริงให้ DB เก่า; `CREATE TABLE IF NOT EXISTS` อย่างเดียวไม่เปลี่ยนตารางเก่า.
- โปรเจกต์เก่า owner=null อยู่ในสถานะรอจัดสรร **ไม่เป็นข้อมูลสาธารณะ และไม่ตกเป็นของคนแรกที่ login**. ทำเครื่องมือ admin/CLI แสดง preview ID/ชื่อ/จำนวนแอสเซท → operator ระบุบัญชีปลายทาง → transaction backfill พร้อมรายงาน. งานที่รู้เจ้าของตาม relation backfill ตามนั้น; orphan/quota/config ที่กำกวมแยกไว้ตรวจ ไม่เดา.
- ไม่เปลี่ยน project/episode/shot IDs, ไม่ลบไฟล์หรือเอา schema ของโปรเจกต์อื่นมาแทน. โปรเจกต์เดิม 2 รายการจาก local audit ต้องยังอยู่ครบ. Seed/shared presets แยกจาก private provider credentials.
- ใช้ SQLite ต่อสำหรับ instance เดียวและ workload ที่ทดสอบผ่าน. หลาย user ไม่ได้บังคับเปลี่ยน DB; หลาย replicas/โหลดเขียนสูงค่อยตัดสินใจ DB หลังมีหลักฐาน.

**ผ่านเมื่อ:** rehearsal ด้วย DB copy มี row counts/IDs/media links ก่อนหลังเท่ากัน; owner ถูกต้อง; orphan ไม่หลุดสู่ user; restart/rerun ไม่เปลี่ยนเจ้าของ; restore backup พิสูจน์ได้ก่อนใช้ DB จริง.

## A3 — ปิดช่องเข้าถึงข้ามบัญชีทุกทาง

| พื้นที่ | งานที่ต้องทำ |
|---|---|
| dramas list/stats/detail/create/update/delete | filter owner ใน SQL ก่อน pagination/count; detail/update/delete ใช้ ID + owner; อ่าน/เขียนข้อมูลคนอื่นตอบ 404 โดยไม่เปิดเผยว่ามี ID นั้น |
| episodes/storyboards/characters/scenes/props + link tables | resolve parent ownership; validate reference IDs และ bulk IDs ทุกตัวก่อน side effect; mixed-owner batch ปฏิเสธทั้งชุด ไม่แก้บางตัวก่อน |
| Agent/chat/stream/tools | ตรวจ drama/episode ก่อนเรียก LLM; ส่ง actor เข้า RequestContext; tool/service ตรวจ scope ซ้ำเมื่อรับ ID จาก AI. Prompt ไม่ใช่ authorization; context ที่ถูกแก้ต้องเปิดโปรเจกต์อื่นไม่ได้ |
| tasks/generation/polling/retry/delete | snapshot owner, validated config, credential binding ตั้งแต่ submit; user A ใช้ task/config ID ของ B ไม่ได้; background worker ไม่หยิบ active key ของผู้ใช้ที่ login ล่าสุด |
| merge/export | ตรวจทุกช็อต/ไฟล์ต้นทางในตอนของเจ้าของ; retry merge/download ไม่สร้าง render ใหม่หรือเปลี่ยนบัญชีเครดิต |
| ai-configs/direct keys | list/get/test/update/delete scoped ตาม owner; encrypt/mask raw keys; getActiveConfig/getConfigById และ fallback ใน generation ต้องรับ owner ไม่มี fallback ไป config คนอื่น. Catalog provider/model ที่ไม่มี secrets อ่านร่วมกันได้ |
| app settings | ภาษาเนื้อหา/default config/tour state แยก user; prompts/skills/style presets ที่ใช้ร่วมกันให้ user อ่าน built-in ได้ แต่แก้ส่วนกลางได้เฉพาะ operator; ไม่เพิ่ม custom per-user prompt editor รอบนี้ |
| storage/server-update/Flow bridge | path/disk info, update และเครื่องมือ host เป็น operator-only. บัญชี Flow/session ของ host ไม่แสดงให้ user ทั่วไป; desktop Flow เดิมยังอยู่. Shared Flow render ใน SaaS ต้องมี adapter ที่ไม่เผย host session/บัญชี จึงเปิดภายหลัง |
| route registration | protected API เป็นค่าเริ่มต้น; public allowlist มีเฉพาะ health ที่ไม่เปิด secrets + auth ที่จำเป็น. เพิ่ม endpoint ใหม่ต้องไม่หลุดจาก guard |

ใช้ helper ownership ขนาดเล็กในจุดร่วมจริง; ไม่พึ่งซ่อนปุ่มหรือ middleware login เพียงชั้นเดียว. ตรวจทุก caller ที่อ่าน/เขียน object ด้วย ID รวม service/tool ที่เรียกข้าม route. Mutation allowlist fields ป้องกันการส่ง owner/parent/config ข้ามขอบเขต.

## A4 — ไฟล์ ภาพ วิดีโอ และหน้า UI

ปัจจุบัน `/static/*` เสิร์ฟไฟล์โดยไม่ตรวจสิทธิ์และมี public immutable cache. ล็อกหน้าโปรเจกต์อย่างเดียวจึงไม่ทำให้วิดีโอส่วนตัว.

- ในโหมด multi-user เปลี่ยน media serving ให้มี object→owner mapping; user ขอไฟล์โดย file ID แล้วตรวจ owner. ปิด anonymous `/static` ของไฟล์ private รวม thumbnail/poster; UUID และ directory แยก user ไม่ใช่ตัวตรวจสิทธิ์.
- รักษา URL เดิมด้วย legacy path resolver ที่ตรวจ owner จาก mapping ก่อนส่ง ไม่ทำ public fallback. ไฟล์ที่ยังไม่มี mapping ให้ operator จัดสรรก่อน. ไม่ต้องย้ายไฟล์ทั้งคลังถ้า mapping ทำงานครบ.
- รองรับ HTTP Range/206, content type, preview/download และ private cache policy เพื่อไม่ทำ playback Story Mode เสีย. CDN/reverse proxy ต้องไม่ bypass auth ด้วย alias storage และ invalidate public cache ที่เคยเผยไฟล์เดิมก่อนเรียกว่า private.
- Provider ที่ต้อง fetch reference ใช้ signed URL อายุจำกัดผูกกับ file/job ที่อนุญาตจริง; ไม่ใส่ Tora key ลง query และไม่เปิด static ทั้งคลังเพื่อแก้ provider fetch. Backend/provider base URL ที่เข้าถึงได้เป็น prerequisite แยก.
- Upload ตรวจ file type/size/canonical path และบันทึก owner ทันที. แชร์ไฟล์ระหว่าง user ไม่รวมรอบแรก. ห้ามรับ filesystem path จาก client มาโหลดไฟล์ของคนอื่น.
- Nuxt เพิ่ม login/session state/route middleware; useApi/useAgent handle 401 แบบเดียวกัน, 503 แสดง retry. Login/logout/เปลี่ยนบัญชีต้องล้าง cache, timers, pending fetch/SSE และ preview ของบัญชีเดิม; response เก่าที่มาช้าไม่เติม UI ของบัญชีใหม่.
- จัดเมนูให้ผู้ใช้เห็นโปรเจกต์/Story Mode/เครดิต/ตั้งค่า key ของตน; admin tools ไม่อยู่ในเมนู user. เครดิต 0 ยังมีลิงก์เติมเงินและเปิดงานเดิมได้. Direct provider ไม่มี Tora billing gate.
- `frontend/app/composables/useApi.ts` ปัจจุบัน log body; ต้องเลิก log credentials ของ login/config, ตรวจ backend task/error logs ด้วยก่อนรับ raw Tora key. การแก้ generic backend request logger ก่อนหน้านี้ไม่ยืนยันว่าทุก log ปลอดภัยแล้ว.

**ผ่านเมื่อ:** A ดูไฟล์ของ B ไม่ได้ทั้ง URL เก่า/ใหม่/thumbnail/download/Range; วิดีโอของ A เล่นจริงได้; logout แล้ว pending response ไม่โชว์ข้อมูล A ให้ B; provider reference fixture ทำงานโดยไม่เปิด media สาธารณะ.

## A5 — ผูกบัญชีกับเครดิตและรับงาน

ใช้ [M0–M4 ของแผนหลัก](HUOBAO_NEW_API_INTEGRATION_PLAN_TH.md) ต่อไป ไม่เปลี่ยนราคาหรือเพิ่ม wallet อีกชุด. Job เก็บ account/token/config snapshot และ idempotency key scoped ตาม owner. Login/logout/เปลี่ยน key ระหว่างงานไม่โยกค่าใช้จ่ายไปอีกบัญชี; worker ทำ settlement/reconciliation ของงานเดิมจาก binding ที่สร้างไว้ ไม่ส่ง render ใหม่เพราะ session หาย.

วิดีโอคิดจากวินาทีผลสำเร็จแยก model/resolution ตามข้อมูลกลาง; งานล้มเหลวไม่คิด video fee; clip สำเร็จใน batch คิดของ clip นั้นแม้ merge/อีก clip ล้มเหลว. Re-download/retry settlement ไม่หักซ้ำ. Text/image ที่ส่งผ่าน Tora ต้องใช้ contract ของบริการนั้นและแจ้งต้นทุน ไม่อ้างว่าใช้ฟรีเพราะ video billing เป็น success-only.

QA อิสระใช้ผู้ใช้ A/B + key A1/A2 ของบัญชีเดียว + operator + account/key ที่หมดอายุ/เครดิตศูนย์ ใน DB/test environment แยก;ไม่ทดสอบแก้/ลบข้อมูลจริงของผู้ใช้เพื่อพิสูจน์ช่องโหว่.

| กลุ่มทดสอบที่ต้องผ่าน | หลักฐาน |
|---|---|
| Identity/session | fake/missing/expired/revoked session ไม่ผ่าน; A1/A2 เห็นงานเดียวกัน; A/B แยก; ไม่มี raw credentials ใน logs/storage/response |
| Isolation matrix | list/stats/detail/create/update/delete/bulk/link/task/merge/config/Agent/tool/stream ทุก resource; มีกรณี B รู้ ID ของ A, forged owner/parent IDs และ mixed-owner batch |
| Async/restart | job ของ A ยังเป็นของ A เมื่อ B login; polls/retries ไม่ข้าม owner; logout ไม่ย้าย charge; restart ไม่ใช้ global config แทน snapshot |
| Files/browser | screenshot/trace จากสอง browser contexts แยก; private files/old URL/Range/caches; account switching, stale requests, Story Mode playback/download |
| Migration | copy DB, counts/IDs/media links, orphan preview, rerun/restart, rollback/restore ที่ทำจริง |
| Credits/regressions | zero credit อ่านงานได้, managed submit ถูกปิด, direct keys ไม่ถูก Tora quota gate; success seconds/partial batch/idempotent charge ตามแผนหลัก; local/desktop เดิมและ Story S1 ยังผ่าน |

คำว่า PASS ใช้เมื่อมี command/result และ artifacts ของรอบนั้น; fixture, source review, live identity, paid render และ independent browser QA แยกผล. หากยังไม่เรียก Tora deployment จริงให้รายงาน PARTIAL/NOT RUN ไม่ใช้ mock แทน live acceptance.

## ลำดับส่ง Dev และ QA

1. **A0 contract:** Dev New-API ทำ identity endpoint + fixture/contract tests; QA ตรวจ stable identity/status/zero quota. เป็น frontier แรก ไม่ลง login UI ก่อนสัญญาพร้อม.
2. **A1–A2 foundation:** Dev Huobao ทำ session/schema/guard และ migration rehearsal ใน DB copy; QA ตรวจ falsified sessions, old data และ user mapping. ยังไม่เปิด instance นี้ให้คนอื่น.
3. **A3–A4 full coverage:** Dev ไล่ route/service/tool/config/file scope และ UI; QA isolation matrix + browser + Range จริง. อย่ารับงานแค่ list ถูกกรอง.
4. **A5 + M2/M3:** Dev ต่อ identity ไป managed jobs/central billing ที่พร้อม; QA staging งานสั้นหนึ่งโมเดลพร้อม ledger/ไฟล์จริง และ direct regressions.
5. **Rollout:** operator จัดสรร owner ของข้อมูลเดิมและทวน deployment config/cache; เปิด multi-user หลัง gates ครบ. ห้ามเปิด auth บางส่วนบน production แล้วเรียกว่า tenant isolation.

Dev/QA แยกเจ้าของงานตาม workflow เดิม; เก็บ task brief, commands, source SHA, result, limitations และ next frontier. เอกสารนี้เป็น brief ส่งงานได้ แต่รอบนี้ยังไม่ได้สั่ง Dev implement.

## ไฟล์ที่ต้องถึงเมื่อ implement

- New-API: router/api-router.go, middleware/auth.go, controller identity ใหม่เท่าที่จำเป็น, user/token models/cache ที่ reuse, targeted tests และ API docs. Identity policy แยกจาก usage/history และ generation quota policy.
- Huobao DB: db/schema.ts, db/sqlite-schema.ts/init/migration, mysql-import compatibility และ desktop data path ที่เกี่ยวข้อง; เพิ่ม users/session/owner fields ที่จำเป็น.
- Huobao API: index.ts, middleware ใหม่; dramas/episodes/storyboards/characters/scenes/props/tasks/upload/merge/aiConfigs/agent/settings/storage/skills/prompts/stylePresets/serverUpdate/flowBridge ตาม scope.
- Services/agents: generation/config selection, task persistence/poll/retry, merge, storage/download/reference helpers, app-settings, agents/context.ts และ agents/tools callers; durable Story run/planner ที่เพิ่มภายหลังต้องใช้ actor เดียวกัน.
- Frontend: login page/session composable/middleware, useApi.ts/useAgent.ts, index/drama/detail/story/episode/settings, 5 locales, media/download handling; desktop/local startup behavior และ Nuxt proxy.
- Tests/fixtures/config: two-user DB fixtures + invalid sessions + old unowned data + file/media fixture + model/config-owner mismatch + browser contexts; deployment env, reverse proxy/CDN และ startup validation. ไม่มีจริง keys ใน fixture.

## ส่วนที่พักไว้

Team sharing/invite, organizations, role packages/free-pro limits, OAuth SSO, password signup/reset, Colab/Drive, template marketplace, public sharing และ DB migration ไป PostgreSQL ไม่จำเป็นต่อหนึ่ง user เป็นเจ้าของโปรเจกต์รอบแรก. Shared Flow account สำหรับ SaaS พักจนมี secure adapter; direct provider ของผู้ใช้และ Flow ใน local mode ยังคงตาม requirement เดิม.

## เงื่อนไขการนำ upstream ไปให้บริการคิดเงิน

ต้นทาง snapshot ปัจจุบันระบุ [CC BY-NC-SA 4.0 และเงื่อนไขเชิงพาณิชย์ใน README](https://github.com/chatfire-AI/huobao-drama/blob/26de7df59806588e98e103a21bd0bfd26d4a55a6/README.md#-license). ก่อนเปิดบริการ Huobao ที่เก็บเงิน ต้องตรวจสิทธิ์ของฐานโค้ดที่เราใช้และหลักฐานอนุญาตที่มีอยู่; แผนเทคนิคไม่ยืนยันสิทธิ์แทนเอกสารนั้น. โปรเจกต์อ้างอิงมีไฟล์ MIT แต่ไม่ใช่หลักฐานเปลี่ยน license ของ Huobao เดิม. การวางแผนและ local QA รอบนี้เดินต่อได้; production paid rollout มีเงื่อนไขนี้.

## ข้อจำกัดหลักฐานรอบนี้

ตรวจต้นทาง/fork แบบ static และอ่าน New-API local; ไม่ได้ติดตั้ง/รันเว็บของ fork, ไม่ login บัญชีจริง, ไม่ทดสอบจ่ายเครดิตหรือ migrate DB จริง. ไม่สามารถรับประกันว่าไม่มี fork อื่นที่ทำครบ. User isolation ปัจจุบันยังไม่มี implementation; เอกสารนี้ไม่เปลี่ยนข้อเท็จจริงนั้น.
