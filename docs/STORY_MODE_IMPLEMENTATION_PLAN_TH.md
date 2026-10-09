# แผน Story Mode: ทำ Huobao ให้ใช้ง่ายตั้งแต่ไอเดียถึงวิดีโอ

วันที่: 10 ตุลาคม 2026 (Asia/Bangkok)
สถานะ: แผนจากหน้า localhost/MaxPlus และ source ที่ตรวจ; ยังไม่มี implementation หรือ live generation test

## ผลที่ผู้ใช้ต้องได้

ผู้ใช้ใส่ไอเดีย เลือกความยาวและสไตล์ → AI วางแผนให้ → ดูช็อตแบบการ์ดและแก้ได้ → สั่งสร้างทั้งเรื่อง → ดู/ดาวน์โหลดวิดีโอ. รายละเอียด prompt, reference, provider และการประกอบคลิปอยู่ในการตั้งค่าขั้นสูง. หน้า studio เดิมยังเปิดแก้รายละเอียดได้.

ใช้ฐาน Huobao เดิมและ Mastra Agent ที่ติดตั้งอยู่ ไม่เอา Micro-Drama Generator ทั้งระบบมาคั่น. เก็บระบบ Tora key/เครดิตตาม [แผน Huobao–New-API](HUOBAO_NEW_API_INTEGRATION_PLAN_TH.md): กลางเป็นผู้ตรวจสิทธิ์/จอง/หักเครดิตวิดีโอจริงตามวินาทีสำเร็จ แยกโมเดลและความละเอียด. Story Mode ไม่สร้าง wallet หรือหักเงินเอง.

## ขอบเขตรอบแรกที่จบครบได้

- หนึ่งเรื่อง หนึ่งตอน เริ่มทดสอบ 3 ช็อต เป้าหมายประมาณ 24–30 วินาที. ความยาวช็อตต้องเป็นค่าที่โมเดลที่เปิดรองรับจริง; แจ้งความยาวแผนที่ทำได้ก่อนสร้าง ไม่รับประกัน exact target โดยข้ามข้อจำกัด provider.
- หนึ่งโมเดลวิดีโอที่ผ่าน integration และ default image/text config ที่ใช้ได้จริง. เลือกค่าเริ่มต้นให้ผู้ใช้ ไม่เปิดรายชื่อโมเดลที่ยังทดสอบไม่ครบ.
- มีทั้งสร้างทั้งตอนและสร้างใหม่เฉพาะช็อต; ตรวจสถานะก่อนส่งงานซ้ำ. ปุ่มลองใหม่ต้องแยกจากการตั้งใจสร้างเวอร์ชันใหม่ที่มีค่าใช้จ่ายใหม่.
- ใช้ภาพอ้างอิงตัวละคร/ฉากและวิดีโอพร้อมเสียงที่ provider รองรับ หรือส่งออกแบบไม่มีเสียงตามที่ UI ระบุ. เสียงบรรยายแยก/TTS เป็นขั้นถัดไป ไม่แสดงว่ามีแล้ว.
- เขียนบทเป็นภาษาไทยได้; prompt ส่ง provider ตาม config/ภาษาที่รองรับ. การล็อกข้อมูลช่วยรักษาความต่อเนื่อง แต่ไม่รับประกันโมเดลวาดหน้าตาเหมือนเดิมทุกครั้ง.

## ใช้อะไรเดิม เพิ่มอะไร

| ส่วน | ของเดิมที่นำมาใช้ | เพิ่ม/ปรับเท่าที่จำเป็น |
|---|---|---|
| ข้อมูลโปรเจกต์ | dramas, episodes, characters, scenes, props, storyboards และลิงก์แอสเซท | story brief ใน namespace ของ dramas.metadata; ไม่สร้างข้อมูลตัวละคร/ฉากซ้ำอีกชุด |
| AI คิดบทและช็อต | agents/index.ts, script/extract/storyboard tools, request context | planner ส่ง structured draft ที่ตรวจด้วย Zod ก่อนบันทึก; ส่งบริบทเรื่องและข้อจำกัดโมเดลให้ Agent |
| สร้างภาพ/วิดีโอ | generation.ts, adapter registry, sysTask, prompt/reference helpers | ตัวควบคุมสั่งงานเดิมด้วย config ที่ล็อกไว้กับ run และติดตาม child task IDs |
| รวมผลงาน | ffmpeg-merge.ts, merge routes, videoMerges | ส่งออกเมื่อช็อตที่ต้องใช้ครบ ไม่รวมบางช็อตเงียบ ๆ แล้วประกาศเรื่องสมบูรณ์ |
| UI | drama/episode views, API composables, task polling, locales | หน้า Story Mode ที่อ่านข้อมูลเดียวกัน และลิงก์เปิด studio เดิม |
| เครดิต | New-API token/wallet/task lifecycle ตามแผนหลัก | แสดง estimate/reservation/actual ของงาน ไม่ใช้การปิดปุ่ม frontend แทน server auth |

