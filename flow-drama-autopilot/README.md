# 🎬 Google Flow Drama Auto-Pilot

ระบบควบคุมและสร้างคลิปละครสั้นอัตโนมัติบน **Google Flow** (`flow.google.com`) พร้อมการจัดการ Character Consistency และการประกอบวิดีโอแบบครบวงจร

---

## 📁 โครงสร้างโปรเจกต์

```
flow-drama-autopilot/
├── extension/                   # โฟลเดอร์ Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── content.js               # สคริปต์ควบคุมหน้าเว็บ Google Flow อัตโนมัติ
│   ├── content.css              # แผงควบคุมลอย (Floating UI) บนหน้า Flow
│   └── background.js            # จัดการดาวน์โหลดไฟล์ .mp4 ลงเครื่อง
├── generate_drama_script.py     # สคริปต์สร้างบทละครสั้น + แท็ก @Character
├── stitch_videos.py             # รวมคลิปทุกซีนด้วย FFmpeg
└── drama_script.json            # บทละครสั้นที่สร้างขึ้นพร้อมใช้งาน
```

---

## 🚀 ขั้นตอนการติดตั้งและใช้งาน (3 สเต็ปง่ายๆ)

### สเต็ปที่ 1: ติดตั้ง Chrome Extension ลงใน Google Chrome

1. เปิดเบราว์เซอร์ **Google Chrome** ของคุณ
2. ไปที่ URL: `chrome://extensions`
3. เปิดสวิตช์ **โหมดนักพัฒนาซอฟต์แวร์ (Developer mode)** ที่มุมขวาบน
4. คลิกปุ่ม **โหลดส่วนขยายที่คลายการบีบอัดแล้ว (Load unpacked)** ที่มุมซ้ายบน
5. เลือกโฟลเดอร์:
   `/Users/noppanan/flow-drama-autopilot/extension`

---

### สเต็ปที่ 2: เริ่มสร้างวิดีโอบน Google Flow

1. เปิดหน้าเว็บ **[https://flow.google.com/](https://flow.google.com/)** ใน Chrome
2. คุณจะเห็นแผงควบคุมสีดำลอยอยู่ที่มุมขวาล่างของหน้าจอ: **🎬 Google Flow Auto-Pilot**
3. สามารถกดปุ่ม **"โหลดตัวอย่าง"** หรือนำบทละครสั้นจากไฟล์ `drama_script.json` มาวาง
4. คลิกปุ่ม **"▶ เริ่มสร้างวิดีโออัตโนมัติ"**
5. ระบบจะ:
   - ป้อนคำสั่ง Prompt ทีละซีน (พร้อมเรียกแท็กตัวละคร เช่น `@Danai`)
   - สั่งกด Generate
   - รอจนคลิปเรนเดอร์เสร็จสิ้น
   - ดาวน์โหลดไฟล์ `scene_01.mp4`, `scene_02.mp4` ลงเครื่องให้อัตโนมัติ!

---

### สเต็ปที่ 3: สั่งรวมคลิปเป็นวิดีโอตัวเต็มด้วย FFmpeg

เมื่อดาวน์โหลดคลิปครบทุกซีนแล้ว ให้เปิด Terminal แล้วรันคำสั่ง:

```bash
cd /Users/noppanan/flow-drama-autopilot
python3 stitch_videos.py
```

คุณจะได้ไฟล์วิดีโอละครสั้นตัวเต็ม **`final_drama.mp4`** พร้อมนำไปใช้งานทันที!
