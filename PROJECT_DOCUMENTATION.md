# เอกสารโครงการ Huobao Drama (火宝短剧)

> เอกสารฉบับนี้จัดทำขึ้นเพื่ออธิบายสถาปัตยกรรม โครงสร้างโค้ด เทคโนโลยี ขั้นตอนการพัฒนา และกระแสข้อมูล (data flow) ของแพลตฟอร์มสร้าง "短剧" (short drama) อัตโนมัติด้วย AI ที่ชื่อ **Huobao Drama**
>
> เอกสารนี้สรุปจากการสำรวจโค้ดต้นฉบับจริงใน repository (`/Users/noppanan/huobao-drama`) รวมถึง `CLAUDE.md` `README.md` `Dockerfile` `docker-compose.yml` และไฟล์สำคัญใน `backend/src` `frontend/app` `desktop/src` `worker/`

---

## 1. ภาพรวมโครงการ

**Huobao Drama** เป็นแพลตฟอร์ม Full-Stack TypeScript สำหรับผลิต短剧แบบ end-to-end ตั้งแต่ รับข้อความต้นฉบับ / บทสรุป / นิยาย → ใช้ LLM แปลงเป็น剧本 → สกัดตัวละคร ฉาก อุปกรณ์ → สร้างภาพ → สร้างวิดีโอแต่ละ shot → ต่อเป็น episode สมบูรณ์

### 1.1 คุณค่าหลัก (Core Value)

- **AI-Driven**: LLM อ่าน剧本แล้วสกัด entity และ storyboard
- **Intelligent Creation**: AI image generation สำหรับตัวละครและฉาก
- **Video Generation**: text-to-video / image-to-video
- **End-to-End Workflow**: จากไอเดียจนถึง episode ที่ export ได้

### 1.2 รูปแบบการใช้งาน

| รูปแบบ | รายละเอียด |
|--------|-----------|
| **เว็บ + เซิร์ฟเวอร์** | `frontend/` สร้าง static site; `backend/` ทำงานเป็น HTTP API บน Node.js |
| **Desktop** | `desktop/` เป็น Electron app บรรจุ backend ไว้ใน utility process บนเครื่อง |
| **GPU Worker** | `worker/colab_worker.py` เชื่อมต่อ GPU instance เพื่อ render วิดีโอแบบ distributed |

---

## 2. สถาปัตยกรรมระดับสูง

```
  ผู้ใช้งาน (Browser / Electron)
            │
            ▼
    Frontend — Nuxt 3 SPA (Vue 3 + TypeScript)
            │  /api/v1/*, /static/*
            ▼
    Backend  — Hono + Drizzle ORM + better-sqlite3
            │  REST API · Mastra Agents · Generation · FFmpeg
            ▼
   AI Providers / GPU Worker / Storage / R2
```

### ส่วนประกอบหลัก

- **`frontend/`** — Nuxt 3 SPA สำหรับฝั่งผู้ใช้
- **`backend/`** — API และ AI orchestration
- **`desktop/`** — Electron shell
- **`worker/`** — Optional Colab/Kaggle GPU worker
- **`data/`** — SQLite + generated static assets
- **`backend/workspace/`** — Agent prompts และ skill definitions

---

## 3. โครงสร้างไดเรกทอรีหลัก

```
/Users/noppanan/huobao-drama
├── backend/src/           # เซิร์ฟเวอร์ (Hono, agents, services)
│   ├── index.ts          # Entry point
│   ├── agents/           # AI agents + tools + prompts + skills
│   ├── db/               # Drizzle schema + SQLite init
│   ├── middleware/       # auth, logger
│   ├── routes/           # REST API routes
│   ├── services/         # generation, ffmpeg-merge, adapters
│   └── utils/            # paths, storage, ffmpeg helpers
├── frontend/app/          # Nuxt SPA
│   ├── components/
│   ├── composables/
│   ├── locales/          # zh, en, ja, ko, th
│   ├── pages/
│   └── views/drama/      # detail, story, episode
├── desktop/src/           # Electron main process
├── worker/                # colab_worker.py
├── docker/
├── data/                  # DB + assets
├── docker-compose.yml
├── Dockerfile
└── CLAUDE.md
```

---

## 4. เทคโนโลยีหลัก

### 4.1 Backend

- HTTP framework: `hono`
- ORM: `drizzle-orm` (sqlite-core)
- SQLite driver: `better-sqlite3`
- AI framework: `@mastra/core`
- AI SDK: `@ai-sdk/openai`, `@ai-sdk/google`
- Media: `fluent-ffmpeg`, `ffmpeg-static`, `ffprobe-static`, `sharp`

