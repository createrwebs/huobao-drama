import Database from 'better-sqlite3'

const db = new Database('../data/huobao.sqlite3')
const row4 = db.prepare('SELECT api_key FROM ai_service_configs WHERE id = 4').get() as { api_key?: string } | undefined
const key = row4?.api_key || ''

// Update text config 4
db.prepare(`
  UPDATE ai_service_configs
  SET name = 'ToraAPI · ข้อความ (Qwen / Chat)',
      model = ?
  WHERE id = 4
`).run(JSON.stringify(['qwen-plus', 'qwen3.8-max', 'qwen3.8-flash', 'gpt-6.1-sol', 'claude-sonnet-5']))

// Update image config 5
db.prepare(`
  UPDATE ai_service_configs
  SET name = 'ToraAPI · รูปภาพ (Wan / Qwen Image)',
      model = ?
  WHERE id = 5
`).run(JSON.stringify(['wan2.7-image', 'qwen-image-2.0', 'qwen-image-3.0', 'dall-e-3', 'gpt-image-2']))

// Check if Tora video config exists
const existingVideo = db.prepare("SELECT id FROM ai_service_configs WHERE service_type = 'video' AND provider = 'openai'").get() as { id: number } | undefined
if (existingVideo) {
  db.prepare(`
    UPDATE ai_service_configs
    SET name = 'ToraAPI · วิดีโอ (Wan 3.0 Video)',
        base_url = 'https://www.toraapi.com',
        model = ?,
        api_key = ?,
        is_active = 1,
        priority = 105
    WHERE id = ?
  `).run(JSON.stringify(['wan3.0-video', 'wan3.0-video-prime']), key, existingVideo.id)
  console.log('Updated existing video config id:', existingVideo.id)
} else {
  const ts = Math.floor(Date.now() / 1000)
  const info = db.prepare(`
    INSERT INTO ai_service_configs (service_type, provider, name, base_url, api_key, model, priority, is_active, is_default, created_at, updated_at)
    VALUES ('video', 'openai', 'ToraAPI · วิดีโอ (Wan 3.0 Video)', 'https://www.toraapi.com', ?, ?, 105, 1, 0, ?, ?)
  `).run(key, JSON.stringify(['wan3.0-video', 'wan3.0-video-prime']), ts, ts)
  console.log('Created new video config id:', info.lastInsertRowid)
}

const rows = db.prepare('SELECT id, service_type, provider, name, base_url, model, is_active FROM ai_service_configs').all()
console.table(rows)
