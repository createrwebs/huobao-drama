---
name: storyboard-prompt
description: ข้อกำหนดพร้อมท์ภาพสตอรี่บอร์ด 2x3 Grid — สร้างพร้อมท์ตาราง 6 ช่องลำดับเหตุการณ์ภาพยนตร์ (2x3 Storyboard Grid) โดยนำภาพฉาก ตัวละคร และอุปกรณ์ที่เตรียมไว้มาอ้างอิง เพื่อสร้างภาพสตอรี่บอร์ดที่มีความสม่ำเสมอสูง
---

# พร้อมท์ภาพสตอรี่บอร์ด 2x3 Grid (6 Sequential Cinematic Panels)

ภาพสตอรี่บอร์ดสำหรับแต่ละช่วงช็อต คือ **แผ่นสตอรี่บอร์ดตาราง 2x3 (6 ช่องลำดับเหตุการณ์ภาพยนตร์ต่อเนื่องในภาพเดียว)** 
สร้างขึ้นเพื่อแสดงความต่อเนื่องของมุมกล้อง การกระทำ สีหน้า อารมณ์ และเหตุการณ์ตามลำดับเวลาในฉากนั้น โดยรักษาความสม่ำเสมอของตัวละคร ฉาก และอุปกรณ์อย่างเคร่งครัด

## โครงสร้างพร้อมท์มาตรฐาน (Standard Prompt Structure)

พร้อมท์ต้องเริ่มต้นด้วยข้อความระบุตาราง 2x3 สไตล์ภาพ และการรักษาความคงที่ของตัวละคร แล้วตามด้วยรายละเอียดของแต่ละช่อง Panel 1 ถึง Panel 6:

```
Create a single 2x3 storyboard grid containing 6 sequential cinematic panels, shot on [visual style / 35mm film], [aesthetic, color grading & lighting]. High consistency in the main character: [character identity, key appearance & outfit]. No text, no captions, no borders.
- Panel 1: [Camera shot type & angle]. [Description of opening beat / setting the scene & character state].
- Panel 2: [Camera shot type & angle]. [Action progression / movement or key interaction].
- Panel 3: [Camera shot type & angle]. [Emotional reaction, detail close-up or conflict point].
- Panel 4: [Camera shot type & angle]. [New perspective / movement down the space or environment tension].
- Panel 5: [Camera shot type & angle]. [Over-the-shoulder or discovery moment / key story turn].
- Panel 6: [Camera shot type & angle]. [Climactic beat of this segment / immediate consequence & expression].
```

## ตัวอย่างพร้อมท์ที่สมบูรณ์ (Reference Example)

```
Create a single 2x3 storyboard grid containing 6 sequential cinematic panels, shot on 35mm film, cyberpunk aesthetic, neon blue and orange color grading. High consistency in the main character: a young female explorer wearing a glowing white tech-jacket. No text, no captions, no borders.
- Panel 1: Extreme wide shot. The female explorer stands at the edge of a massive, foggy neon metropolis at dusk.
- Panel 2: Medium shot. She pulls up a glowing holographic map from her wrist device, illuminating her face.
- Panel 3: Close-up shot. Her eyes widen as she spots a hidden coordinates flashing red on the holographic screen.
- Panel 4: Low angle shot. She walks down a dark, rain-slicked alleyway flanked by humming server towers.
- Panel 5: Over-the-shoulder shot. She discovers a massive, rusted vault door hidden behind hanging wires.
- Panel 6: Medium close-up. The vault door hinges hiss open, casting a bright golden light over her amazed face.
```

## กฎและขั้นตอนการสร้าง (Rules & Guidelines)

1. **ส่วนหัว (Header)**:
   - ต้องขึ้นต้นด้วย `Create a single 2x3 storyboard grid containing 6 sequential cinematic panels` เสมอ
   - ระบุสไตล์ภาพยนตร์ เช่น `shot on 35mm film`, โทนสีและแสงตาม `atmosphere` ของช็อต
   - ระบุหลักยึดตัวละคร เช่น `High consistency in the main character: [ชื่อ/คำอธิบายตัวละครพร้อมชุดที่สวมใส่ตาม appearance/styling]`
   - ลงท้ายด้วย `No text, no captions, no borders.` เพื่อป้องกัน AI ใส่ตัวหนังสือหรือเส้นขอบหนา

2. **ลำดับช่อง Panel 1 ถึง Panel 6**:
   - นำเนื้อหาใน `description` (ซึ่งอาจมี `【ช็อต 1】`, `【ช็อต 2】` หรือลำดับเหตุการณ์) มาขยายเป็น 6 จังหวะภาพยนตร์ที่ลื่นไหล
   - แต่ละช่องต้องเริ่มต้นด้วย **ขนาดภาพและมุมกล้องภาษาอังกฤษ** เช่น:
     - `Extreme wide shot`, `Wide shot`, `Establishing shot`
     - `Medium shot`, `Medium close-up shot`
     - `Close-up shot`, `Extreme close-up shot`
     - `Low angle shot`, `High angle shot`, `Over-the-shoulder shot`, `Dutch angle shot`
   - ตามด้วยเหตุการณ์ การกระทำ สีหน้า ท่าทาง และปฏิสัมพันธ์กับสิ่งแวดล้อมหรืออุปกรณ์

3. **การนำภาพที่เตรียมไว้มาอ้างอิง (Multi-Modal Image References)**:
   - ภาพฉาก (Scene): ใช้ควบคุมสถานที่ แสง สถาปัตยกรรม
   - ภาพตัวละคร (Characters): ใช้ควบคุมใบหน้า ทรงผม และชุดของตัวละคร
   - ภาพอุปกรณ์ (Props): ใช้ควบคุมลักษณะอุปกรณ์สำคัญ
   - ภาพอ้างอิงเหล่านี้จะถูกส่งเข้าโมเดลสร้างภาพไปพร้อมกับพร้อมท์ตาราง 2x3

4. **การบันทึก**:
   - บันทึกผลลัพธ์ลงในฟิลด์ `image_prompt` ของตารางสตอรี่บอร์ดผ่านฟังก์ชัน `updateStoryboard`
