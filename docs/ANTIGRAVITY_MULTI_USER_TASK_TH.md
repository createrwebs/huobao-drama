# Prompt สั่ง Antigravity: Huobao multi-user + Tora

คุณคือ Antigravity รับผิดชอบพัฒนาและประสาน QA งานนี้จนผ่านเกณฑ์รับงาน ไม่หยุดแค่เสนอแผนหรือเพิ่มหน้าล็อกอิน ให้ทำเป็น milestone ตรวจผลจริง แก้ข้อบกพร่อง และบันทึกหลักฐานทุกช่วง

## เป้าหมาย

ทำ Huobao ให้รองรับผู้ใช้หลายราย โดยเชื่อมตัวตนกับบัญชี Tora/New-API ผู้ใช้สร้างและเข้าถึงโปรเจกต์ของตัวเองได้ รวมตอน ช็อต ตัวละคร งานสร้างสื่อ ภาพ วิดีโอ และดาวน์โหลด ผู้ใช้คนอื่นต้องเข้าถึงไม่ได้แม้รู้ ID หรือ URL

API key หลายอันของบัญชี Tora เดียวกันต้องเห็นโปรเจกต์ชุดเดิม เปลี่ยน key แล้วงานไม่หาย แสดงเครดิตที่ใช้ได้จริงจากระบบกลาง และคิดค่าบริการวิดีโอตามวินาทีของผลลัพธ์ที่สร้างสำเร็จ แยกโมเดลและความละเอียด งานซ้ำ/ดาวน์โหลดซ้ำไม่หักซ้ำ

เครดิต Tora เป็นศูนย์ยังเปิดงานเดิมและใช้ direct provider key ของตนเองได้ แต่สร้างผ่าน Tora ไม่ได้ คงโหมด local/desktop เดิมโดยไม่บังคับ Tora login; ในโหมด server ให้ login ป้องกันข้อมูลทุก provider โดยแยกจากการตรวจเครดิต

## Workspace และเอกสารที่ต้องอ่านก่อนแก้

Huobao: /Users/noppanan/huobao-drama
New-API: /Users/noppanan/new-api
เว็บ local ที่ผู้ใช้เปิด: http://localhost:3013/

อ่าน AGENTS.md ที่มีผลกับแต่ละ repo และ /Users/noppanan/.codex/RTK.md ใช้ rtk นำหน้าทุก shell command

อ่าน Markdown เหล่านี้ให้ครบและตรวจเทียบกับ source ปัจจุบัน:
1. /Users/noppanan/huobao-drama/docs/HUOBAO_MULTI_USER_PLAN_TH.md — แผนหลัก A0–A5 และขอบเขตทั้งหมด
2. /Users/noppanan/huobao-drama/docs/HUOBAO_NEW_API_INTEGRATION_PLAN_TH.md — identity/credits/managed video/reserve/settle/recovery ที่ต้องเชื่อม
3. /Users/noppanan/huobao-drama/docs/STORY_MODE_IMPLEMENTATION_PLAN_TH.md — รักษาหน้า Story Mode และข้อมูลเดิม; รอบนี้ไม่ทำ planner/create-all เพิ่ม
4. /Users/noppanan/huobao-drama/docs/antigravity-story/PROGRESS.md
5. /Users/noppanan/huobao-drama/docs/antigravity-story/PO_ACCEPTANCE_S1.md
6. /Users/noppanan/huobao-drama/docs/antigravity-story/PO_ACCEPTANCE_TORA_LOGGING.md
7. /Users/noppanan/.codex/skills/po-antigravity/SKILL.md — workflow และการแยก Dev/QA
8. /Users/noppanan/huobao-drama/docs/antigravity-story/ecc/security-reviewer.md
9. /Users/noppanan/huobao-drama/docs/antigravity-story/ecc/tdd-guide.md
10. /Users/noppanan/huobao-drama/docs/antigravity-story/ecc/code-reviewer.md
11. /Users/noppanan/huobao-drama/docs/antigravity-story/ecc/typescript-reviewer.md
12. /Users/noppanan/huobao-drama/docs/antigravity-story/ecc/e2e-runner.md

อ่าน /Users/noppanan/huobao-drama/docs/auth-research/RESEARCH_2026-10-10.json เพื่อดู source SHA และข้อจำกัดการค้น fork เอกสาร ECC เป็นเกณฑ์ทำงาน ไม่ได้ยืนยันว่ามี agent ชื่อเหล่านั้นติดตั้งใน Antigravity

หากต้องตรวจ upstream ให้ใช้ https://github.com/chatfire-AI/huobao-drama และ docs API https://docs.newapi.ai/en/docs/api ส่วน https://github.com/dav-niu474/huobao-drama-ai ใช้ศึกษาแนวทางเท่านั้น มี ownership gaps ที่บันทึกไว้แล้ว ไม่ย้าย framework หรือ copy auth ทั้งชุด

## วิธีทำงาน

