# แผน Huobao → Tora / New-API

วันที่: 10 ตุลาคม 2026 (Asia/Bangkok)
สถานะ: แผนพร้อมแบ่งงาน; ตรวจ source แล้ว แต่ยังไม่มี product implementation หรือผลทดสอบระบบคิดเงินจริง

## เป้าหมายหลักที่ยืนยันล่าสุด

ผู้ใช้ต้องการ **ใช้ Huobao ด้วย API key จาก toraapi.com แสดงเครดิตที่เหลือ และหักเครดิตจากวิดีโอที่สร้างสำเร็จ**. สูตรยังยึดคำตอบก่อนหน้า: จำนวนวินาทีของคลิปที่สำเร็จ แยกโมเดลและความละเอียด ไม่เปลี่ยนเป็นราคาเหมาจ่ายต่อคลิปเพราะคำว่า “จำนวนวิดีโอ”. เช่น สำเร็จ 2 คลิปที่ยาว 6s และ 8s ในโมเดล/ความละเอียดเดียวกัน คิด 14s × rate ของงานเหล่านั้น; คลิปที่สามล้มเหลวคิด 0.

Colab/Google Drive เป็นส่วนขยาย **พักไว้** และไม่เป็น prerequisite ของงานหลัก. รอบแรกเปิดวิดีโอผ่าน Tora หนึ่งโมเดลที่ผ่าน contract และ settlement ครบก่อน แล้วขยายโมเดลตามหลักฐาน. ห้ามให้ UI เลือกโมเดลที่ยังไม่มี route/ราคา/usage ที่พิสูจน์แล้ว. Text/image และ provider key อื่นของผู้ใช้คง workflow เดิม; ไม่บังคับทั้งแอปให้ใช้ Tora.

แผนเพิ่มหน้า Story Mode เพื่อให้ใช้งานง่ายอยู่ใน [STORY_MODE_IMPLEMENTATION_PLAN_TH.md](STORY_MODE_IMPLEMENTATION_PLAN_TH.md). ใช้ Agent/งานสร้างสื่อเดิม; ไม่เพิ่ม wallet อีกชุด. หน้าและ planner ทดสอบด้วย fixture ได้ก่อน แต่ paid managed workflow ต้องรอ settlement/recovery ของแผนหลักผ่าน.

## ขอบเขตที่ผู้ใช้กำหนด

- `new-api` เป็นตัวกลางออก API key ตรวจเครดิต และเป็นผู้หักเครดิต
- แทนช่อง **Huobao API Key / Firemux** ด้วย API key ที่ออกจากระบบ Tora ที่ `https://toraapi.com`
- ไม่มี key ที่ใช้ได้ = ไม่มีเครดิตของระบบกลางและใช้บริการผ่านระบบกลางไม่ได้
- เครดิตวิดีโอคิดตาม **วินาทีของวิดีโอผลลัพธ์ที่สร้างสำเร็จ × ราคาตามโมเดลและความละเอียด**
- Gemini, OpenAI, Aliyun, Volcengine, MiniMax ที่ใช้ key ของตนเอง รวมถึง Flow/Antigravity เดิม ยังใช้งานได้ ไม่ผูกการตรวจเครดิต Tora เข้ากับทั้งแอป
- ไม่ปรับราคาหรือสูตรเดิมของลูกค้า Tora รายอื่น ไม่ deploy production ในงานนี้

## ระบบเดิมที่ตรวจพบ