## หน้าที่ผู้ใช้เห็น

1. **สร้างเรื่อง**: ไอเดีย, ความยาว, สไตล์, สัดส่วนภาพ; ชื่อเรื่องให้ AI ช่วยตั้งได้. ภาษาไทยเป็นค่าเริ่มต้นตามการตั้งค่าเนื้อหา.
2. **ดูแผน**: เรื่องย่อ ตัวละคร และการ์ดช็อต แสดงภาพที่จะเกิดขึ้นและความยาว. ปุ่ม “ให้ AI วางแผน”, “แก้แผน”, “สร้างทั้งเรื่อง”. ไม่ render ทันทีเมื่อเพียงแก้ไอเดีย.
3. **กำลังสร้าง**: แสดง เขียนบท → เตรียมภาพ → สร้างคลิป → รวมวิดีโอ พร้อมช็อตที่สำเร็จ/ติดปัญหา. ปุ่มหยุดส่งงานที่ยังไม่เริ่ม; ไม่อ้างว่ายกเลิกงาน upstream ที่กำลังทำได้ถ้า API ไม่มี cancel.
4. **ผลงาน**: ดูวิดีโอ ดาวน์โหลด ดูยอดใช้จริง และเปิดช็อตที่ต้องการแก้. สร้างใหม่เฉพาะส่วนที่เลือก; ดาวน์โหลดใหม่ไม่มี video fee เพิ่ม.

แสดงค่าใช้จ่ายของแต่ละขั้นที่มีจริงก่อนกดบริการเสียเงิน. การวางแผนด้วย LLM อาจมีค่าใช้จ่าย แม้ยังไม่ render; ห้ามใช้ข้อความ “หักเฉพาะวิดีโอสำเร็จ” ไปทำให้ผู้ใช้เข้าใจว่าทุกบริการฟรี.

## ข้อมูลเรื่องกลางที่ AI ต้องได้

ใน `dramas.metadata.storyMode` เก็บ brief/version, tone, targetSeconds, contentLanguage, visualStyle, continuityRules และ IDs ของตัวละคร/ฉาก/สิ่งของที่ใช้งาน. รูปลักษณ์ รูปอ้างอิง และข้อมูลแอสเซทจริงอ่านจากตารางเดิมตาม IDs. Merge namespace โดยรักษา metadata อื่น; ข้อมูลเก่าหรือ JSON ผิดต้องมีทางอ่านแบบปลอดภัยและไม่ถูกเขียนทับเงียบ ๆ.

ทุกขั้นคิด prompt ใช้ brief + ข้อมูลตัวละคร/ฉากที่เกี่ยวข้อง + กฎที่ล็อก + แผนช็อต + ข้อจำกัด provider. ให้ AI เสนอการเปลี่ยนกฎได้ แต่ไม่ overwrite กฎที่ผู้ใช้ล็อกเอง. ระยะแรกไม่ทำ season/world graph หรือ memory framework เพิ่ม.

`storyboards.duration` เป็นวินาที แต่ `save_storyboards` ปัจจุบันอัปเดต `episodes.duration` ด้วย ceil(totalSeconds/60). Story Mode ใช้ targetSeconds และผลรวมช็อตเป็นวินาทีชัดเจน; ตรวจ callers เดิมก่อนแก้หน่วย ไม่ใช้ตัวเลขจากหน้ารายการตอนเป็น actual billable duration.

## ตัวควบคุมงานที่ต้องเพิ่ม

ตัวควบคุมเป็นลำดับงานที่ backend กำหนด; AI เสนอบท/แผนภายใน schema ไม่เลือกยอดเงิน ปิด billing gate หรือเรียก tool ลบข้อมูลตามข้อความใน prompt.

```text
draft → planning → plan_ready → preparing_assets → generating_clips
      → merging → completed
           ↘ paused / needs_attention / failed
```