เริ่มจากตรวจ Git status/diff ทั้งสอง repo จด baseline ของงานเดิมและคำสั่งทดสอบจริง มีงาน Story Mode/skills/logger ที่ทำไว้แล้วทั้ง staged และ unstaged ห้าม reset, overwrite, git add ทั้ง repo หรือรวมการแก้เดิมเป็นผลงานรอบนี้ เก็บ flow-drama-autopilot/flow-agent-ref และข้อมูลผู้ใช้เดิมไว้

สร้าง docs/antigravity-auth/ เพื่อเก็บ PROGRESS.md, TASK แต่ละ milestone, DELIVERY, QA, FEEDBACK และ artifacts ใช้ evidence filename ใหม่ทุกครั้ง แยกผล Dev self-check กับ independent QA ให้ชัด หากใช้ CLI เก็บ conversation_id, raw result/stderr/exit code และตรวจ denied actions ไม่ถือ exit 0 หรือคำว่า SUCCESS เป็นหลักฐานว่างานผ่าน

Dev และ QA ต้องเป็นคนละ Antigravity conversation QA อ่าน product code อย่างเดียว และใช้ DB/บัญชี/ไฟล์ทดสอบแยกจากข้อมูลจริง แต่ละ QA round ไม่เกิน 5 นาที ส่ง defect ที่พิสูจน์แล้วกลับ Dev เดิม แก้แล้วให้ QA ตรวจใหม่ Codex PO รับงานจาก diff และหลักฐาน ไม่ใช้ Dev self-check แทน QA

ทำตามลำดับนี้ โดยเขียน tests ที่พิสูจน์ security/money behavior ก่อนแก้ และใช้ helper/dependencies ที่มีอยู่:

A0: ตรวจ New-API source และเพิ่ม identity contract ที่ยืนยัน stable user_id จาก Tora key GET /api/huobao/identity ในแผนเป็น endpoint ที่เสนอใหม่ ต้อง implement และทดสอบจริง ไม่สมมุติว่ามีแล้ว แยก key/account validity จาก quota: expired/revoked/disabled/invalid ไม่ login แต่ active key เครดิตศูนย์ login ได้ อย่าใช้ token usage/name/prefix หรือ client user_id เดาเจ้าของ

A1: เพิ่ม users/session และ login/me/logout ใน Huobao ผูก user ด้วย issuer + verified external user_id ใช้ server-side session ที่ตรวจความถูกต้องจริง พร้อม cookie/CSRF/expiry/revocation และการเก็บ credential ฝั่ง server อย่างปลอดภัย ไม่เก็บ raw key ใน browser storage/URL/logs ตรวจ frontend useApi body logging และ task/error logs ด้วย

A2: เพิ่มเจ้าของโปรเจกต์และข้อมูลที่ไม่มี project relation ทำ versioned migration และ rehearsal ด้วย DB copy สำรองแบบ SQLite-consistent ตรวจ counts/IDs/media links และ restore โปรเจกต์เก่า owner=null ไม่เป็น public และไม่ยกให้คนแรกที่ login สร้าง admin/CLI preview สำหรับกำหนดเจ้าของจริง ห้ามเดาบัญชีปลายทางหรือ migrate DB ผู้ใช้จริงก่อนรู้ mapping

A3: บังคับ ownership ฝั่ง backend ครบทั้ง list/stats/detail/create/update/delete/bulk/link, episodes/storyboards/characters/scenes/props, tasks/poll/retry/merge, configs และ Agent/tools/stream ตรวจ parent/child/reference IDs และ actor จาก session ใช้ config ของเจ้าของเท่านั้น ไม่ fallback ไป active config ของคนอื่น Background jobs ต้อง snapshot owner/account/token/config ตอน submit และคงบัญชีเดิมแม้เปลี่ยน login/key ระหว่างงาน

A4: ป้องกันไฟล์ private รวม /static URL เดิม, thumbnail, video preview, Range/206 และ download ต้องมี file-to-owner mapping ไม่มี public fallback จัด provider reference URL แบบจำกัดสิทธิ์ เพิ่ม Nuxt login/session/401/503 handling ล้าง cache/pending fetch/SSE เมื่อเปลี่ยนบัญชี รักษา Story Mode playback และ direct workflows เดิม แยก host/admin tools กับข้อมูลของ user ตามแผน

A5: เชื่อม identity กับ Tora credits/managed jobs และส่วนจำเป็นของ M0–M4 ในแผนหลัก เริ่มหนึ่งโมเดลวิดีโอที่พิสูจน์ route/ราคา/actual usage ได้ ใช้ atomic durable reservation และ settlement ที่ New-API งานล้มเหลวไม่คิด video fee คิด successful output seconds ตามราคา model/resolution snapshot ไม่รับยอด/success จาก client ไม่เปลี่ยน billing ของลูกค้าอื่น คลิปสำเร็จใน partial batch ยังคิดตามจริง; merge/download/restart/duplicate callback ไม่หักซ้ำหรือ resubmit โดยไม่ reconcile

