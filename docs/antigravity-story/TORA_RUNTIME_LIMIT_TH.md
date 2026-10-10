# ขอบเขตการตรวจ Tora ณ รอบนี้

10 ตุลาคม 2026: ตรวจซ้ำด้วย `rtk curl -I --max-time 10 https://toraapi.com/` exit 35; แสดงรายละเอียดด้วย `rtk proxy curl -I --max-time 10 https://toraapi.com/` ได้ `LibreSSL SSL_connect: SSL_ERROR_SYSCALL in connection to toraapi.com:443`.

ยังไม่ได้รับ HTTP response จึงยืนยัน API origin/version/model/channel/ราคา production ไม่ได้. ไม่มีการ bypass TLS หรือเปลี่ยน hostname. ไม่ได้ใช้หรืออ่าน credentials และไม่สร้าง paid tasks.

ผลนี้จำกัดการทดสอบ integration จริงเท่านั้น ไม่ใช่หลักฐานว่าเขียน local integration ไม่ได้. รอบนี้ส่งมอบ S1 และ native continuity skills; M1–M3/S4 ยังไม่ถูก implement/accept. งานหลักถัดไปคือ key/credit read contract + strict token/wallet validity ใน New-API และ scoped Tora config ที่ไม่กระทบ direct providers จากนั้น durable success billing ตาม actual output seconds/model/resolution. ต้องอ่าน project brain/AGENTS ของ New-API และผ่าน independent plus adversarial review ก่อนรับ auth/billing code.

อย่าเปลี่ยนชื่อช่อง Huobao เป็น Tora หรือชี้ presets Firemux ไป Tora แล้วประกาศว่าเสร็จ: route/model contracts และ success-only ledger ยังไม่ผ่าน. ไม่มี key = ไม่มี central credit; other provider keys ใช้งานตาม workflow เดิม. Colab/Drive พักไว้ตามแผน.
