---
name: prop-prompt
description: ข้อกำหนดพร้อมท์อุปกรณ์สุดท้าย — ภาพนิ่งสินค้าชิ้นเดียวบนพื้นหลังสีขาว มุมมองการถ่ายภาพสินค้ามาตรฐาน: สัดส่วนแม่นยำ ขอบสมบูรณ์ พื้นหลังไม่มีเนื้อหาเรื่องราว
---

# พร้อมท์อุปกรณ์สุดท้าย (สินค้าเดี่ยวพื้นหลังขาว · ถ่ายภาพสินค้ามาตรฐาน)

ภาพที่สร้างขึ้นคือภาพสินค้าพื้นหลังขาว: **ใช้มุมมองการถ่ายภาพสินค้ามาตรฐาน** เฟรมมีเฉพาะตัวอุปกรณ์เท่านั้น โดดเดี่ยวอยู่บนพื้นหลังสีขาวล้วน **ไม่มีองค์ประกอบอื่นเจือปน** — ไม่มีวัตถุอื่น ไม่มีผู้คน ไม่มีสภาพแวดล้อมฉาก ไม่มีมือจับ

ข้อกำหนดเข้มงวด 3 ประการ:
1. **สัดส่วนที่แม่นยำของทุกส่วนของสิ่งของ** — ไม่มีการขยายเกินจริง ไม่บิดเบี้ยว
2. **ขอบภาพสมบูรณ์** — อุปกรณ์อยู่ในเฟรมอย่างสมบูรณ์ มีขอบว่างรอบด้าน ไม่มีส่วนใดถูกตัดขอบ
3. **พื้นหลังไม่มีเนื้อหาการเล่าเรื่อง** — พื้นหลังสีขาวล้วนเป็นเพียงฉากหลัง ไม่มีความรู้สึกของสถานที่ ไม่บอกใบ้พล็อตเรื่อง

## โครงสร้างผลลัพธ์

```
Single-item product shot, standard product-photography viewpoint,
[ชื่ออุปกรณ์ + วัสดุ/สี/รูปทรง/ขนาด + ร่องรอยความเก่าและความเสียหาย];
accurate proportions of all parts, placed in isolation on a pure white background,
centered and fully in frame, edges complete with no cropping;
background clean and carrying no narrative content, no other objects, no people, no scene;
soft even studio light, faint shadows, high detail
```

## ข้อห้าม

- มือจับ คน วัตถุอื่น หรือสภาพแวดล้อมฉากในเฟรม
- กล่องบรรจุภัณฑ์ ฐานวาง ขาตั้ง (เว้นแต่เป็นส่วนหนึ่งของตัวอุปกรณ์เอง)
- ข้อความ ลายน้ำ ลายเซ็น
- แสงไฟสี แสงสะท้อนจากสิ่งแวดล้อม
- เปอร์สเปกทีฟที่ผิดเพี้ยน การบิดเบี้ยว ขอบถูกตัด

## Image-generation reliability / ความถูกต้องก่อนส่งสร้างภาพ

- The asset specification has higher priority than generic project style. Use project style for rendering/materials/colors, never to replace the required layout, white background, neutral studio light, or empty-environment composition.
- Put layout and subject constraints FIRST, then identity/period/material details. End with the core background, consistency and no-text constraints again. Write a concise coherent prompt without omitting identifying details.
- Do not append Midjourney/CLI switches such as `--ar`, `--v`, `--style`, or model names. Aspect ratio and model are separate API parameters.
- Do not add decorative headings, numbered labels, visible names, subtitles, borders or watermarks to the generated image.
- Character: exactly one identity repeated across the face close-up and three full-body front/side/back views, not a group of different people. Match wardrobe in every view; keep hands empty and any required accessories worn/secured, not held in an action pose. Do not replace the reference sheet with a half-body poster.
- Scene: ignore portrait/skin/beauty/hair terms in generic style; use a single empty wide establishing view, with readable foreground/midground/background and the scene's own time-of-day lighting. No humans, human shadows or reflections. Outdoor settings must not invent walls or doors that do not exist.
- Prop: one complete isolated object on pure white; no human hands, extra products or environment. Material and wear must match the story period.
- Before saving, verify that the selected asset ID and all appearance/wardrobe/material facts come from the read tool. Do not invent celebrity likenesses, beauty transformations or modern items absent from the source.