### 4.2 Frontend

- `nuxt` 3.x (`ssr: false`)
- `vue` 3.x Composition API
- `vue-i18n`, `vue-router`, `lucide-vue-next`, `driver.js`, `vue-sonner`
- ไม่ใช้ UI framework; ใช้ pure CSS (`studio.css`)

### 4.3 Desktop

- `electron` 37.x
- `esbuild` สำหรับ bundle backend และ main process
- `electron-builder` สำหรับสร้าง dmg / exe
- native modules: `better-sqlite3`, `sharp`


---

## 5. Backend โดยละเอียด

### 5.1 Entry Point และ Route Mounting

ไฟล์: `backend/src/index.ts`

- สร้าง `Hono()` root และ `Hono()` api ภายใต้ `/api/v1`
- Middleware: CORS, request logger, error handler, auth middleware
- Health check: `GET /api/v1/health`
- Static serving:
  - `/static/*` → `handleAuthenticatedMedia` (ตรวจสิทธิ์ + Range streaming)
  - อื่นๆ → `serveStatic` จาก `FRONTEND_DIST` หรือ `frontend/dist`
- ที่ startup อัปเดต `sys_task` ที่ยัง `processing` ให้เป็น `failed` เพื่อป้องกันงานค้างหลัง restart
- Route `/storyvdo` และ `/` ชี้ไปยัง app เดียวกัน เพื่อรองรับ `baseURL`

### 5.2 REST API Routes (`backend/src/routes/`)

| Route file | Path | หน้าที่ |
|------------|------|---------|
| `auth.ts` | `/api/v1/auth` | ล็อกอิน / ตรวจสอบสิทธิ์ / user |
| `dramas.ts` | `/api/v1/dramas` | CRUD โปรเจกต์短剧 |
| `episodes.ts` | `/api/v1/episodes` | CRUD ตอนและ script |
| `storyboards.ts` | `/api/v1/storyboards` | 分镜 shot |
| `scenes.ts` | `/api/v1/scenes` | ฉาก |
| `characters.ts` | `/api/v1/characters` | ตัวละคร |
| `props.ts` | `/api/v1/props` | อุปกรณ์ |
| `tasks.ts` | `/api/v1/tasks` | สร้าง/ติดตาม image/video task |
| `agent.ts` | `/api/v1/agent/:type/chat` | Chat กับ Mastra agents |
| `aiConfigs.ts` | `/api/v1/ai-configs` | AI provider/model config |
| `settings.ts` | `/api/v1/settings` | App settings |
| `stylePresets.ts` | `/api/v1/style-presets` | 视觉风格 preset |
| `prompts.ts` | `/api/v1/prompts` | Agent prompt files |
| `skills.ts` | `/api/v1/skills` | Agent skill files |
| `merge.ts` | `/api/v1/merge` | FFmpeg 拼接 episode |
| `upload.ts` | `/api/v1/upload` | อัปโหลดไฟล์ |
| `storage.ts` | `/api/v1/storage` | Storage helpers |
| `serverUpdate.ts` | `/api/v1/server-update` | Self-update |
| `flowBridge.ts` | `/api/v1/flow-bridge` | Flow autopilot bridge |
| `vast.ts` | `/api/v1/vast` | Vast.ai GPU rendering |
| `worker.ts` | `/api/v1/worker/jobs/...` | External GPU worker poll/complete/fail |

### 5.3 Authentication & Middleware

ไฟล์: `backend/src/middleware/auth.ts`, `logger.ts`

- `authMiddleware` ตรวจสอบ session/token สำหรับ API ที่ต้องการสิทธิ์
- `getActor` / `isServerMode` ใช้กำหนด `ownerUserId`
- `requestLogger` / `errorHandler` ใช้ `pino` log requests และจัดการ errors



### 5.4 Database (SQLite + Drizzle)

ไฟล์: `backend/src/db/schema.ts`, `sqlite-schema.ts`, `index.ts`

- ใช้ **SQLite** เป็น primary database (`better-sqlite3`)
- Drizzle ORM ใช้ `sqlite-core` สำหรับ type-safe table definitions
- DDL เริ่มต้นอยู่ใน `sqlite-schema.ts` ถูกรันซ้ำแบบ idempotent เมื่อเซิร์ฟเวอร์ start
- ตำแหน่ง DB:
  - Dev: `data/huobao.sqlite3`
  - Docker: `/app/data/huobao.sqlite3`
  - Desktop: `<userData>/data/huobao.sqlite3`
