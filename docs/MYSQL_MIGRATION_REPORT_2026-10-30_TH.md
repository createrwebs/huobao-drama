# รายงานย้ายข้อมูล SQLite ไป MySQL

วันที่ตรวจ: 30 ตุลาคม 2026  
โครงการ: `/Users/noppanan/huobao-drama`

## ผลลัพธ์

- เชื่อมต่อ MAMP MySQL 8.0.44 ที่ `127.0.0.1:8889` สำเร็จ
- สร้างฐานข้อมูล `huobao_drama` ด้วย `utf8mb4` และ InnoDB
- ย้ายข้อมูลจาก `data/huobao.sqlite3` จำนวน 20 ตาราง รวม 526 แถว
- ตรวจจำนวนแถวหลังย้ายครบตรงกับต้นทาง
- ตรวจ orphan ของ `dramas.owner_user_id` ได้ 0 รายการ
- ย้าย `users` 2 รายการ พร้อมค่า role เริ่มต้น `user`
- SQLite ต้นทางยังคงอยู่และไม่ได้ถูกแก้ไข

## ตารางที่ย้าย

`ai_service_configs`, `ai_service_providers`, `app_settings`, `assets`, `auth_sessions`, `characters`, `dramas`, `episode_characters`, `episode_props`, `episode_scenes`, `episodes`, `props`, `scenes`, `storyboard_characters`, `storyboard_props`, `storyboards`, `style_presets`, `sys_task`, `users`, `video_merges`

## คำสั่งที่ใช้

```bash
cd backend
MYSQL_HOST=127.0.0.1 MYSQL_PORT=8889 MYSQL_USER=root MYSQL_PASSWORD=root \
MYSQL_DATABASE=huobao_drama npm run migrate:sqlite-to-mysql -- --apply
```

สคริปต์อยู่ที่ [backend/scripts/migrate-sqlite-to-mysql.ts](/Users/noppanan/huobao-drama/backend/scripts/migrate-sqlite-to-mysql.ts) และมี safety gate ดังนี้:

- ไม่ทำงานจริงหากไม่มี `--apply`
- ไม่ import หากฐาน MySQL ปลายทางมีข้อมูล
- ไม่ลบหรือแก้ SQLite ต้นทาง
- ตรวจจำนวนแถวทุกตารางหลัง import
- ตรวจ orphan ของ owner หลัง import

## สิ่งที่ยังไม่สลับ

ตัวแอปยังใช้ `better-sqlite3` ที่ [backend/src/db/index.ts](/Users/noppanan/huobao-drama/backend/src/db/index.ts) อยู่ จึงยังไม่ควรตั้ง `DATABASE_URL` แล้วคาดหวังว่า runtime จะอ่าน MySQL ได้ การสลับ runtime ต้องทำเป็น milestone ถัดไป: MySQL Drizzle adapter, async app-settings, transaction/lock tests และ startup fail-closed ตามแผนใน `CHATGPT_PROMPT_VAST_RENDER_ORCHESTRATOR.md`

ข้อมูลโปรเจกต์เก่าที่ `owner_user_id` เป็น `NULL` ยังไม่ถูกผูกกับผู้ใช้ใด ต้องมี owner mapping จากเจ้าของจริงก่อนเปิด multi-user enforcement