| เรื่อง | หลักฐาน source ปัจจุบัน | ผลต่อแผน |
|---|---|---|
| Huobao API Key | `frontend/app/pages/settings.vue`: `huobaoSiteUrl`, `huobaoQuickConfigs`, `applyHuobaoQuickConfig` | เป็น quick setup ที่คัดลอก key เดียวลง 7 configs ของ text/image/video ที่ยิงไป Firemux .cn/.com ไม่ใช่ license หรือ wallet ของ Huobao |
| หักเครดิตใน Huobao | `backend/src/services/generation.ts` | ส่งงาน → poll → download → completed; ไม่มี ledger หรือสูตรหักเครดิตของ Huobao จึงยืนยันราคา/จังหวะหักของ Firemux จาก repository นี้ไม่ได้ |
| เครดิต Flow | `backend/src/services/flow-engine.ts` | เป็นเครดิตบัญชี Flow ที่อ่านจาก engine อีกระบบ ไม่ใช่ wallet Tora |
| ออก key | `new-api/router/api-router.go`, `controller/token.go`, `model/token.go` | มี `POST /api/token/` และ reveal `POST /api/token/:id/key` ภายใต้ UserAuth; ไม่ต้องสร้าง issuer ใหม่ |
| ดู token quota | `GET /api/usage/token/`, `TokenAuthReadOnly`, `GetTokenUsage` | endpoint คืน quota ของ token เท่านั้น; ไม่ใช่ยอด wallet ที่ใช้ได้จริง และ read-only อนุญาต exhausted/expired บางสถานะเพื่อดูประวัติ จึงใช้เป็นหลักฐานอนุมัติสร้างงานไม่ได้ |
| วิดีโอกลาง | `router/video-router.go`, `router/task-router.go`, task plugins | มี `/v1/video/generations`, `/v1/videos`, `/v1/tasks/:key` และ plugin/vendor endpoints; ใช้ token authentication |
| คิดเงิน task กลาง | `controller/relay.go`: persist task แล้วเรียก `SettleBilling` / `LogTaskConsumption`; `service/task_polling.go`, `service/task_billing.go` | ปัจจุบัน settle และบันทึกใช้เงินตั้งแต่ submit; failure คืน และ success ปรับส่วนต่าง ไม่ใช่ success-only ledger ที่ต้องการ |
| จอง wallet | `model/wallet_pre_consume.go` | มี durable pending/settled/refunded reservation ใช้เป็นฐานได้ แต่ต้องตรวจ transaction, token quota, idempotency และ reconciliation ก่อน reuse; helper ไม่ใช่หลักฐานว่าทั้ง lifecycle atomic แล้ว |
| Studio/native | `/api/studio/*` ภายใต้ UserAuth; `service/studio_native.go` | มี SUCCESS_SETTLEMENT แต่เป็นอีก auth plane/งานคนละชนิด ไม่ควรเอา relay key ไปเรียก complete ที่เชื่อ client หรือสลับชื่อ execution class เพื่อเลี่ยง billing |
| หน่วยเครดิต | `service/studio_pricing.go`: `QuotaPerCredit = 1000` | reuse หน่วยเครดิตกลาง; backend เก็บ integer quota และ frontend แสดงเครดิต ห้ามสร้างอัตราแปลงใหม่ |
| Huobao restart | `backend/src/index.ts` | ตอนเริ่ม process เปลี่ยนทุก processing task เป็น failed; ต้องยกเว้น/recover งานกลาง เพื่อไม่ให้ผู้ใช้กดสร้างใหม่ทั้งที่งานเดิมสำเร็จและถูกคิดเครดิตแล้ว |

## เอกสารและ production