- รองรับ migration จาก MySQL → SQLite ผ่าน `scripts/migrate-sqlite-to-mysql.ts`

#### Tables สำคัญ

| Table | คำอธิบาย |
|-------|----------|
| `dramas` | โปรเจกต์短剧 |
| `episodes` | แต่ละตอน พร้อม script content |
| `characters` | ตัวละคร + appearance + styling |
| `scenes` | ฉาก + lighting + prompt |
| `props` | อุปกรณ์ในฉาก |
| `storyboards` | 分镜 shot ของแต่ละ episode |
| `sys_task` | งาน generate รูป/วิดีโอ |
| `video_merges` | งานต่อตัด FFmpeg |
| `assets` | คลัง asset |
| `ai_service_configs` | AI provider/model/API key |
| `style_presets` | 预设视觉风格 |
| `app_settings` | key-value settings |
| `users` | ผู้ใช้ (issuer + externalUserId) |

---

### 5.5 AI Agents

ไฟล์: `backend/src/agents/index.ts`

ระบบใช้ **Mastra** register agents 4 ตัว:

| Agent | บทบาท | Tools หลัก |
|-------|-------|------------|
| `script_rewriter` | นิยาย/คำสั่ง → 剧本 formatted | `read_episode_script`, `save_script` |
| `extractor` | สกัด characters/scenes/props + deduplicate | `read_script_for_extraction`, `save_dedup_*` |
| `storyboard_breaker` | 剧本 → 分镜 shot พร้อม video_prompt | `read_storyboard_context`, `save_storyboards` |
| `prompt_generator` | สร้าง final prompt สำหรับรูปและ video prompt | `read_characters`, `save_*_final_prompt`, `update_storyboard` |

- Prompt โหลดจาก `backend/workspace/prompts/<agent>.<lang>.md` ถ้าหายให้ fallback ไป `DEFAULT_PROMPTS`
- ภาษา output ควบคุมผ่าน `buildLanguageDirective` + `RequestContext`
- `AI_DISABLE_THINKING` (default `true`) ปิด thinking mode กับ new-api proxies จีน เพื่อหลีกเลี่ยง 400 error

---

### 5.6 Agent Skills

ไฟล์: `backend/src/agents/skills.ts` และ `backend/workspace/skills/`

- Skill เป็น Markdown (`SKILL.md`) แก้ไขได้ใน UI
- หมวดหมู่หลัก:
  - `script-rewriter/` — กฎการเขียนบท
  - `extractor/` — กฎการสกัด entity
  - `storyboard-breaker/continuity/` — ความต่อเนื่องระหว่าง shot
  - `prompt-generator/character-prompt/`, `scene-prompt/`, `prop-prompt/`, `video-prompt/` — กฎ prompt
- ระบบรวม skill เข้ากับ system prompt เมื่อ agent ทำงาน



---

### 5.7 Generation Service

ไฟล์: `backend/src/services/generation.ts`

- ใช้ตาราง `sys_task` เป็น **unified task queue** สำหรับ image/video
- สถานะ: `processing` → `completed` / `failed`
- Flow: validate AI config → `createTask` → เรียก adapter → poll ผลลัพธ์ → download → update DB
- Poll profile:
  - Image: 5 วิ × 120 ครั้ง (สูงสุด ~10 นาที)
  - Video: 10 วิ × 300 ครั้ง

#### Adapters (`backend/src/services/adapters/`)

| Adapter | Provider | ชนิด |
|---------|----------|------|
| `openai-image.ts` | OpenAI-compatible | รูป |
| `gemini-image.ts` | Google Gemini | รูป |
| `volcengine-image.ts` | Volcano Engine | รูป |
| `google-flow-image.ts` | Google (flow) | รูป |
| `volcengine-video.ts` | Volcano Engine Seedance 2.0 | วิดีโอ |
| `minimax-video.ts` | MiniMax H3 | วิดีโอ |
| `aliyun-wan-video.ts` | Alibaba Wan 3.0 | วิดีโอ |

- `registry.ts` เลือก adapter จาก `provider` ใน `ai_service_configs`
- รองรับ fallback ไปยัง active config ถ้า config_id ระบุไม่ได้ผล

---

### 5.8 FFmpeg Merge Service

ไฟล์: `backend/src/services/ffmpeg-merge.ts`

