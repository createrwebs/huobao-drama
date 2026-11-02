# 🎬 คู่มือและรายละเอียดสถาปัตยกรรมระบบ Huobao Drama (火宝短剧)

> **ฉบับสมบูรณ์ (Full Architecture & Operation Manual)**  
> แพลตฟอร์มผลิตละครสั้นและมังงะวิดีโออัตโนมัติด้วย AI แบบครบวงจร (All-in-One AI Short Drama Production Platform)

---

## 📌 สารบัญ (Table of Contents)
1. [ภาพรวมของระบบและปรัชญาการออกแบบ](#1-ภาพรวมของระบบและปรัชญาการออกแบบ)
2. [สถาปัตยกรรมทางเทคนิค (Tech Stack & Architecture)](#2-สถาปัตยกรรมทางเทคนิค-tech-stack--architecture)
3. [ระบบ AI Multi-Agent Pipeline](#3-ระบบ-ai-multi-agent-pipeline)
4. [ระบบเชื่อมต่อโมเดลสื่อ (Media Generation Hub)](#4-ระบบเชื่อมต่อโมเดลสื่อ-media-generation-hub)
5. [ระบบ Google Flow Bridge & Auto-Pilot (ฟังก์ชันพิเศษ)](#5-ระบบ-google-flow-bridge--auto-pilot-ฟังก์ชันพิเศษ)
6. [คู่มือการใช้งานทีละขั้นตอนพร้อมภาพประกอบ (Step-by-Step Manual)](#6-คู่มือการใช้งานทีละขั้นตอนพร้อมภาพประกอบ-step-by-step-manual)
   - [ขั้นตอนที่ 1: การสร้างโปรเจกต์และกำหนดสไตล์](#ขั้นตอนที่-1-การสร้างโปรเจกต์และกำหนดสไตล์)
   - [ขั้นตอนที่ 2: การตั้งค่า AI Services & Providers](#ขั้นตอนที่-2-การตั้งค่า-ai-services--providers)
   - [ขั้นตอนที่ 3: ขั้นตอนบทละคร (Script Stage & AI Rewrite)](#ขั้นตอนที่-3-ขั้นตอนบทละคร-script-stage--ai-rewrite)
   - [ขั้นตอนที่ 4: การสกัดและผลิตสินทรัพย์ (Asset Extraction & Consistency)](#ขั้นตอนที่-4-การสกัดและผลิตสินทรัพย์-asset-extraction--consistency)
   - [ขั้นตอนที่ 5: การแตกสตอรี่บอร์ดและสร้างวิดีโอ (Storyboard & Video Generation)](#ขั้นตอนที่-5-การแตกสตอรี่บอร์ดและสร้างวิดีโอ-storyboard--video-generation)
   - [ขั้นตอนที่ 6: การรวมคลิปและส่งออก (FFmpeg Merge & Export)](#ขั้นตอนที่-6-การรวมคลิปและส่งออก-ffmpeg-merge--export)
7. [ระบบ Colab Worker & Distributed GPU](#7-ระบบ-colab-worker--distributed-gpu)
8. [ระบบ Multi-User, Data Isolation และระบบเครดิต (Tora / New-API)](#8-ระบบ-multi-user-data-isolation-และระบบเครดิต-tora--new-api)
9. [โครงสร้างฐานข้อมูลและไดเรกทอรีจัดเก็บไฟล์](#9-โครงสร้างฐานข้อมูลและไดเรกทอรีจัดเก็บไฟล์)
10. [แนวทางการดูแลและแก้ปัญหา (Operations & Troubleshooting)](#10-แนวทางการดูแลและแก้ปัญหา-operations--troubleshooting)

---

## 1. ภาพรวมของระบบและปรัชญาการออกแบบ

**Huobao Drama (火宝短剧)** เป็นโซลูชัน Full-Stack ระดับโปรดักชันที่ถูกออกแบบมาเพื่อปฏิวัติวงการผลิตละครสั้น (Short Drama), การ์ตูนขยับได้ (Manga Video) และคอนเทนต์วิดีโอสั้น โดยนำพลังของโมเดลปัญญาประดิษฐ์ (Generative AI) มาร้อยเรียงเข้ากับกระบวนการผลิตสื่อจริงตั้งแต่ต้นน้ำถึงปลายน้ำ

```mermaid
flowchart LR
    A["📖 นิยาย / เนื้อเรื่องดิบ"] --> B["🤖 AI Script Rewriter\n(เรียบเรียงบทถ่ายทำ)"]
    B --> C["🎭 AI Asset Extractor\n(สกัดตัวละคร/ฉาก/พร็อพ)"]
    C --> D["🎨 AI Image Gen\n(สร้าง Character Sheet & Scene)"]
    D --> E["🎬 AI Storyboard Breaker\n(แตกช็อตกล้อง + Prompt วิดีโอ)"]
    E --> F["🎥 AI Video Gen\n(Seedance, Wan, MiniMax, Flow)"]
    F --> G["🎞️ FFmpeg Compositor\n(รวมคลิป + เสียง + ซับไตเติล)"]
    G --> H["🏆 ตอนละครสมบูรณ์ (Full MP4)"]
```

### ปัญหาหลักที่ระบบเข้ามาแก้ไข
1. **ความไม่ต่อเนื่องของตัวละคร (Character Inconsistency)**: การสร้างวิดีโอ AI ทั่วไปมักเกิดปัญหาหน้าตาและชุดของตัวละครเปลี่ยนไปทุกช็อต Huobao Drama แก้ปัญหานี้ด้วยระบบ **Asset Library + Reference Image Injection + Google Flow Character Mapping**
2. **กระบวนการที่กระจัดกระจาย**: ผู้สร้างคอนเทนต์เดิมต้องสลับไปมาระหว่าง ChatGPT (เขียนบท) -> Midjourney (เจนรูป) -> Runway/Kling (เจนวิดีโอ) -> Premiere Pro (ตัดต่อ) Huobao Drama รวมทั้งหมดไว้ในเวิร์กเบนช์หน้าเดียว
3. **การควบคุมต้นทุนและเครดิต**: รองรับทั้ง Local Models, Cloud APIs ชั้นนำ, ระบบเครดิตกลาง (Tora API), Worker GPU อิสระ และการเชื่อมต่อผ่าน Google Flow ฟรีเครดิต

---

## 2. สถาปัตยกรรมทางเทคนิค (Tech Stack & Architecture)

ระบบประกอบด้วยสถาปัตยกรรมแบบแยกส่วน (Decoupled Modular Architecture) ที่เชื่อมโยงกันอย่างมีประสิทธิภาพ:

```mermaid
graph TD
    subgraph Client_Layer ["🖥️ Client Layer (Frontend & Desktop)"]
        FE["Nuxt 3 + Vue 3 SPA\n(พอร์ต 3013)"]
        Electron["Electron Shell\n(macOS dmg / Windows exe)"]
        Ext["Flow Bridge Chrome Extension\n(Manifest V3)"]
    end

    subgraph Server_Layer ["⚙️ Backend Layer (Hono Framework)"]
        Hono["Hono API Server\n(Node.js 20+, พอร์ต 5679)"]
        Mastra["Mastra AI Agent Engine\n(4 Specialized Agents)"]
        TaskQueue["SysTask LifeCycle Manager\n(Polling, Webhook, Retry)"]
        FFmpegSvc["FFmpeg Compositor Engine\n(ffmpeg-static / ffprobe-static)"]
    end

    subgraph Service_Bridge ["🌉 Integration & Workers"]
        FlowBridge["Flow Bridge Daemon\n(flow-macos, พอร์ต 9222)"]
        ColabWorker["External GPU Worker\n(Google Colab / Dedicated Node)"]
        ToraClient["Tora / New-API Settlement\n(Credit Balance & Usage)"]
    end

    subgraph Data_Layer ["💾 Data Persistence"]
        SQLite[("SQLite 3 Database\n(WAL Mode: huobao.sqlite3)")]
        Storage["Local Assets Storage\n(data/static/ images & videos)"]
    end

    FE -->|HTTP / REST / SSE| Hono
    Electron -->|Injected Environment| Hono
    Ext -->|WebSocket ws://127.0.0.1:9222| FlowBridge
    Hono --> Mastra
    Hono --> TaskQueue
    Hono --> FFmpegSvc
    Hono --> FlowBridge
    Hono --> ColabWorker
    Hono --> ToraClient
    Hono --> SQLite
    Hono --> Storage
```

### รายละเอียดเทคโนโลยีในแต่ละส่วน:
- **Frontend**: พัฒนาด้วย Nuxt 3 (ตั้งค่า `ssr: false`), Vue 3 Composition API, TypeScript ใช้ Pure CSS ที่ออกแบบเฉพาะตัวเพื่อความเร็วในการเรนเดอร์ ไม่พึ่งพาคอมโพเนนต์ไลบรารีขนาดใหญ่
- **Backend API**: พัฒนาด้วย **Hono** บน Node.js ซึ่งมีขนาดเบาและประสิทธิภาพการประมวลผลสูง จัดการ Routing ภายใต้ `/api/v1` และให้บริการไฟล์สถิตผ่าน `/static`
- **Database Layer**: ใช้ **SQLite** ผ่าน `better-sqlite3` ร่วมกับ **Drizzle ORM** รันในโหมด WAL (Write-Ahead Logging) เพื่อรองรับการอ่านเขียนพร้อมกันได้อย่างลื่นไหล ไม่ต้องติดตั้งดาต้าเบสเซิร์ฟเวอร์ภายนอก
- **Post-Production Video Engine**: ติดตั้งไบนารี `ffmpeg-static` และ `ffprobe-static` มาในตัว รองรับการรวมคลิป ปรับสัดส่วน (Letterbox / Pan-Scan) ดึงเฟรมแรก (Poster Frame) และแทรกเสียงโดยไม่ต้องติดตั้ง FFmpeg แยกในระบบปฏิบัติการ

---

## 3. ระบบ AI Multi-Agent Pipeline

ระบบใช้สถาปัตยกรรม **Mastra Agent Framework** โดยแบ่งหน้าที่การทำงานออกเป็น 4 เอเจนต์เฉพาะทาง:

| Agent Name | หน้าที่หลัก | Input | Output | Prompt Template |
|---|---|---|---|---|
| `script_rewriter` | ดัดแปลงเนื้อเรื่อง/นิยายให้อยู่ในฟอร์แมตบทละครสำหรับถ่ายทำ | นิยายดิบ, สไตล์, ข้อมูลเบื้องต้น | บทละครแบ่งตอน พร้อมไดอะล็อกและคำบรรยายฉาก | `workspace/prompts/script_rewriter.th.md` |
| `extractor` | วิเคราะห์บทละครและสกัดรายชื่อเอนทิตีที่ต้องสร้าง | บทละครโทรทัศน์ | รายชื่อตัวละคร (Character), ฉาก (Scene), พร็อพ (Prop) พร้อมคำอธิบายรูปลักษณ์ | `workspace/prompts/extractor.th.md` |
| `storyboard_breaker` | แยกบทละครแต่ละฉากออกเป็นช็อตกล้อง (Shots) | บทของแต่ละตอน | สตอรี่บอร์ดรายช็อต (มุมกล้อง, ขนาดภาพ, แอ็กชัน, ไดอะล็อก) | `workspace/prompts/storyboard_breaker.th.md` |
| `prompt_generator` | แปลงรายละเอียดช็อตและเอนทิตีเป็น Prompt ภาษาอังกฤษสำหรับโมเดลภาพ/วิดีโอ | ข้อมูลสตอรี่บอร์ด + สไตล์ภาพ | Positive Prompt, Negative Prompt, Camera Movements, Tag `@Character` | `workspace/prompts/prompt_generator.th.md` |

---

## 4. ระบบเชื่อมต่อโมเดลสื่อ (Media Generation Hub)

Huobao Drama มี Adapter Pattern ที่ยืดหยุ่น รองรับการสร้างสื่อผ่านผู้ให้บริการชั้นนำ:

```mermaid
graph LR
    subgraph Text_Models ["📝 ข้อความ (Text LLMs)"]
        T1["OpenAI (GPT-4o, GPT-4o-mini)"]
        T2["Google Gemini (1.5 Flash, 1.5 Pro, 2.5 Flash)"]
        T3["DeepSeek / Claude / Qwen / Kimi"]
    end

    subgraph Image_Models ["🎨 ภาพนิ่ง (Image Generation)"]
        I1["OpenAI DALL-E 3"]
        I2["Google Gemini / Imagen 3"]
        I3["Volcano Engine (Doubao Image)"]
        I4["Google Flow (Gem_pix_2 / Imagen 3)"]
    end

    subgraph Video_Models ["🎥 วิดีโอ (Video Generation)"]
        V1["Volcano Engine Seedance 2.0 (Standard / Fast / Mini)"]
        V2["Alibaba Bailian Wan 3.0 (Prime / Standard)"]
        V3["MiniMax Video (Hailuo / H3)"]
        V4["Google Flow (Veo 2 Engine via Bridge)"]
        V5["Colab External GPU Worker"]
    end
```

---

## 5. ระบบ Google Flow Bridge & Auto-Pilot (ฟังก์ชันพิเศษ)

หนึ่งในฟีเจอร์เด่นที่สุดของระบบที่ได้รับการผสานอย่างแนบเนียนคือการเชื่อมต่อเข้ากับ **Google Flow (`flow.google.com`)**:

```mermaid
sequenceDiagram
    autonumber
    actor User as ผู้ใช้งาน
    participant Chrome as Google Chrome (Google Flow Tab)
    participant Ext as Flow Bridge Extension (MV3)
    participant Daemon as Flow Agent Daemon (Port 9222)
    participant Backend as Huobao Backend (Port 5679)
    participant FlowAPI as Google Flow Upstream (Veo 2 / Imagen 3)

    User->>Chrome: เปิดหน้า flow.google.com ล็อกอินบัญชี Google
    Backend->>Daemon: เช็กสถานะผ่าน WebSocket ws://127.0.0.1:9222
    Ext->>Chrome: ดึง Session Tokens & Cookies ล่าสุด
    Ext->>Daemon: Sync บัญชีและ Cookies ผ่าน WebSocket (Port 9222)
    Daemon->>Daemon: บันทึกลง flow-agent/cookies/account_*.json
    Backend->>Daemon: สั่ง Generate Video (Prompt + Character References)
    Daemon->>FlowAPI: ยิงคำสั่งสร้างวิดีโอ Veo 2 ด้วยเครดิตของบัญชี Google
    FlowAPI-->>Daemon: วิดีโอเรนเดอร์เสร็จสิ้น (ดาวน์โหลดเป็น MP4)
    Daemon-->>Backend: ส่งกลับ path ไฟล์วิดีโอเข้าคลังสตอรี่บอร์ด
    Backend-->>User: แสดงวิดีโอบนหน้าจอสตอรี่บอร์ดพร้อมใช้งาน
```

### จุดเด่นของ Google Flow Bridge:
1. **ฟรีเครดิตจาก Google**: ใช้งานโมเดลเรือธงอย่าง **Veo 2** และ **Imagen 3** ผ่านเครดิตที่ Google มอบให้ในแพลตฟอร์ม Flow โดยตรง
2. **ระบบดึง Cookie อัตโนมัติ (Zero-Config Session)**: มี Chrome Extension ช่วยจับคู่ Session Token แบบเรียลไทม์ ทำให้ผู้ใช้ไม่ต้องคัดลอก Cookie ด้วยมือ
3. **Character Reference Synchronization**: Huobao Backend จะส่งรูป Reference ของตัวละครไปขึ้นทะเบียนใน Google Flow ล่วงหน้า ทำให้เมื่อสั่งเจนวิดีโอ ตัวละครจะมีหน้าตาเหมือนต้นฉบับอย่างแม่นยำ

---

## 6. คู่มือการใช้งานทีละขั้นตอนพร้อมภาพประกอบ (Step-by-Step Manual)

### ขั้นตอนที่ 1: การสร้างโปรเจกต์และกำหนดสไตล์

เริ่มต้นการสร้างซีรีส์ละครสั้นด้วยการกดปุ่ม **"สร้างโปรเจกต์ใหม่" (New Project)** บนหน้าแดชบอร์ด

<p align="center">
  <img src="screenshots/02-create-drama.png" alt="หน้าต่างสร้างโปรเจกต์" width="800">
</p>

#### การตั้งค่าสำคัญ:
1. **ชื่อเรื่อง (Drama Title)**: ระบุชื่อเรื่องของละคร
2. **อัตราส่วนการแสดงผล (Aspect Ratio)**:
   - **9:16 (แนวตั้ง)**: เหมาะสำหรับ TikTok, YouTube Shorts, Reels, Kuaishou, Douyin
   - **16:9 (แนวนอน)**: เหมาะสำหรับ YouTube, TV Series, แพลตฟอร์มสตรีมมิ่งทั่วไป
   *(หมายเหตุ: เมื่อเลือกแล้วจะไม่สามารถเปลี่ยนอัตราส่วนระหว่างโปรเจกต์ได้)*
3. **สไตล์ภาพ (Visual Style)**: เลือกลุคแอนด์ฟีลของเรื่อง เช่น 3D Animation, Real-life Cinematic, Anime, Cyberpunk โดยสไตล์ที่เลือกนี้จะถูกระบบแทรกเข้าไปเป็นแกนหลักของ Prompt ทุกรูปและทุกวิดีโอโดยอัตโนมัติ

เมื่อสร้างเสร็จ ระบบจะนำคุณเข้าสู่หน้ารายการโปรเจกต์:

<p align="center">
  <img src="screenshots/01-projects.png" alt="หน้ารายการโปรเจกต์" width="800">
</p>

---

### ขั้นตอนที่ 2: การตั้งค่า AI Services & Providers

ก่อนเริ่มสร้างชิ้นงาน ให้ไปที่เมนู **"ตั้งค่า" (Settings)** เพื่อกำหนดโมเดล AI ที่ต้องการใช้งาน

<p align="center">
  <img src="screenshots/03-settings-quick.png" alt="หน้าตั้งค่า AI Services" width="800">
</p>

#### วิธีการตั้งค่า 2 รูปแบบ:
1. **Huobao Quick Setup**: เพียงวาง API Key ตัวเดียวจากระบบ Huobao / Firemux หรือ Tora ระบบจะกำหนดค่า Text, Image, และ Video Models ที่แนะนำให้ทันทีในคลิกเดียว
2. **Manual Configuration**: กำหนดค่าแยกตาม Provider ได้อย่างอิสระ ไม่ว่าจะเป็น OpenAI, Google Gemini, Volcano Engine, MiniMax, Alibaba Wan หรือ Google Flow

---

### ขั้นตอนที่ 3: ขั้นตอนบทละคร (Script Stage & AI Rewrite)

คลิกเข้าสู่ตอนที่ต้องการผลิตในหน้ารายการตอน:

<p align="center">
  <img src="screenshots/04-episodes.png" alt="หน้ารายการตอน" width="800">
</p>

นำเนื้อเรื่อง นิยายต้นฉบับ หรือเรื่องย่อมาวางในหน้า **Script Stage**:

<p align="center">
  <img src="screenshots/05-script.png" alt="หน้าจอเขียนบทและ AI Rewrite" width="800">
</p>

- คลิกปุ่ม **"AI Rewrite"** เพื่อให้เอเจนต์แปลงข้อความเป็นบทโทรทัศน์มาตรฐาน
- ระบบจะระบุบทพูด (Dialogue), อารมณ์ความรู้สึก, การกระทำ (Action), สภาพแวดล้อม และตัวละครที่ปรากฏในฉากให้อัตโนมัติ

---

### ขั้นตอนที่ 4: การสกัดและผลิตสินทรัพย์ (Asset Extraction & Consistency)

เมื่อได้บทที่สมบูรณ์แล้ว ให้คลิกแท็บ **"Assets" (สินทรัพย์)**:

<p align="center">
  <img src="screenshots/06-assets.png" alt="หน้าจอจัดการสินทรัพย์และตัวละคร" width="800">
</p>

1. คลิก **"AI Extract Assets"**: ระบบจะวิเคราะห์บทและแยกรายการตัวละคร (Characters), ฉากหลัง (Scenes) และอุปกรณ์สำคัญ (Props)
2. คลิก **"Generate"** หรือ **"Batch Generate"**: AI จะวาดรูป Character Design Sheet และภาพบรรยากาศฉากออกมา
3. **รูปภาพอ้างอิง (Reference Consistency)**: รูปที่สร้างขึ้นหรืออัปโหลดเข้ามานี้ จะถูกใช้เป็นภาพอ้างอิงตั้งต้น (Image-to-Video Reference) ในขั้นตอนสร้างวิดีโอ ทำให้ตัวละครคงรูปลักษณ์เดิมตลอดทั้งเรื่อง

---

### ขั้นตอนที่ 5: การแตกสตอรี่บอร์ดและสร้างวิดีโอ (Storyboard & Video Generation)

เข้าสู่ขั้นตอนที่สำคัญที่สุดคือแท็บ **"Storyboard & Video Production"**:

<p align="center">
  <img src="screenshots/07-storyboard.png" alt="หน้าจอแบ่งช็อตสตอรี่บอร์ด" width="800">
</p>

1. **AI Storyboard Breakdown**: คลิกปุ่มเพื่อแตกฉากออกเป็นช็อตกล้อง (Camera Shots) เช่น ช็อตโคลสอัพ (Close-up), มุมกว้าง (Wide Shot), ช็อตติดตาม (Tracking Shot)
2. ตรวจสอบ Prompt ในแต่ละช็อต โดยระบบจะดึงแท็ก `@Character` มาจับคู่กับรูป Reference ของตัวละครให้อัตโนมัติ
3. สั่งสร้างวิดีโอ: สามารถเลือกสร้างทีละช็อต หรือกด **"Batch Generate Videos"**

<p align="center">
  <img src="screenshots/08-videos.png" alt="หน้าจอสร้างวิดีโอสตอรี่บอร์ด" width="800">
</p>

- หน้าจอจะแสดงสถานะความคืบหน้าของงาน (Pending ➜ Generating ➜ Completed)
- หากมีช็อตใดที่โมเดลเรนเดอร์ไม่ถูกใจ สามารถกดปุ่ม **"Regenerate"** หรือแก้ไข Prompt เฉพาะช็อตนั้นได้ทันที

---

### ขั้นตอนที่ 6: การรวมคลิปและส่งออก (FFmpeg Merge & Export)

เมื่อคลิปวิดีโอในแต่ละช็อตเรนเดอร์เสร็จสมบูรณ์แล้ว ให้เข้าสู่แท็บ **"Export" (รวมคลิปและส่งออก)**:

<p align="center">
  <img src="screenshots/09-export.png" alt="หน้าจอรวมคลิปและส่งออก" width="800">
</p>

1. **ตรวจสอบความต่อเนื่อง (Timeline Preview)**: สามารถเลื่อนเมาส์พรีวิวเนื้อหาวิดีโอแต่ละช็อต เรียงลำดับ หรือสลับคลิปสำรองได้
2. **Start Merging**: คลิกปุ่มรวมวิดีโอ ระบบจะส่งคำสั่งไปยัง Engine FFmpeg ภายในตัวเครื่องเพื่อ:
   - ปรับความละเอียดและเฟรมเรตของทุกคลิปให้เท่ากันแบบไร้รอยต่อ
   - ผสานคลิปตามลำดับช็อต
   - ฝังเสียงและจัดวางซับไตเติล
3. **Download & Publish**: เมื่อรวมเสร็จ สามารถกดเล่นไฟล์เต็มบนเบราว์เซอร์ และคลิกปุ่ม **"Download Video"** เพื่อนำไฟล์ `.mp4` ไปเผยแพร่ได้ทันที

---

## 7. ระบบ Colab Worker & Distributed GPU

สำหรับผู้ใช้ที่ต้องการสร้างวิดีโอความละเอียดสูงด้วยโมเดลหนัก (เช่น MiniMax H3 หรือ Alibaba Wan) โดยไม่มี GPU แรงในเครื่อง:

```mermaid
flowchart LR
    A["Huobao Backend\n(พอร์ต 5679)"] -- "1. Dispatch Job\n(Prompt + Ref Images)" --> B["Cloudflare R2 / Storage"]
    B --> C["Colab / External GPU Worker\n(PyTorch / Diffusers / API)"]
    C -- "2. Polling / Fetch Task" --> A
    C -- "3. Render Video on GPU" --> C
    C -- "4. Upload Result (.mp4)" --> B
    C -- "5. Report Task Completed" --> A
```

- มีหน้าต่าง **ColabVideoModal** บน UI เพื่ออำนวยความสะดวกในการกดส่งงานไปยัง Worker ภายนอก
- รองรับการทำงานแบบ Asynchronous Background Task ไม่บล็อกการทำงานส่วนอื่นของแอป

---

## 8. ระบบ Multi-User, Data Isolation และระบบเครดิต (Tora / New-API)

ในเวอร์ชันปัจจุบัน ระบบได้รับการอัปเกรดให้รองรับการทำงานแบบ Multi-User และระบบจัดสรรโควตาเครดิต:

1. **User Authentication & Isolation**:
   - รองรับระบบล็อกอินผ่าน JWT / Session Tokens
   - มีคอมโพเนนต์ **UserBadge** แสดงชื่อบัญชีและสถานะที่มุมขวาบน
   - ข้อมูลโปรเจกต์ (Drama), ตอน (Episode) และงานสร้างสื่อ (SysTask) จะถูกผูกกับ `ownerUserId` อย่างเคร่งครัด ผู้ใช้แต่ละคนจะไม่เห็นงานของกันและกัน
2. **ระบบคิดเครดิต Tora / New-API (`toraapi.com`)**:
   - ระบบคำนวณเครดิตจาก **วินาทีของวิดีโอผลลัพธ์ที่สร้างสำเร็จจริง × ราคาตามโมเดลและความละเอียด**
   - งานที่ล้มเหลว (Failed / Cancelled) จะไม่มีการหักเครดิตใดๆ ทั้งสิ้น

---

## 9. โครงสร้างฐานข้อมูลและไดเรกทอรีจัดเก็บไฟล์

### ตารางหลักในฐานข้อมูล SQLite (`data/huobao.sqlite3`):
- `users`: บัญชีผู้ใช้งานและ Token สิทธิ์
- `dramas`: ข้อมูลโปรเจกต์ซีรีส์, สไตล์, อัตราส่วนภาพ, เจ้าของ
- `episodes`: ตอนของละคร, บทโทรทัศน์, สถานะความคืบหน้า
- `characters` / `scenes` / `props`: สินทรัพย์อ้างอิงที่สกัดได้
- `storyboards`: รายละเอียดช็อตกล้อง, Prompt, วิดีโอ URL, สถานะ
- `sys_task`: ประวัติและสถานะคิวการสร้างสื่อ (Pending, Processing, Succeeded, Failed)
- `ai_service_configs`: การตั้งค่าผู้ให้บริการโมเดล AI แต่ละตัว

### โครงสร้างโฟลเดอร์สำหรับจัดเก็บไฟล์สื่อ (`data/static/`):
```
data/
├── huobao.sqlite3        # ฐานข้อมูลหลัก (SQLite + WAL)
└── static/
    ├── images/           # รูป Character Design และ Scene Reference
    ├── videos/           # คลิปวิดีโอรายช็อตที่สร้างจาก AI
    └── merged/           # ไฟล์วิดีโอฉบับเต็มของตอนที่รวมผ่าน FFmpeg แล้ว
```

---

## 10. แนวทางการดูแลและแก้ปัญหา (Operations & Troubleshooting)

### 1. คำสั่งสำหรับเริ่มต้นการทำงาน (Developer & Server Commands):
```bash
# รัน Backend (Hono + TypeScript)
cd backend && npm run dev

# รัน Frontend (Nuxt 3 Dev Server)
cd frontend && npm run dev

# รัน Flow Bridge (สำหรับการเชื่อมต่อ Google Flow)
cd flow-drama-autopilot/flow-agent-ref/flow-agent
./bin/flow bridge
```

### 2. การตรวจสอบสถานะระบบ Google Flow (Self-Diagnostics):
```bash
cd flow-drama-autopilot/flow-agent-ref/flow-agent
./bin/flow doctor
```
ผลลัพธ์ที่ถูกต้องควรแสดง:
- `ok cookies`: พบคุกกี้ที่ถูกต้องและสดใหม่
- `ok session`: upstream accepted the session — มีจำนวนเครดิตพร้อมใช้งาน
- `ok database`: ระบบฐานข้อมูล Flow Agent พร้อมทำงาน

### 3. กรณี Session ของ Google Flow หมดอายุ (401 Expired):
- เปิดเบราว์เซอร์ Google Chrome ไปที่ `https://flow.google.com`
- เปิดหน้าต่างทิ้งไว้ เพื่อให้ส่วนขยาย **Flow Bridge Extension** ดึงคุกกี้ใหม่และซิงค์กลับมายัง `flow bridge` อัตโนมัติ
