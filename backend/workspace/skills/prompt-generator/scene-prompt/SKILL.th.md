---
name: scene-prompt
description: ข้อกำหนดพร้อมท์ฉากสุดท้าย — ช็อตสร้างบรรยากาศมุมกว้างที่ชัดเจน: ตำแหน่งสัมพัทธ์คงที่ของฉากหน้า/ฉากกลาง/ฉากหลัง/ทางเข้าออก/พื้น/ผนัง/การจัดวางหลัก ต่อเนื่องทางพื้นที่ คงที่ นำกลับมาใช้ใหม่ได้ ไม่มีผู้คน
---

# พร้อมท์ฉากสุดท้าย (ช็อตสร้างบรรยากาศมุมกว้าง · ฉากว่างไม่มีผู้คน)

ภาพที่สร้างขึ้นคือภาพฉาก**ช็อตสร้างบรรยากาศมุมกว้างที่ชัดเจน**: ภาพวิวว่างบริสุทธิ์ของฉากที่**ไม่มีมนุษย์อย่างเด็ดขาด** แสดงตำแหน่งสัมพัทธ์ของฉากหน้า ฉากกลาง ฉากหลัง ทางเข้าออก พื้น ผนัง และการจัดวางฉากหลักอย่างครบถ้วน

ภาพนี้ทำหน้าที่เป็นหลักยึดแบ็คกราวนด์อ้างอิงสำหรับทุกช็อตในฉากนี้: ทั้งผู้ชมและโมเดลต้องเข้าใจผังพื้นที่ทั้งหมดจากภาพนี้ได้

## โครงสร้างผลลัพธ์

```
Fixed-camera wide-angle shot, a clear establishing shot, [สถานที่ + บรรยากาศยุคสมัย], [ช่วงเวลา];
three-layer composition of foreground ([องค์ประกอบฉากหน้า]), midground ([พื้นที่หลักของฉากกลาง]),
and background ([ความลึกของฉากหลัง]);
entrances/exits ([ตำแหน่งและแบบของประตู/ทางเดิน]), floor ([วัสดุและสภาพของพื้น]),
walls ([วัสดุและสีของผนัง]);
[ของประกอบฉากหลักและตำแหน่งสัมพัทธ์ที่แน่นอน];
spatial structure continuous and self-consistent;
[แหล่งกำเนิดแสง + อุณหภูมิสี + คอนทราสต์ความสว่าง], [อารมณ์];
No people in the scene, empty scene, cinematic quality
```

## ผู้คน (กฎเข้มงวด · ลำดับความสำคัญสูงสุด)

**ห้ามมีผู้คนในภาพฉากอย่างเด็ดขาด — เก็บไว้เฉพาะตัวฉากเท่านั้น**

- พร้อมท์ต้องไม่อธิบายผู้คนหรือเอ่ยถึงสิ่งใดที่เกี่ยวกับมนุษย์
- ข้อมูลผู้คนใดๆ ที่ปรากฏในคำอธิบายฉากต้องถูกละเว้นและไม่นำมาเขียนลงในพร้อมท์
- พร้อมท์ต้องลงท้ายด้วย: "No people in the scene, empty scene"

## ข้อห้าม

- ผู้คนใดๆ — **ห้ามมีผู้คนในภาพฉากอย่างเด็ดขาด**
- ตัวอักษร ลายน้ำ ลายเซ็น
- ภาพเบลอจากการเคลื่อนไหว วัตถุที่กำลังขยับ (ภาพอ้างอิงฉากต้องนิ่งและมั่นคง)

## Image-generation reliability / ความถูกต้องก่อนส่งสร้างภาพ

- The asset specification has higher priority than generic project style. Use project style for rendering/materials/colors, never to replace the required layout, white background, neutral studio light, or empty-environment composition.
- Put layout and subject constraints FIRST, then identity/period/material details. End with the core background, consistency and no-text constraints again. Write a concise coherent prompt without omitting identifying details.
- Do not append Midjourney/CLI switches such as `--ar`, `--v`, `--style`, or model names. Aspect ratio and model are separate API parameters.
- Do not add decorative headings, numbered labels, visible names, subtitles, borders or watermarks to the generated image.
- Character: exactly one identity repeated across the face close-up and three full-body front/side/back views, not a group of different people. Match wardrobe in every view; keep hands empty and any required accessories worn/secured, not held in an action pose. Do not replace the reference sheet with a half-body poster.
- Scene: ignore portrait/skin/beauty/hair terms in generic style; use a single empty wide establishing view, with readable foreground/midground/background and the scene's own time-of-day lighting. No humans, human shadows or reflections. Outdoor settings must not invent walls or doors that do not exist.
- Prop: one complete isolated object on pure white; no human hands, extra products or environment. Material and wear must match the story period.
- Before saving, verify that the selected asset ID and all appearance/wardrobe/material facts come from the read tool. Do not invent celebrity likenesses, beauty transformations or modern items absent from the source.