- รับ `episode_id` และ optional `storyboardIds`
- ดึง storyboards เรียงตาม `storyboardNumber` ข้าม shot ที่ยังไม่มี video
- ตรวจ `ffmpeg`/`ffprobe` ก่อนรัน
- สร้าง concat list แล้วรัน `ffmpeg -f concat -safe 0`
- Output: `static/merged/<uuid>.mp4` (libx264 + aac + faststart)
- Update `video_merges` และ `episodes.videoUrl`

---

### 5.9 Storage & Paths

ไฟล์: `backend/src/utils/paths.ts`

- `DATA_ROOT`:
  - Dev: `<repoRoot>/data`
  - Docker/Desktop: จาก `HUOBAO_DATA_DIR`
- `STORAGE_ROOT`:
  - จาก `STORAGE_PATH` หรือ `<DATA_ROOT>/static`
- ไฟล์ media เก็บเป็น relative path (`static/...`)
- R2/S3 upload จัดการใน `utils/r2-storage.ts`



---

## 6. Frontend โดยละเอียด

### 6.1 Nuxt Config และ Routing

ไฟล์: `frontend/nuxt.config.ts`

- `ssr: false` — SPA ล้วน
- `srcDir: 'app/'` — โค้ด Vue อยู่ใน `frontend/app/`
- `baseURL` ค่าเริ่มต้น `/storyvdo/`
- Dynamic routes ลงทะเบียนด้วย hook `pages:extend` เพื่อหลีกเลี่ยงชื่อไฟล์ `[id]`:
  - `/drama/:id` → `views/drama/detail.vue`
  - `/drama/:id/story` → `views/drama/story.vue`
  - `/drama/:id/episode/:episodeNumber` → `views/drama/episode.vue`
- Dev proxy: `/storyvdo/api`, `/storyvdo/static`, `/api`, `/static` → backend port 5679

### 6.2 Pages / Views

| View | URL | หน้าที่ |
|------|-----|---------|
| `pages/index.vue` | `/` | รายการ drama / projects |
| `views/drama/detail.vue` | `/drama/:id` | ภาพรวม drama, episodes |
| `views/drama/story.vue` | `/drama/:id/story` | Story mode (outline/novel input) |
| `views/drama/episode.vue` | `/drama/:id/episode/:n` | **Studio หลัก**: pipeline script → export |
| `pages/settings.vue` | `/settings` | AI provider, app settings |

### 6.3 Composables หลัก

| Composable | หน้าที่ |
|------------|---------|
| `useApi.ts` | ห่อ fetch ทั้งหมด ใช้ relative path |
| `useAgent.ts` | Chat กับ Mastra agents |
| `useAuth.ts` | จัดการ user/session |
| `useMedia.ts` | แปลง/โหลด media URL |
| `useTheme.ts` | Dark/light/system theme |
| `useToast.ts` | Toast notifications |
| `useTour.ts` | Driver.js onboarding tour |
| `useDesktopBridge.ts` | สื่อสารกับ Electron main process |
| `useUnifiedLanguage.ts` | ภาษา UI และ AI content |

### 6.4 i18n

- `frontend/app/locales/zh.json`, `en.json`, `ja.json`, `ko.json`, `th.json`
- ภาษา UI และภาษาของ AI content ควบคุมผ่าน setting เดียวกัน

### 6.5 Styling

- ไม่ใช้ Tailwind / Element Plus
- ใช้ `frontend/app/assets/studio.css` เป็น design system
- UI components อยู่ใน `frontend/app/components/`



---

## 7. Desktop (Electron) โดยละเอียด

ไฟล์: `desktop/src/main.ts`

### 7.1 หน้าที่ของ Main Process

1. **Single instance lock** — ป้องกันเปิดซ้ำ (SQLite เขียนตีกัน)
2. **Free port allocation** — หาพอร์ตว่างบน `127.0.0.1`
3. **Storage config** — อ่าน `<userData>/storage-config.json` หาที่เก็บข้อมูล
4. **Workspace template sync** — คัดลอก `backend/workspace` ไปยัง user data แบบ copy-once + version marker; prompts ถูก overwrite, skills merge เท่านั้น
5. **Fork backend** — `utilityProcess.fork(BACKEND_BUNDLE)` พร้อม env:
   - `HUOBAO_DESKTOP=1`
   - `HUOBAO_DATA_DIR`, `SQLITE_PATH`, `WORKSPACE_PATH`, `FRONTEND_DIST`
   - `FFMPEG_BIN`, `FFPROBE_BIN`
