---
name: character-prompt
description: ข้อกำหนดพร้อมท์ตัวละครสุดท้าย — โคลสอัพหน้าตรง + แผ่นหมุนสามด้าน (หน้า / ข้าง 90 องศา / หลัง) เป็นหลักยึดรูปลักษณ์สำหรับการสร้างทั้งหมดในภายหลัง
---

# พร้อมท์ตัวละครสุดท้าย (ซ้าย: โคลสอัพใบหน้าตรง + ขวา: แผ่นหมุนสามด้าน)

ภาพที่สร้างขึ้นคือแผ่นอ้างอิงตัวละครที่มีองค์ประกอบตายตัว:

- **ซ้าย: โคลสอัพใบหน้าตรง** — ภาพระยะใกล้ของศีรษะและไหล่ เครื่องหน้า ทรงผม และเนื้อผิวชัดเจน เป็นหลักยึดการจดจำใบหน้า
- **ขวา: สามมุมมองเต็มตัวความสูงเท่ากันเคียงข้างกัน — หน้า, ข้าง 90 องศา, หลัง** — เต็มตัวของตัวละครเดียวกัน ความสูงเท่ากัน ศีรษะและฝ่าเท้าอยู่ในระดับเดียวกัน

**หลักการสำคัญ: ความคงที่ > ความสวยงาม** ภาพนี้เป็นหลักยึดของภาพตัวละครและวิดีโออ้างอิงทั้งหมด ต้องเป็นกลาง ชัดเจน และนำกลับมาใช้ซ้ำได้ — ไม่เน้นศิลปะของภาพเดี่ยว

## โครงสร้างผลลัพธ์

```
Character reference sheet, left side a front-face close-up, right side three equal-height full-body views
side by side showing front, 90-degree side, and back;
the close-up and the full-body views are the same character, full body in frame, neutral A-pose,
the three full-body views equal in height, side by side, tops of heads and soles of feet aligned;
[วัย + เพศ + รูปร่าง], [เครื่องหน้า], [ทรงผม], [เสื้อผ้า + เครื่องประดับ];
the face, hairstyle, and clothing of the front-face close-up and the three views are completely identical;
pure white background, soft even lighting, cinematic quality
```

## ลำดับการบรรยาย

ใส่**ลักษณะที่จดจำง่ายที่สุดไว้ก่อน** ครอบคลุมทุกองค์ประกอบของ `appearance` (รูปลักษณ์) และ `styling` (ทรงผม/เสื้อผ้า/แต่งหน้า):

1. หลักยึดตัวตน: วัยโดยประมาณ (เช่น "อายุยี่สิบต้นๆ") เพศ รูปร่าง (ส่วนสูง โครงสร้าง ท่าทางความเคยชิน)
2. เครื่องหน้า: รูปหน้า ตา จุดเด่นเฉพาะ (แผลเป็น ไฝ แว่นตา ฯลฯ)
3. ทรงผม: สี ความยาว แบบทรงผม
4. เสื้อผ้า: สไตล์ สี วัสดุ สภาพ
5. เครื่องประดับ: เขียนเฉพาะชิ้นที่โดดเด่น

แปลงนิสัยใจคอของตัวละครให้เป็นท่าทางและสีหน้าภายนอก ห้ามใส่นามธรรมโดยตรง

## ข้อห้าม

- ท่าทางผาดโผน สีหน้าเว่อร์ ถืออุปกรณ์ในมือ หรือมีคนอื่นร่วมเฟรม
- ตัวละครถูกตัดขาด (ต้องเห็นเต็มตัวตั้งแต่หัวจรดเท้า)
- ตัวอักษร ลายน้ำ ลายเซ็น
- เงาดำมืดจัด แสงไฟสี แบ็คกราวนด์มีของประดับ

## การบันทึก

เรียกใช้ `save_character_final_prompt`: ไม่ต้องใส่คำบรรยายสไตล์ภาพ — **สไตล์ภาพของโปรเจกต์จะถูกแทรกที่หน้าสุดของพร้อมท์สุดท้ายโดยอัตโนมัติ**

## Image-generation reliability / ความถูกต้องก่อนส่งสร้างภาพ

- The asset specification has higher priority than generic project style. Use project style for rendering/materials/colors, never to replace the required layout, white background, neutral studio light, or empty-environment composition.
- Put layout and subject constraints FIRST, then identity/period/material details. End with the core background, consistency and no-text constraints again. Write a concise coherent prompt without omitting identifying details.
- Do not append Midjourney/CLI switches such as `--ar`, `--v`, `--style`, or model names. Aspect ratio and model are separate API parameters.
- Do not add decorative headings, numbered labels, visible names, subtitles, borders or watermarks to the generated image.
- Character: exactly one identity repeated across the face close-up and three full-body front/side/back views, not a group of different people. Match wardrobe in every view; keep hands empty and any required accessories worn/secured, not held in an action pose. Do not replace the reference sheet with a half-body poster.
- Scene: ignore portrait/skin/beauty/hair terms in generic style; use a single empty wide establishing view, with readable foreground/midground/background and the scene's own time-of-day lighting. No humans, human shadows or reflections. Outdoor settings must not invent walls or doors that do not exist.
- Prop: one complete isolated object on pure white; no human hands, extra products or environment. Material and wear must match the story period.
- Before saving, verify that the selected asset ID and all appearance/wardrobe/material facts come from the read tool. Do not invent celebrity likenesses, beauty transformations or modern items absent from the source.
