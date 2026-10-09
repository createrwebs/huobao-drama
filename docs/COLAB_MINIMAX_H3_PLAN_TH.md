# Colab ของระบบ → MiniMax-H3 → Drive → Huobao

วันที่: 10 ตุลาคม 2026 (Asia/Bangkok)
สถานะ: **พักไว้** ตามเป้าหมายหลักล่าสุด; ไม่มี live OAuth/GPU/render/Drive test

ทำ [งานหลัก Tora key/เครดิต/วิดีโอสำเร็จ](HUOBAO_NEW_API_INTEGRATION_PLAN_TH.md) ให้ครบ M4 ก่อน. เอกสารนี้เก็บรายละเอียดไว้สำหรับส่วนขยาย ไม่ใช่งานที่ต้องทำก่อนเปิดใช้ Tora key ใน Huobao.

## ความต้องการที่ยืนยันจากผู้ใช้

ใช้บัญชี Google Colab **ของระบบ**. ผู้ใช้ Huobao กดปุ่มเปิด/render ส่ง prompt; ระบบกลางตรวจ Tora key และเครดิต; สำเร็จแล้วคิดตาม actual output seconds แยก model/resolution. ผลเก็บใน Google Drive ของระบบและดาวน์โหลดกลับ Huobao หรือให้ผู้ใช้ดาวน์โหลดได้. API key อื่นและ Flow เดิมไม่ถูกล็อก.

ข้อมูล credential ที่ส่งในแชตไม่บันทึกในไฟล์นี้หรือส่งให้ Antigravity. Google API key ไม่ใช่ OAuth user credential ที่ Colab CLI ต้องการ.

## ผลตรวจเอกสารต้นฉบับ