6. **Health poll** — รอ backend `/api/v1/health`
7. **Open BrowserWindow** — โหลด `http://127.0.0.1:<backendPort>`
8. **Updater & migrate IPC**

### 7.2 Build Pipeline

| Script | ผลลัพธ์ |
|--------|---------|
| `build:backend` | espack backend → `build/backend.mjs` |
| `build:main` | espack main → `dist/main.js` |
| `rebuild:native` | คอมไพล์ native modules ตาม ABI Electron |
| `dev` | build backend + main + เปิด Electron |
| `dist` | macOS dmg |
| `dist:win` | Windows installer |

### 7.3 Data Directory

- Packaged: `~/Library/Application Support/HuobaoDrama/` (macOS) หรือ `%APPDATA%/HuobaoDrama/` (Windows)
- Dev: `HuobaoDrama-Dev/` (แยกจาก packaged)

---

## 8. Worker / GPU Rendering

ไฟล์: `worker/colab_worker.py`

- Worker standalone เชื่อมต่อ Huobao server ผ่าน HTTP
- Poll งานจาก `GET /api/v1/worker/jobs/poll`
- Render วิดีโอด้วย diffusers pipeline เช่น `ali-vilab/text-to-video-ms-1.7b`
- อัปโหลดผลลัพธ์ไปยัง Cloudflare R2 (หรือ presigned URL)
- แจ้งผลลัพธ์กลับผ่าน `POST /api/v1/worker/jobs/:task_id/complete` หรือ `/fail`
- รองรับ Google Colab / Kaggle / Vast.ai

---

## 9. Docker & Deployment

ไฟล์: `docker-compose.yml`, `Dockerfile`

### 9.1 Docker Compose Services

- `app` — Huobao Drama container (node:22 + backend + frontend-dist) รับ port `5679`
- `api` — new-api sidecar (Postgres + Redis)
- `redis` — Redis with requirepass
- `postgres` — PostgreSQL 15

ควรเปลี่ยนรหัสผ่าน Redis/Postgres ใน production

### 9.2 Dockerfile Highlights

- Base: `node:22-bookworm-slim`
- คัดลอก `ffmpeg`/`ffprobe` จาก `mwader/static-ffmpeg:latest`
- `npm ci --omit=dev` สำหรับ backend
- คัดลอก `backend/src`, `workspace-template`, `frontend/dist`, `worker/`
- Healthcheck: `/storyvdo/api/v1/health`

### 9.3 Pre-deploy Checklist

1. สร้าง `frontend/dist` ด้วย `cd frontend && npm run generate`
2. กำหนด `.env` พร้อมตัวแปรที่จำเป็น
3. `docker build -t huobao-drama:storyvdo .`
4. `docker compose up -d`



---

## 10. ตัวแปรสภาพแวดล้อม (Environment Variables)

### Root / Docker

| ตัวแปร | ตัวอย่าง | คำอธิบาย |
|--------|---------|----------|
| `HUOBAO_VERSION` | `4.0.8` | เวอร์ชันแอป |
| `WATCHTOWER_TOKEN` | `please-change-me` | Watchtower API token; เปลี่ยนใน production |

### Backend

| ตัวแปร | ตัวอย่าง | คำอธิบาย |
|--------|---------|----------|
| `NODE_ENV` | `production` | โหมด |
| `PORT` | `5679` | พอร์ต HTTP |
| `NUXT_APP_BASE_URL` | `/storyvdo/` | baseURL frontend |
| `PUBLIC_BASE_URL` | `https://www.toraapi.com/storyvdo` | URL สาธารณะสำหรับ reference resources |
| `HUOBAO_DATA_DIR` | `/app/data` | รากข้อมูล |
| `SQLITE_PATH` | `/app/data/huobao.sqlite3` | ที่อยู่ SQLite |
| `STORAGE_PATH` | — | override static root |
| `WORKSPACE_PATH` | `/app/data/workspace` | Agent workspace |
| `FRONTEND_DIST` | `/app/frontend-dist` | frontend static build |
| `FFMPEG_BIN` | `/usr/local/bin/ffmpeg` | ffmpeg binary |
| `FFPROBE_BIN` | `/usr/local/bin/ffprobe` | ffprobe binary |
| `AI_DISABLE_THINKING` | `true` | ปิด thinking mode กับ new-api proxies |
| `AI_THINKING_OFF_PATCH` | JSON | override thinking-off params |

### API Sidecar (docker-compose)