- [New-API API Reference](https://docs.newapi.ai/en/docs/api) แยก model API และ management API
- [Token usage](https://docs.newapi.ai/en/docs/api/management/token-management/usage-token-get) ยืนยัน Bearer token และ `/api/usage/token/`
- [Create video task](https://docs.newapi.ai/en/docs/api/ai-model/videos/createvideogeneration) ยืนยัน submit/poll ที่ `/v1/video/generations`
- [OpenAI-compatible video](https://docs.newapi.ai/en/docs/api/ai-model/videos/sora/createvideo) อธิบาย `/v1/videos`
- โค้ด checkout เป็นระบบที่ปรับจาก upstream; plugin endpoints/custom billing ต้องยึด source และทดสอบ ไม่ถือว่า docs ต้นฉบับยืนยัน deployment ของ Tora
- วันที่ตรวจ: web tool เปิด `https://toraapi.com/` ไม่ได้ และ curl จบ exit 35 `SSL_ERROR_SYSCALL`; ยังยืนยัน redirect/API origin/เวอร์ชัน/active channels ของ production ไม่ได้ ไม่เปลี่ยน hostname production อื่นตาม docs เก่าโดยอัตโนมัติ

## สถาปัตยกรรมเป้าหมาย

```text
ผู้ใช้สร้าง/revoke API key และเติมเงินบน Tora
                    ↓
Huobao Settings: Tora API Key + สถานะเครดิต (backend เก็บ key; UI ได้ค่า masked)
                    ↓ Bearer relay token
New-API: ตรวจ user/token → quote → reserve → submit/poll provider
                    ↓ authoritative successful output + actual output seconds/resolution
New-API: settle ครั้งเดียว + คืนส่วนที่จองเกิน → คืน task/billing status
                    ↓
Huobao: poll/download/แสดงสถานะและเครดิตจากระบบกลาง
```

Provider key ที่ระบบกลางใช้เรียก upstream อยู่ใน New-API channels; Huobao ไม่ได้รับ key ของ channel และไม่หักเครดิตซ้ำเมื่อดาวน์โหลดไฟล์

## เครดิตและสิทธิ์

1. API key คือ credential ของบัญชีและข้อจำกัด token ไม่ใช่กระเป๋าเงินอีกใบ การออก key ไม่เพิ่มเงิน
2. ตรวจ user enabled, token enabled, expiry, IP/model/route constraints และ wallet จริงทุก submit; รูปแบบ `sk-` อย่างเดียวไม่ใช่ validation
3. สำหรับ token แบบจำกัด ยอดใช้ได้เริ่มจาก `min(wallet_available, token_remaining)`; unlimited token ยังคงติดยอด wallet ไม่ใช่เงินฟรี
4. งาน Huobao ระยะแรกใช้ wallet เครดิตที่เติมกลาง; การใช้ subscription quota ต้องแยก contract ชัดก่อนรวมในยอดแสดง
5. ไม่มี key → UI แสดง 0 / ยังไม่เชื่อมต่อ; key ไม่ผ่าน → 0 / key ใช้ไม่ได้; ระบบกลางล่ม → ไม่ทราบยอด/ตรวจสอบไม่ได้ ห้ามปลอมเป็น 0 หรืออนุมัติงานกลางจาก cache
6. local cache ใช้แสดงผลเท่านั้น; การเช็กเครดิต frontend ไม่แทน server-side atomic reservation
7. Tora gate ใช้เฉพาะ config ที่ระบุ managed Tora อย่างชัดเจน ห้าม gate โดย provider name, `sk-` prefix, ชื่อ config ที่แปลตาม locale หรือทั้ง `generateVideo()`
8. ไม่ fallback จาก managed ไป key ของผู้ใช้เมื่อเครดิตหมด; ผู้ใช้เลือก config ของตนเองได้ตาม workflow เดิม
9. UI ไม่โชว์/ส่งกลับ raw central key ใน list/settings/logs/browser storage; local backend ต้องมีขอบเขต access ที่เหมาะกับ desktop เดิม และไม่เปิด endpoint secret ออก public

## สูตรหักเครดิตและการสำเร็จ

```text
final_quota = round_by_existing_quota_rule(
  sum(successful_output_seconds × configured_quota_per_second(model, actual_resolution))
)
display_credits = final_quota / existing_QuotaPerCredit
```

- ราคาเป็นค่า configured ฝั่ง New-API; ไม่มีราคา model/resolution ที่อนุมัติแล้ว → reject ก่อนเรียก provider ห้าม hard-code ตัวเลขสมมุติ
- เก็บ price/model/resolution/billing-policy snapshot ตอน quote/submit เพื่อให้แก้ราคากลางคันไม่เปลี่ยนค่าของงานเดิม
- เริ่มด้วยหนึ่งคลิปต่อ task ตาม Huobao ปัจจุบัน; batch นับแต่ละ task ที่สำเร็จ ไม่คิดทั้ง batch ถ้ามีบางรายการล้มเหลว
- ใช้ actual output duration ที่ระบบกลางตรวจเอง ห้ามใช้ค่าที่ Huobao POST อ้างว่าสำเร็จ หรือ duration ที่ร้องขอแทนค่าจริงโดยเงียบ ๆ
- ถ้า provider ไม่ส่ง actual output duration ให้ระบบกลางตรวจไฟล์ผลลัพธ์ด้วย media probing ที่มีอยู่ พร้อม download size/time/SSRF guards; ถ้ายังตรวจไม่ได้ให้ `usage_pending` และ reconcile โดยยังไม่ settle ไม่คิดจาก estimate แล้วเรียกว่า actual
- ใช้ความละเอียดที่สำเร็จจริง/ที่ backend normalize แล้ว ไม่คิดตาม label frontend โดยเฉพาะ Seedance ที่ Huobao ลด 1080p เป็น 720p และ MiniMax H3 ที่มี 768P/2K
- สำหรับลูกค้า Huobao ให้นับวินาที output เท่านั้น ตามคำตอบผู้ใช้; input reference/provider costs ไม่ถูกเพิ่มในสูตร retail นี้โดยเงียบ ๆ
- Wan plugin เดิมมี `seconds = input_video_duration + output_video_duration`; MiniMax H3 มี input-image/input-video facts; Seedance completion hook เดิมใช้ token facts เป็นหลัก ต้องสร้าง output-seconds path ที่แยกขอบเขตจากราคาเดิม ไม่แก้ hook เดิมให้ลูกค้าทุกคนเปลี่ยนค่าใช้จ่าย
- นิยามสำเร็จ: New-API ยืนยัน provider success และมี artifact ที่ตรวจสอบได้พร้อม usage; Huobao ดาวน์โหลดล้มเหลวเป็น delivery error และดาวน์โหลดใหม่จาก task เดิม ไม่สร้างซ้ำ/คืนเงินเพราะ local download error

## การจองและ settlement

- ก่อน submit จองวงเงินตาม upper bound ที่ backend อนุมัติ (auto-duration ต้องมีเพดานชัดเจน); แสดง available/reserved/used แยกกัน การจองทำให้ available ลดแต่ used ยังไม่เพิ่ม
- สำเร็จ → settle actual quota ครั้งเดียวและ release ส่วนเกิน; failure/cancel ที่ provider ยืนยัน → release ทั้งหมด ยอดใช้จริง 0
- timeout/network/restart เป็นสถานะไม่แน่นอน ไม่เท่ากับ failure: reconciliation กลางต้อง poll งานเดิมก่อนคืนเงิน/ส่งซ้ำ
- ใน snapshot ของงานผูก user ID, token ID, request/idempotency key, task ID, channel/plugin/version, hold ID และราคา; key เปลี่ยน/revoke ไม่ย้ายภาระงานเดิมไปบัญชีใหม่
- reserve/settle/refund ต้อง transaction หรือ durable state machine ที่ recover ได้ รวม wallet, limited token, used quota/log; unique settlement/hold key และ conditional state transition กัน polling/webhook พร้อมกัน
- อย่าเอา `PreConsumeUserWallet` มาเรียกซ้ำด้วย request ID เดิมโดยตรง: helper เพิ่มยอด pending เดิมได้; idempotency ต้องตรวจ request/job และ payload ก่อน reserve
- ไม่รื้อ billing ของทุก task: เพิ่ม policy สำหรับ Huobao managed video เท่านั้น ผูกกับ server-owned route/channel/integration scope ที่ผู้ใช้แก้ header/body/name เพื่อปลอมไม่ได้; ตรวจการเลือก scope กับโมเดลสิทธิ์เดิมก่อนเพิ่ม field
- ระวัง helper orphan refund ที่ default อายุ 10 นาที: task วิดีโออาจใช้เวลานาน ห้าม refund hold ของงานที่ยัง active เพราะอายุอย่างเดียว

## API และ provider compatibility

Re-use token issuing/reveal ในหน้า Tora; Huobao เปิดลิงก์ให้ผู้ใช้สร้าง key และวาง relay key โดยไม่เก็บ management session.

เสนอ custom read-only `GET /v1/huobao/credits` สำหรับสถานะ token + wallet ภายใต้ relay credential พร้อม stricter validity checks; เป็น endpoint ใหม่ ไม่ใช่ API ที่มีอยู่ใน upstream docs. แสดง quota หน่วยกลางและ conversion factor จาก backend ไม่มี secret/user PII ส่วนเกิน. Endpoint quote/submit/status ที่ต้องเพิ่มใน milestone billing ให้ design จาก native task path เดิมและตรวจ auth/ownership; อย่าเพิ่ม microservice.

| Huobao provider | Gateway source ที่พบ | เปลี่ยนเฉพาะ managed config |
|---|---|---|
| Aliyun Wan | `plugins/tasks/alibaba/plugin.js` native POST `/ali/api/v1/services/aigc/video-generation/video-synthesis`, GET `/ali/api/v1/tasks/:task_id` | gateway base `/ali` แทน Firemux `/qwen`; request/response adapter เดิม reuse หลัง contract test |
| Volcengine Seedance | `plugins/tasks/doubao/plugin.js` POST/GET `/doubao/api/v3/contents/generations/tasks` | gateway base `/doubao` แทน Firemux `/volcengine`; ไม่เพิ่ม adapter ถ้าของเดิมรองรับ |
| MiniMax H3 | `plugins/tasks/hailuo/plugin.js` มี OpenAI video/Responses และ H3 upstream support แต่ไม่พบ native route meta | เสนอใช้ centralized `/v1/videos` เฉพาะ managed H3 หรือเพิ่ม native compatibility ใน plugin หลังตรวจ route registration; ห้ามแค่เปลี่ยน base URL เป็น `/minimax` แล้วอ้างว่าใช้งานได้ |

Native gateway endpoints เป็น dynamic plugin routes: plugin มีอยู่ใน source ไม่ได้ยืนยันว่า enabled/configured ใน production. Gate release ต้องพิสูจน์ submit + poll + actual usage ทุก provider.

Text/image ที่ quick setup เดิมผูกมา: milestone แรกหยุดคัดลอก central key ลง 7 configs อัตโนมัติ. เก็บ configs เดิมและตัวเลือก direct ไว้; ถ้าจะเปิด managed text/image ผ่าน Tora ให้ใช้ billing contract เดิมของบริการนั้นและแจ้งให้ชัด ไม่ประกาศว่าฟรีเพราะ video policy และไม่เก็บค่าข้อความ/ภาพซ้ำเป็น video fee.

## แผนทำให้ใช้งานได้ครบขั้นตอน

ลำดับ dependency: `M0 → M1 → M2 → M3 → M4`. M0/M1 ทำต่อได้ด้วย local fixtures แม้ production ยังติดต่อไม่ได้; การเปิดใช้งานจริงต้องผ่าน M4. ทุก milestone ส่งงาน Dev แบบ bounded ให้ Antigravity และเก็บ diff/ผลตรวจ ก่อนส่ง QA แยก conversation. รอบเดิมยังไม่มี code delivery จึงไม่มี milestone ที่นับว่าผ่านแล้ว.

| ขั้น | งานและผลส่งมอบ | เกณฑ์ผ่าน / เงื่อนไขทำต่อ |
|---|---|---|
| M0: ยืนยัน contract | บันทึก API origin ต่อ environment, token auth, หน่วย quota, provider route และ submit/poll/output facts. เลือก 1 โมเดลแรก; Wan เป็นตัวเลือกแรกจาก native route ที่พบ แต่ต้องตรวจ enabled channel และ actual usage. ทำ fixture success/fail/timeout ให้ครบ | local contract มีหลักฐาน source และ fixture; staging ต้องยืนยัน route/channel/ราคา แยกจาก production ที่ยังไม่ยืนยัน. ถ้าโมเดลใดพิสูจน์ไม่ได้ให้พักโมเดลนั้น ไม่เปลี่ยน key แล้วเดา endpoint |
| M1: เชื่อม key และดูเครดิต | credits endpoint ฝั่ง New-API; ช่อง Tora API Key แทน Firemux card; backend เก็บ key, UI รับ masked state. ปุ่มเชื่อม/รีเฟรช/ยกเลิกเชื่อม; แสดง available/reserved และเหตุผลที่ใช้ไม่ได้ | missing/invalid/revoked/expired/zero/limited/unlimited + wallet ผ่าน. ใช้ key คนละบัญชีไม่เห็นข้อมูลเกินสิทธิ์. Direct key/Flow ใช้ได้แม้ไม่มี Tora key. ยังไม่เปิด managed generation |
| M2: หักเฉพาะสำเร็จ | ต่อ lifecycle เดิมด้วย Huobao policy ที่ฝั่ง server กำหนด: quote → reserve wallet/token → submit/poll → ตรวจ output → settle actual ครั้งเดียว หรือ release เมื่อยืนยัน failure. บันทึก snapshot/idempotency/recovery | concurrency จองเกินยอดไม่ได้; submit ซ้ำไม่ส่ง provider ซ้ำ; failure ใช้จริง 0; success ใช้ output seconds × model/resolution rate; replay/restart ไม่หัก/คืนซ้ำ. ไม่เปลี่ยน billing ลูกค้าอื่น |
| M3: สร้างวิดีโอใน Huobao | config managed ที่แยกจาก direct; adapter หนึ่งโมเดลแรก; ส่งงานด้วย key กลาง, เก็บ central task ID, poll, ดาวน์โหลดเข้า workflow เดิม, refresh เครดิต. Recovery หลัง restart และ retry ดาวน์โหลดงานเดิม | ตั้ง key → เห็นยอด → สร้าง → รอ → ดูวิดีโอ → ยอดเปลี่ยนตามผลสำเร็จ ได้ครบ. Download error ไม่ submit ใหม่/หักซ้ำ. ต่อ M2 แล้วจึงเปิดปุ่มสร้าง managed |
| M4: ยืนยันพร้อมใช้ | QA อิสระ local/integration แล้วทดสอบ staging ด้วย channel จริงหนึ่งโมเดล. ส่ง task ID, ledger ก่อน/หลัง, media duration/resolution, ผล failure/retry และ direct regression | ผ่าน acceptance ทุกข้อสำหรับโมเดลที่เปิดจริง. ราคาและ environment ที่ใช้ทดสอบชัดเจน; NOT RUN ไม่ถือว่าผ่าน. Production rollout เป็นงานถัดไปเมื่อ staging ผ่านและมี config พร้อม |

หลังวงจรแรกผ่าน จึงเพิ่ม Seedance/H3 ทีละตัวด้วย contract + actual usage + lifecycle tests เดิม. เป้าหมายไม่ใช่ทำช่อง key เสร็จแล้วเรียกว่าจบ: ต้องมีวิดีโอสำเร็จจริงและหลักฐานยอดหักก่อนรับงานหลัก.

### Contract ขั้นต่ำที่ทีมต้องตกลงก่อน M2

- `GET /v1/huobao/credits` เป็น custom endpoint ที่เสนอเพิ่ม; คืนสถานะ key, wallet available, token cap, ยอดใช้ได้, reservation ของ scope ที่อ่านได้ และ quota conversion. ห้ามเอา reserved ไปหักจาก wallet_available อีกครั้งถ้า helper หักไว้แล้ว; ตรวจนิยามหน่วยก่อนทำ UI.
- Reuse task routes/auth/plugin เดิมที่รองรับได้; ระบุ quote/submit/status contract ของ managed video ใน M0/M2 ก่อนเขียน adapter. Task status ต้องบอก generation state, billing state, actual usage, charged quota และ result ที่เจ้าของเข้าถึงได้. Endpoint ออก key บน Tora reuse ของเดิม.
- Request หนึ่งงานมี durable idempotency key และ payload fingerprint. Request ID เดิม + payload เดิมคืนงานเดิม; payload เปลี่ยน reject. ถ้า submit upstream timeout ให้ reconcile จากหลักฐานเดิม; หาก provider ไม่มี idempotency/recovery ให้ขึ้นสถานะไม่แน่นอน ห้าม auto-resubmit.
- สำเร็จของ provider แต่ usage/settlement ยังไม่ผ่านเป็น `usage_pending`/`billing_pending` ไม่ประกาศว่าคิดเงินสำเร็จแล้ว. Actual quota มากกว่าวงเงินจองเป็น exception ที่ต้อง reconcile ตาม policy โดยไม่ส่ง render ซ้ำ; ระยะแรกรับเฉพาะ duration ที่มี upper bound พิสูจน์ได้.
- Key ถูก revoke ระหว่างงาน: ปิด submit ใหม่ทันที แต่งานและ hold เดิมยังผูกบัญชีเดิมให้ server settle/release; การอ่าน task ต้องมี credential ปัจจุบันที่ผ่าน ownership. Huobao เปลี่ยน key ต้องไม่ทำให้ task เดิมกลายเป็นของบัญชีใหม่.

### เส้นทางที่ผู้ใช้จะเห็นเมื่อจบ M4

1. ออก API key และเติมเครดิตบน Tora ด้วยหน้าที่มีอยู่แล้ว.
2. วาง key ใน Settings ของ Huobao → เชื่อม → เห็นยอดใช้ได้จากระบบกลาง. ไม่มี key/เครดิต ใช้งาน Tora ไม่ได้ แต่เลือก direct provider เดิมได้.
3. เลือกโมเดล/ความละเอียดที่เปิดรองรับ → ส่ง prompt และความยาว → backend กลางตรวจราคา/สิทธิ์และจองวงเงิน. UI แสดงว่าจองอยู่ แยกจากใช้จริง.
4. Huobao แสดงงานกำลังสร้างพร้อม central task ID; ปิด/เปิดแอปแล้วติดตามงานเดิมต่อ.
5. สำเร็จพร้อม output ที่ตรวจได้ → กลางหักตามวินาที/โมเดล/ความละเอียดครั้งเดียว → คืนส่วนที่จองเกิน → Huobao แสดงคลิปและยอดล่าสุด.
6. งานล้มเหลวที่ยืนยันแล้ว → คืนวงเงินทั้งหมด ยอดใช้จริง 0. ถ้าแค่เครือข่ายหลุดให้ติดตามงานเดิม; ถ้าไฟล์โหลดไม่ผ่านให้กดโหลดใหม่จากงานเดิม.

### ตัวอย่างหลักฐาน acceptance โดยไม่ตั้งราคาสมมุติเป็นราคา live

Fixture ใช้ `W` = wallet ก่อนงาน, `H` = วงเงินจอง, `R(model,resolution)` = rate ที่ fixture กำหนด และ quota rounding กลาง. หลัง reserve: available = W−H และ used ของงาน = 0; สำเร็จ 7.5s: used = round(7.5×R), available = W−used เมื่อไม่มีงานอื่น; failure: available กลับ W, used = 0. Token cap ต้องถูกตรวจและปรับสอดคล้องกัน. บันทึก ledger ด้วย job ID เพื่อไม่ตีความยอดบัญชีรวมผิดเมื่อมีงานพร้อมกัน.

ทดสอบชุดเดียวนี้ทั้ง duplicate submit, poll/webhook พร้อมกัน, restart ก่อน/หลัง provider success, missing actual usage, partial batch และราคาเปลี่ยนกลางงาน. ชุด local ไม่เรียก paid provider; real provider เป็นหลักฐานอีกชุดที่ต้องระบุบัญชีทดสอบและ config ชัด.

## งานที่พักไว้และเงื่อนไขกลับมาทำ

| งาน | เหตุผลที่พัก | กลับมาทำเมื่อ |
|---|---|---|
| Colab/Google Drive/H3 local render | เป็นส่วนขยาย ไม่จำเป็นต่อ key/เครดิต/วิดีโอผ่าน gateway และยังไม่ผ่าน OAuth/hardware/render | งานหลัก M4 ผ่าน แล้วพิสูจน์บัญชี/runtime และต้นทุนแยก |
| เปิดทุกโมเดลพร้อมกัน | native H3 route และ actual duration บาง provider ยังไม่ยืนยัน | โมเดลนั้นผ่าน route/price/usage/settlement และ real channel test; ไม่ปิดงานโมเดลแรกที่ผ่านแล้ว |
| subscription รวม wallet, managed text/image, batch API ใหม่ | เพิ่ม billing contract นอกขั้นต่ำที่ตกลง | มี requirement และ contract แยก; direct workflow เดิมยังคงใช้ได้ |
| production rollout/แก้ live ราคา | ยังไม่ยืนยัน API origin/TLS/channels/ราคา และยังไม่มี implementation | staging ผ่าน มีราคาจริงและ config ที่ตรวจแล้ว พร้อม review rollout |
| Antigravity Dev รอบเดิม | headless command ถูกปฏิเสธ/รอบอ่านไฟล์ timeout; final ยืนยัน changed files [] | ใช้ช่องทาง Antigravity ที่ทำ scoped file edits และ validation ได้ตามสิทธิ์ที่อนุญาต. ไม่ bypass permission และไม่วนส่งรอบเดิมโดยไม่มีเงื่อนไขเปลี่ยน |

งาน reserve/settle/recovery **พักตัดออกไม่ได้** เพราะเป็น requirement หลัก; ทำเป็น milestone เล็กและทดสอบด้วย fixture ได้ก่อนมี production. ถ้าติดจุดนี้คง managed generation ปิดไว้ และรายงาน blocker ตามจริง.

## ไฟล์ที่ต้องครอบคลุม

- Huobao: `frontend/app/pages/settings.vue`, `frontend/app/composables/useApi.ts`, locales th/en/zh/ja/ko และ tours ที่อ้าง Huobao key; `backend/src/routes/settings.ts`/central connection route, `index.ts`, `services/ai.ts`, `generation.ts`, adapter registry/types เฉพาะที่จำเป็น, schema + SQLite migrations และ MySQL compatibility path ถ้าเพิ่ม field
- Huobao caller tests: `frontend/tests/official-provider-settings.test.mjs`, `model-selection-structure.test.mjs`, `backend/tests/official-provider-adapters.test.mjs`, `aliyun-wan3-video.test.ts`, generation/recovery cases; ห้ามแก้ assertion เพื่อทำให้ผลผ่านโดยลบ requirement
- New-API: router/middleware auth, `controller/token.go` หรือ central credits controller ใหม่, task submit/billing/polling, wallet/token models และ migration เฉพาะจำเป็น, usage facts plugins แบบ scoped, canonical quota pricing/conversion, docs contract และ targeted tests
- Configuration/fixtures: central base URL แยก environment; pricing/plugin/channel local fixtures ไม่มี production secrets; feature ไม่เปิดเส้นทางที่ยังไม่ผ่าน settlement

## Acceptance และหลักฐาน

1. ไม่มี Tora key หรือ key ไม่ผ่าน: managed ใช้ไม่ได้ เครดิตไม่ถูกสร้างเอง; direct key/Flow เดิมยังใช้ได้
2. unlimited token + wallet 0 ใช้ managed video ไม่ได้; limited token แสดง/จองไม่เกิน wallet/token จริง
3. successful 7.5s ที่ resolution A ใช้ configured rate A และ quota rule กลาง; unsuccessful 0; เปลี่ยน rate หลัง submit ไม่เปลี่ยน snapshot งานเดิม
4. duplicate submit/poll/webhook/restart ได้ผลเดิมและไม่หัก/คืนซ้ำ; concurrent requests จองเกินยอดไม่ได้
5. provider success แต่ local download fail retry task เดิม; timeout ยัง reconcile; ห้าม startup เปลี่ยน managed processing เป็น failed แบบเดิม
6. reference input seconds ไม่ปนกับ output fee; resolution downgrade และ malformed/missing actual usage ถูกทดสอบ
7. key/log/PII isolation และ cross-account task read/settle/revoke cases ผ่าน; client ปลอม success/amount/policy ไม่ได้
8. migration reversible/non-destructive; focused regressions ของ direct providers และ existing New-API billing ผ่าน

Dev กับ QA คนละ Antigravity conversation; QA แต่ละรอบไม่เกิน 5 นาที. เริ่มด้วย focused tests ของทั้งสอง repo แล้ว broaden เมื่อจำเป็น. ใช้ `rtk` ทุก shell command; ห้าม run tests ที่ต่อ DB production. บันทึก exact command/exit/count และแยก UNIT/LOCAL INTEGRATION/REAL PROVIDER/NOT RUN. Codex ตรวจ diff และหลักฐานก่อนรับงาน.

## สิ่งที่ยังไม่ยืนยัน

Colab บัญชีของระบบสำหรับ H3 render เป็นส่วนขยายที่พักไว้ตามลำดับงานหลักล่าสุด. แผนเดิมอยู่ใน [COLAB_MINIMAX_H3_PLAN_TH.md](COLAB_MINIMAX_H3_PLAN_TH.md), วิธี login อยู่ใน [COLAB_LOGIN_TH.md](COLAB_LOGIN_TH.md). หากกลับมาทำต้อง reuse M2 settlement ที่ตรวจผลจาก worker กลาง ไม่เชื่อ client. ไม่มี credential จากแชตอยู่ในเอกสารเหล่านี้.

- production API origin/redirect และช่องโมเดลที่เปิดจริง: ติด TLS/network ตอนตรวจ; ไม่มี live token ถูกนำมาใช้
- ราคา model/resolution ของ Huobao: ยังไม่กำหนด/ไม่แก้ราคา live
- managed text/image ใน replacement card: ไม่รวมเปิดใช้งานใน M1; ห้ามลบ configs ของผู้ใช้หรือเปลี่ยนให้คิดเงินฟรี
- เอกสารเป็นแผน ยังไม่ได้ทดสอบเรียก provider หรือ deployment จริง