- ใช้ sysTask สำหรับ image/video และ videoMerges สำหรับ export ต่อไป. เพิ่ม durable run record ขนาดเล็กสำหรับ parent workflow เพราะ sysTask เดิมออกแบบ image/video; อย่า reuse type ใหม่โดยปล่อย startup cleanup ทำ run เสียหาย.
- Run ผูก drama/episode, plan revision, config snapshot, idempotency key, phase และ child task IDs; เริ่มจาก index ที่กัน active run ซ้อนของตอนเดียวและ state transition ที่ recover ได้. Migration ต้องไม่ทำลายข้อมูลเก่า/รองรับ DB path ที่โปรเจกต์ใช้.
- รอผลบันทึกแต่ละขั้นก่อนเริ่มขั้นถัดไป. `doRewrite()` เดิมเรียก saveRaw() โดยไม่ await; เส้นทางอัตโนมัติต้องบันทึกเสร็จแล้วจึงเรียก Agent ไม่ copy race นี้มา.
- Planner รอบแรกสร้าง draft โดยไม่มี tool เขียนทับโปรเจกต์; ตรวจจำนวนช็อต/ความยาว/references/config และให้ผู้ใช้ดูแผนก่อน publish. ใช้ draft ID/revision กัน publish ซ้ำ.
- `save_storyboards` เดิมล้างรายการเก่าเมื่อ replace_existing. แก้แผนใน Story Mode ต้องตรวจ revision และรักษาสื่อ/ID ของช็อตเดิม; ถ้ามีงาน active ให้รอก่อนเปลี่ยนแผน. ไม่ปล่อย Agent ลบทุกช็อตที่มีงานหรือไฟล์อยู่แล้ว.
- Run สร้างภาพอ้างอิงที่ยังขาด → เตรียม frame ที่โมเดลต้องใช้ → สร้างคลิป → รวมตามลำดับ. จำกัด concurrency ตาม provider/config; ใช้ค่าที่มีอยู่ก่อนเพิ่ม setting ใหม่.
- การทำงานต่อหลัง restart ต้องอ่าน run + child tasks + central task status. Timeout เป็นสถานะไม่แน่นอน; อย่าเริ่ม provider job ใหม่จนพิสูจน์งานเดิมได้. คลิปที่สำเร็จแล้วไม่ต้องสร้างซ้ำเพราะ merge ล้มเหลว.
- Config ที่ snapshot ไว้ถูกปิด/ลบต้องขึ้น needs_attention. `generateImage/Video` เดิมอาจ fallback ไป active config เมื่อ config ID หาไม่พบ; managed run ต้องไม่ fallback เงียบไป provider key อื่นหรือย้ายบัญชีเครดิต.
- งานที่ผลสำเร็จแต่ billing/usage ยัง pending รอผลกลางตาม policy; การรวมคลิปหรือดาวน์โหลดไม่หัก video fee รอบใหม่. เครดิตวิดีโอนับแต่ละคลิปสำเร็จ ไม่รอให้ทั้งเรื่องรวมเสร็จจึงนับ และไม่คืนค่าคลิปสำเร็จเพราะอีกช็อตล้มเหลว.

## ลำดับทำงานและหลักฐานผ่าน

| ขั้น | งาน | หลักฐานที่ต้องได้ |
|---|---|---|
| S1: หน้าใช้ง่าย | Story Mode อ่านโปรเจกต์เดิม แสดง brief/ช็อต/progress/ผลลัพธ์ และลิงก์ studio. Local fixture ใช้ทดสอบหน้าจอ ไม่สร้างสื่อจริง | เปิดเรื่องเดิมแล้วเห็นข้อมูลตรง studio; navigation/edit path ไม่ทำไฟล์/ช็อตเดิมหาย; empty/error/loading states ใช้ได้ |
| S2: AI วางแผน | brief schema + context builder + planner แบบ draft + validated publish สำหรับหนึ่งตอน | ไอเดียภาษาไทยให้แผน 3 ช็อตที่เข้ากับโมเดล; malformed response reject; references อยู่ในเรื่อง; เปลี่ยน brief แล้วไม่ overwrite สื่อเดิม; ระบุ LLM real/fixture แยก |
| S3: สร้างทั้งตอน | durable run + เรียก image/video/merge เดิม + progress/recovery. เริ่ม local fixtures ก่อน paid path | ปุ่มหนึ่งเริ่ม run เดียว; duplicate/restart ไม่สร้างซ้ำ; ล้มเหลวหนึ่งช็อตคงช็อตสำเร็จ; กดทำต่อทำเฉพาะที่ขาด; รวมเมื่อครบ |
| S4: ต่อ Tora ครบ | เชื่อม M1–M3 จากแผนหลัก; locked configs/key/credits + actual successful-video billing. ตรวจ text/image channel contracts แยกเมื่อจะให้ใช้ key เดียวครบ | Tora key เดียวทำขั้นที่เปิดรองรับได้; direct configs ยังใช้ได้; invalid/empty credit gates managed; ledger ตรง actual seconds/model/resolution; partial batch/merge retry/download retry ไม่หักซ้ำ |
| S5: ทดสอบใช้งานจริง | QA browser อิสระ + staging หนึ่งโมเดลที่ผ่านครบ + video artifact และยอดก่อน/หลัง | ผู้ใช้เริ่มไอเดียจนได้คลิปหนึ่งตอนโดยไม่เปิดขั้นสูง; ดู/ดาวน์โหลดได้; ระบุเสียงที่รองรับจริงและ NOT RUN ของส่วนอื่น |