| ตัวแปร | ตัวอย่าง | คำอธิบาย |
|--------|---------|----------|
| `SQL_DSN` | `postgresql://...` | Postgres DSN |
| `REDIS_CONN_STRING` | `redis://...` | Redis connection |
| `ERROR_LOG_ENABLED` | `true` | เปิด error log |
| `BATCH_UPDATE_ENABLED` | `true` | เปิด batch update |

---

## 11. คำสั่งในการพัฒนา

### Root

```bash
npm run dev             # backend + frontend  concurrently
npm run dev:backend     # backend only
npm run dev:frontend    # frontend only
npm run dev:desktop     # desktop dev
npm run build:frontend  # generate static frontend
npm run dist            # desktop dmg
```

### Backend

```bash
cd backend
npm run dev          # tsx watch port 5679
npm start           # tsx production
npm run typecheck
npm run backfill-artwork
```

### Frontend

```bash
cd frontend
npm run dev          # port 3013
npm run generate     # static site (ใช้ deploy)
npm run build        # Nuxt build (ไม่มี index.html)
npm run preview
```

### Desktop

```bash
cd desktop
npm run dev                   # build + เปิด Electron
npm run build:backend
npm run build:main
npm run rebuild:native        # rebuild native modules
npm run dist                  # macOS dmg
npm run dist:win              # Windows installer
```



---

## 12. กระแสข้อมูล / Pipeline หลัก

```
[Input: นิยาย / คำสรุป / outline]
        ↓
1. script_rewriter → สร้าง / แก้ไข 剧本 formatted
        ↓
2. extractor → สกัด characters, scenes, props + deduplicate
        ↓
3. prompt_generator → สร้าง final_prompt สำหรับรูป
        ↓
4. Image Generation → รูป reference ตัวละคร / ฉาก / prop
        ↓
5. storyboard_breaker → แยก剧本เป็น shots
        ↓
6. Video Generation → วิดีโอแต่ละ shot
        ↓
7. FFmpeg Merge → ต่อ shots เป็น episode .mp4
```

### Task Queue ที่เกี่ยวข้อง

- `POST /api/v1/tasks { type: "image" }`
- `POST /api/v1/tasks { type: "video" }`
- `POST /api/v1/merge { episode_id }`

---

## 13. หมายเหตุและข้อควรระวัง

1. **Frontend static build** — ใช้ `npm run generate` สำหรับ deploy; `npm run build` ไม่สร้าง `index.html`
2. **baseURL** — ค่าเริ่มต้น `/storyvdo/` ต้องตรงกันทั้ง frontend/backend
3. **Desktop dev vs packaged** — ใช้ userData คนละที่ (`HuobaoDrama` vs `HuobaoDrama-Dev`)
4. **Native modules** — เมื่อ upgrade Electron ต้องรัน `npm run rebuild:native`
5. **FFmpeg availability** — backend ตรวจสอบก่อน merge
6. **AI_DISABLE_THINKING** — default `true` เพื่อให้ทำงานได้กับ new-api จีน
7. **configs/ ไม่ใช้แล้ว** — เป็น legacy; การตั้งค่าอยู่ในฐานข้อมูล
8. **SQLite WAL** — เก็บ DB ใน volume ที่มี write permission
9. **Startup task cleanup** — `sys_task` ที่ยัง `processing` ถูก reset เป็น `failed` ที่ startup
10. **GPU Worker setup** — ติดตั้ง `diffusers transformers accelerate boto3 requests pillow imageio imageio-ffmpeg` ก่อนรัน `colab_worker.py`

---

## 14. สรุป

Huobao Drama เป็นระบบผลิต短剧แบบ end-to-end ที่ใช้ AI agents ควบคุม pipeline ทั้งหมด ตั้งแต่剧本改写จนถึง export วิดีโอ ประกอบด้วย Nuxt SPA frontend, Hono backend, SQLite data layer, Mastra agent runtime, FFmpeg post-processing, และ Electron desktop shell สำหรับใช้งานบนเครื่อง

เอกสารฉบับนี้จัดทำโดยตรงจากการสำรวจ codebase ที่ `/Users/noppanan/huobao-drama` เพื่อให้ทีมพัฒนาเข้าใจโครงสร้าง การตั้งค่า และ flow ของระบบได้อย่างรวดเร็ว

*หมายเหตุ: เนื่องจากไม่พบ skill `understand` ที่ติดตั้งอยู่ในระบบ เอกสารนี้จึงจัดทำขึ้นโดยตรงจากการสำรวจโปรเจคด้วยเครื่องมือที่มีอยู่*

