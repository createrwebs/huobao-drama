import Database from 'better-sqlite3'
import path from 'path'

const dbPath = path.resolve('..', 'data', 'huobao.sqlite3')
console.log('Connecting to db at:', dbPath)
const db = new Database(dbPath)

const workingKey = 'V9udfhPBGv7M14NF0gwpqplBhJGO7KF11253ZDJgJTk2Icct'

// 1. Update Config 4 (Text: ToraAPI)
db.prepare("UPDATE ai_service_configs SET api_key = ?, model = ?, is_active = 1, is_default = 1, priority = 155 WHERE id = 4").run(
  workingKey,
  JSON.stringify(['qwen-plus', 'qwen3.8-max', 'qwen3.8-flash', 'claude-sonnet-5', 'gpt-6.1-sol'])
)

// 2. Update Config 5 (Image: ToraAPI)
db.prepare("UPDATE ai_service_configs SET api_key = ?, model = ?, is_active = 1, is_default = 1, priority = 155 WHERE id = 5").run(
  workingKey,
  JSON.stringify(['wan2.7-image', 'qwen-image-2.0', 'qwen-image-3.0', 'dall-e-3'])
)

// 3. Update Config 9 (Video: ToraAPI)
db.prepare("UPDATE ai_service_configs SET api_key = ?, model = ?, is_active = 1, is_default = 1, priority = 155 WHERE id = 9").run(
  workingKey,
  JSON.stringify(['wan3.0-video', 'wan3.0-video-prime'])
)

// 4. Update episode 1 to use Tora configs
db.prepare("UPDATE episodes SET image_config_id = 5, video_config_id = 9 WHERE id = 1").run()

console.log('--- UPDATED AI CONFIGS ---')
console.table(db.prepare('SELECT id, service_type, provider, name, is_active, is_default, priority, model FROM ai_service_configs').all())

console.log('--- UPDATED EPISODES ---')
console.table(db.prepare('SELECT id, drama_id, episode_number, title, image_config_id, video_config_id FROM episodes').all())