ทดสอบ milestone ก่อนเดินไป dependency ถัดไป แก้ ordinary defects ต่อเองภายในขอบเขต ไม่ถามยืนยันซ้ำเรื่อง implementation ที่ระบุไว้แล้ว ถ้าต้องเปลี่ยนแผนให้บันทึกเหตุผลและรักษา requirement เดิม

## เกณฑ์ที่ต้องผ่านก่อนประกาศเสร็จ

- A/B แยกข้อมูลครบ และ key A1/A2 ของบัญชีเดียวกันเห็นโปรเจกต์เดิม
- ไม่มี/fake/expired/revoked session ผ่านไม่ได้; ปลอม owner/role/parent ID หรือ mixed-owner batch ไม่ทำ side effect
- A เปิด/แก้/ลบ/poll/export ข้อมูล B ไม่ได้ รวม Agent tools และ config IDs
- URL ไฟล์เก่า/ใหม่/thumbnail/download/Range ของ B ไม่หลุดให้ A; วิดีโอของเจ้าของเล่นและดาวน์โหลดจริงได้
- Logout/account switch/pending response/restart ไม่ทำข้อมูลหรือเครดิตข้ามบัญชี
- Migration copy DB/rerun/restore ผ่านและข้อมูลเดิมครบ; orphan ถูกกันไว้และมีขั้นตอนจัดสรร
- เครดิตศูนย์เปิดงานเดิม/direct provider ได้ แต่ managed submit ไม่ได้; unlimited token ยังต้องมี wallet จริง
- Successful output seconds/model/resolution/partial batch/duplicate submit/callback/restart/settlement ถูกทดสอบและไม่หักซ้ำ
- ไม่มี raw key ใน responses/logs/browser storage/artifacts; host settings/Flow credentials ไม่เผยให้ user
- รัน focused tests, typecheck/build และ regressions ที่ถูกกระทบของทั้งสอง repo แยก legacy failures จากข้อบกพร่องใหม่
- QA เปิด browser จริงด้วยสอง contexts แยกบัญชี เก็บ screenshots/trace/machine-readable summary พร้อม exact commands, exit codes และ test counts
- Live Tora/staging ที่จำเป็นต้องใช้บัญชีทดสอบ ราคา/channel และวงเงินที่ยืนยันแล้ว มี task ID, ไฟล์จริง, ยอดก่อน/หลังและ ledger fixture ไม่แทนหลักฐาน live

## ขอบเขตและกรณีติดขัด

รอบนี้ทำ auth/isolation และ Tora integration ที่จำเป็นให้ครบ ไม่เพิ่ม team sharing, password signup, OAuth SSO ที่ยังไม่พิสูจน์, marketplace, Colab/Drive/H3 worker, Story planner/create-all หรือย้าย framework/DB โดยไม่มีเหตุจำเป็น

ใช้ local/staging และ test accounts ตามสิทธิ์ที่มีอยู่ ไม่ extract browser credentials, ไม่ใส่ API key จากแชตลงเอกสาร, ไม่ bypass permissions และไม่ซื้อ/เติมเงิน/ใช้ production DB เพื่อทดสอบ ไม่ push หรือ deploy production ในงานนี้ ก่อนเปิดบริการเก็บเงินต้องตรวจสิทธิ์ license ตามแผน

หากขาด live credentials, owner mapping, configured pricing/channel, สิทธิ์เครื่องมือ หรือ independent QA ให้บันทึก blocker และทำส่วนที่ไม่ติดเงื่อนไขต่อ เตรียมผลให้พร้อมตรวจ พร้อมขั้นตอนปลด blocker ห้ามสร้างข้อมูลเท็จเพื่อปิดงาน เมื่อเงื่อนไขเดิมติดซ้ำ 3 review rounds โดยไม่มีหลักฐานใหม่ ให้หยุดส่วนที่ติดและรายงาน ไม่วนรอบเดิม

## ผลส่งมอบ

อัปเดต docs/antigravity-auth/PROGRESS.md หลังแต่ละ milestone ระบุ requirement → changed files → exact verification → artifacts → PASS/FAIL/PARTIAL/BLOCKED/NOT RUN → next frontier แยก local/fixture/independent QA/live/provider results และปรับสถานะในแผนหลักให้ตรงของจริง

รายงานสุดท้ายต้องมีวิธีเปิด local กับ server mode, environment ที่จำเป็นโดยไม่มี secrets, migration/owner assignment/restore instructions, route/isolation coverage, วิธี login/create project/play/download/ดูเครดิต, QA evidence และสิ่งที่ยังไม่ผ่าน ประกาศเสร็จได้เมื่อ mandatory acceptance ผ่านทั้งหมด หากยังติด external gate ให้ส่งงานที่ทำเสร็จพร้อมสถานะ PARTIAL/BLOCKED ของงานรวมและสิ่งที่ต้องใช้เพื่อปิดงาน

เริ่มตรวจ baseline และอ่าน Markdown ตอนนี้ จากนั้น implement ตามลำดับจนจบ ไม่ส่งเพียงแผนกลับมา