- [google-colab-cli](https://github.com/googlecolab/google-colab-cli) มี session, exec, upload/download และ Drive mount; รองรับ Linux/macOS
- [auth.py](https://github.com/googlecolab/google-colab-cli/blob/main/src/colab_cli/auth.py) และ [cli.py](https://github.com/googlecolab/google-colab-cli/blob/main/src/colab_cli/cli.py) ใช้ OAuth2 เป็น default ของ main ปัจจุบัน (README บางส่วนเขียน ADC; ระบุ `--auth oauth2` ชัดเจนเพื่อไม่พึ่ง default)
- [Authentication/Drive documentation](https://github.com/googlecolab/google-colab-cli/blob/main/docs/04_automation_and_utility.md) อธิบาย OAuth copy/paste และการอนุญาต Drive mount แยกต่างหาก
- [MiniMax-H3 official model card](https://huggingface.co/MiniMaxAI/MiniMax-H3) มี checkpoint H3-Base ที่รันเองได้; Full 2K workflow ยังพึ่ง hosted Context-IR/Regenerate API. ระยะแรกใช้ Base text-to-video/audio และ 768p ก่อน ไม่กล่าวอ้าง full 2K local
- [Diffusers H3 documentation](https://huggingface.co/docs/diffusers/main/en/api/pipelines/minimax_h3#memory) มี ModularPipeline และ offload recipes. Recipe int8 สำหรับ GPU 12–16GB ยังใช้ host RAM ประมาณ 75GB; runtime hardware/RAM/disk ต้องตรวจจริงก่อนโหลด weights ไม่รับรองว่า T4/free Colab ทุกเครื่องรันได้

## Architecture

```text
Huobao: เปิด Colab / Render / สถานะ / บันทึกเข้าโปรเจกต์ / Download
   ↓ Tora relay key + request ID + prompt/model/resolution/duration
New-API: auth → quote/snapshot → durable hold → render job
   ↓ job owner + validated job JSON (ไม่มี provider/Colab OAuth secret)
worker ฝั่งระบบกลาง: Colab CLI → runtime → H3-Base → MP4
   ↓ output ใน Drive แบบ private + actual media metadata
New-API: ตรวจ artifact/duration/resolution → success settlement ครั้งเดียว
   ↓ task-owned download endpoint
Huobao: ดึงวิดีโอ task เดิมกลับมา / ดาวน์โหลดใหม่ได้โดยไม่คิดเงินซ้ำ
```

Colab OAuth/refresh token และ Drive ของระบบอยู่กับ worker ที่เชื่อถือได้เท่านั้น. Huobao client ไม่ได้ credential ของ Google และไม่ส่ง `completed/amount` มาให้ backend เชื่อ. ไม่เพิ่ม BFF; ต่อเข้ากับ job/billing lifecycle กลางที่มีอยู่.

## Login runbook (ทำบนเครื่อง worker ด้วย OS user ของบริการ)

1. ใช้บัญชี Google ที่ระบบตั้งใจใช้กับ Colab และ Drive; ไม่ล็อกอินบัญชีผู้ใช้ปลายทาง
2. ติดตั้ง CLI ใน virtual environment ของ worker; ตัวอย่างคำสั่งใน `COLAB_LOGIN_TH.md`
3. รัน `colab --auth oauth2 sessions`; เปิด authorization URL ใน browser, เลือกบัญชีระบบ, ตรวจ consent, แล้ววาง code ใน terminal ของ worker ไม่ส่ง code/token เข้ามาในแชต
4. รัน sessions อีกครั้งให้ backend อ่านได้จริง. source เก็บ OAuth token ที่ `~/.config/colab-cli/token.json` ของ OS user นั้น. เลือก service user ให้ถูกและป้องกัน token file ตาม deployment secret policy
5. สำหรับ worker headless ใช้ browser บนเครื่องผู้ดูแลเปิด URL และส่ง code กลับ terminal ของ workerได้; ไม่ต้องดึง browser cookies/session keys หรือใช้ Google API key แทน login
6. `colab auth` เป็นการ authorize GCP ภายใน VM ไม่ใช่คำสั่งแรกสำหรับ CLI login. `colab drivemount -s SESSION` ต้องมี runtime และอาจต้อง consent เพิ่มก่อน mount
7. ไม่เปิด runtime ใน login check; Google compute-unit billing เป็นอีกยอดจาก Tora wallet. ต้องกำหนด GPU/compute budget ของระบบก่อน live provisioning

## MVP และ sequence

- เพิ่มในแผนหลักเป็น M5 หลัง M2 success billing พร้อม: ปุ่มเปิดหน้า Colab สำหรับผู้ดูแล, ปุ่ม Render สำหรับผู้ใช้, progress/error, ดาวน์โหลด/นำเข้า task เดิม
- เริ่มหนึ่ง job/หนึ่งคลิป/768p/Text-to-video พร้อม audio; ไม่เพิ่ม ref2va/batch/2K regeneration ก่อน baseline ผ่าน
- worker ส่ง validated JSON เป็นไฟล์; prompt เป็น data ไม่ interpolate เป็น Python/shell. ใช้ subprocess argument list ไม่ใช้ `shell=true`; ค่า session/path/job ID กำหนดจากระบบ
- preflight: มี CLI, credential/account, runtime compute units, GPU/VRAM/host RAM/free disk และ package/model revision ที่ pin แล้ว; โหลดเฉพาะ task workflow ที่จำเป็น
- reuse runtime ด้วย concurrency 1 ใน MVP; อย่าเปิด GPU ใหม่ทุกครั้งเมื่อมี session พร้อม และมี idle teardown/cancel budget guard. หากไม่มี accelerator ที่รองรับ ให้ fail ก่อน render และคืน hold
- Drive mount setup ทำโดยผู้ดูแล; output private ต่อ user/job path ไม่ส่ง shared account Drive cookies/refresh token ให้ client และไม่เปิดโฟลเดอร์ public
- render เสร็จ export video+audio, ตรวจ ffprobe/duration/resolution/file hash และ atomic output manifest. checkpoint weights ไม่ต้องเก็บลง Drive ของผลลัพธ์ผู้ใช้ทุกครั้ง
- ถ้าจำเป็นต้องเข้าถึง Drive จาก New-API ใช้สิทธิ์ของระบบที่เลือกไว้ชัด ไม่ถือว่าตัวเลือก API key ให้สิทธิ์อ่าน private Drive. MVP ให้ worker ส่งผลผ่าน authenticated job-owned upload/download flow
- billing success ต้องอาศัย artifact ที่ backendตรวจได้ + durable job ownership. worker restart/timeout ใช้ request ID เดิมเพื่อ reconcile; ไม่ render/หักซ้ำจาก timeout
- Colab/Google Drive unavailable ไม่ fallback ไป MiniMax paid API โดยอัตโนมัติ; 2K/API upstream เป็น milestone แยกที่ต้องตั้งราคา/credential ก่อน

## Acceptance

1. CLI login ใช้บัญชีระบบที่ยืนยันแล้ว; Huobao ไม่มี Google tokens และ direct providers ไม่โดน gate
2. Tora key/wallet ไม่ผ่าน → ไม่เปิด render job; GPU preflight fail → ไม่มีเครดิต used และ hold ถูก reconcile/release
3. prompt ไทย/อักขระ quote ไม่กลายเป็น code execution; metadata ของ job ตรวจที่ backend
4. render จริงได้ MP4 มี audio, actual duration/resolution, private Drive output, download/import task เดิมได้
5. reserve → actual success settlement ครั้งเดียว; Drive/local download retry ไม่เพิ่มค่า render; parallel/replay/crash ผ่าน
6. รายงานแยก mocked CLI/unit tests กับ real OAuth/runtime/render/Drive E2E; ไม่ใช้ sample video มาอ้าง H3 render สำเร็จ

## Blockers / next task

- บนเครื่องที่ตรวจยังไม่พบ `colab` หรือ `uv` ใน PATH; มี Python 3.14. ยังไม่ได้ install/login
- ต้องให้ผู้ดูแลทำ OAuth/Drive consent ด้วยบัญชีระบบบน worker และยืนยัน accelerator/RAM/disk/compute budget. Key แบบ API key ที่มีอย่างเดียวไม่ปลด blocker นี้
- M2/M3 ของแผนเครดิตยังไม่ implemented; ห้ามเปิดระบบคิดเงินจริงเพียงเพราะ Colab login ผ่าน
- Antigravity M1 ที่ลองก่อนหน้านี้ถูก command permission auto-denied; รอบ file-only timeout โดยยังไม่มี product diff ตอนตรวจ จึงยังไม่ยอมรับงาน