S1/S2 และ fixture ของ S3 ทำได้ก่อน Tora integration เสร็จ; เปิด paid managed creation ต้องผ่าน M2/M3 ตามแผนหลัก. งาน Story Mode ไม่เลื่อนการทำ Tora key/credit หลักออกไปเพื่อสร้างส่วนเสริมใหญ่.

วิดีโอคิดตาม output seconds ที่สำเร็จตามแผนหลัก. Text/image ถ้าส่งผ่าน Tora ให้ใช้ billing contract ที่ตรวจแล้วของบริการนั้นและแสดงให้ผู้ใช้ทราบ; ห้ามเพิ่มต้นทุนนี้เข้า video fee โดยเงียบ ๆ หรือเรียกว่าฟรี. ถ้ายังไม่เปิด managed text/image ใช้ direct configs เดิมอย่างชัดเจนและแสดงว่ายังต้องตั้งค่า ไม่ประกาศว่า key เดียวทำทุกอย่างครบแล้ว. TTS ไม่รวมรอบแรก.

## ไฟล์และ regression ที่ต้องครอบคลุม

- Frontend: route/view Story Mode ตาม router จริง, drama/detail.vue และ episode.vue เฉพาะลิงก์/จุดแชร์ที่จำเป็น, composables/useApi.ts และ useAgent.ts, locale keys/tours ที่เปลี่ยน. คง studio และ direct config selection.
- Backend: routes/dramas.ts, episodes.ts, storyboards.ts, agent.ts, context/tools ที่ planner ใช้; ตัวควบคุม run ใหม่เท่าที่จำเป็น; index.ts startup recovery; schema/SQLite init/migration/MySQL compatibility ที่เกี่ยวข้อง.
- Services: generation.ts config selection/idempotency/child task recovery, existing asset/reference/prompt helpers, ffmpeg-merge.ts/merge routes. ไม่ copy adapter/provider code ไปอีกชุด.
- Tests/fixtures: planner schema + preserved metadata, await/save-before-agent, cross-drama refs, run duplicate/restart/partial failure/config removed, protected plan publish, complete merge and actual ledger. รัน regressions ของ model selection/direct generation, asset prompts/reference และ merge ที่ได้รับผล; ไม่ถือ structure-only test เป็นหลักฐานว่ารัน pipeline ได้.
- QA: browser evidence เป็นคนละชุดจาก unit/local fixtures; real LLM/provider/staging ต้องมี task IDs/ไฟล์จริง/commands. ราคาและ secrets ไม่อยู่ใน fixtures/logs. งาน auth/billing ฝั่ง New-API ต้อง independent review ตามคำสั่ง repo.

## พักไว้ก่อน

TTS/เสียงแยก, music, subtitle burn-in, หลายซีซัน/หลายตอน, recap และ continuity checker อัตโนมัติขั้นสูง, Colab/Drive, full 2K, เพิ่ม framework/workflow server อีกตัว และการ import Micro-Drama Generator ทั้งระบบ. กลับมาทำหลัง S5 ผ่าน โดยเพิ่มทีละส่วน. หากต้องการเสียงบรรยายแยกแบบ MaxPlus ต้องทำ TTS job/storage/voice selection/audio-duration/merge/credit contract ให้ครบก่อนเปิดปุ่ม.

## งานแรกสำหรับส่ง Dev

อ่านแผนนี้และแผน Tora แล้วทำ S1 เท่านั้น: หน้า Story Mode อ่านข้อมูลละคร/ตอน/ช็อตเดิม พร้อม brief form, การ์ดช็อต, progress และลิงก์กลับ studio. ใช้ local fixtures ตรวจ empty/error/completed; ยังไม่เปิดปุ่มให้สั่ง paid generation อัตโนมัติ. ส่ง diff, exact checks, screenshot และสิ่งที่ยัง NOT RUN. จากนั้นจึงส่ง S2/S3 ตาม dependency; Antigravity รอบเดิมยังไม่ส่งมอบโค้ดและไม่มีงาน Dev รอบใหม่ถูกส่งในรอบวางแผนนี้.
