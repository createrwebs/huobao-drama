import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { Hono } from 'hono'

test('A3: Complete End-to-End Ownership Enforcement & Tenant Isolation Matrix', async (t) => {
  // Set isolated SQLite path and server mode BEFORE importing backend modules
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'huobao-a3-test-'))
  const testDbPath = path.join(tmpDir, 'test.sqlite3')
  process.env.SQLITE_PATH = testDbPath
  process.env.HUOBAO_SERVER_MODE = 'true'
  process.env.HUOBAO_DESKTOP = '0'

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    delete process.env.SQLITE_PATH
    delete process.env.HUOBAO_SERVER_MODE
  })

  // Dynamic import of db and schema
  const { db, schema } = await import('../src/db/index.js')
  const { authMiddleware } = await import('../src/middleware/auth.js')
  const { generateSessionToken, hashSessionToken, encryptCredential } = await import('../src/utils/crypto.js')
  const { default: dramasRoute } = await import('../src/routes/dramas.js')
  const { default: episodesRoute } = await import('../src/routes/episodes.js')
  const { default: storyboardsRoute } = await import('../src/routes/storyboards.js')
  const { default: charactersRoute } = await import('../src/routes/characters.js')
  const { default: scenesRoute } = await import('../src/routes/scenes.js')
  const { default: propsRoute } = await import('../src/routes/props.js')
  const { default: tasksRoute } = await import('../src/routes/tasks.js')
  const { default: mergeRoute } = await import('../src/routes/merge.js')
  const { default: aiConfigsRoute } = await import('../src/routes/aiConfigs.js')
  const { default: agentRoute } = await import('../src/routes/agent.js')
  const { flowBridge: flowBridgeRoute } = await import('../src/routes/flowBridge.js')
  const { default: storageRoute } = await import('../src/routes/storage.js')
  const { default: skillsRoute } = await import('../src/routes/skills.js')

  // 1. Seed two distinct users: User A (101) and User B (102)
  const now = new Date().toISOString()
  await db.insert(schema.users).values([
    {
      id: 101,
      issuer: 'https://www.toraapi.com',
      externalUserId: 1,
      username: 'user_a',
      displayName: 'User A',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 102,
      issuer: 'https://www.toraapi.com',
      externalUserId: 2,
      username: 'user_b',
      displayName: 'User B',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ])

  // 2. Create active sessions for User A and User B
  const tokenA = generateSessionToken()
  const tokenB = generateSessionToken()
  const farFuture = new Date(Date.now() + 86400000).toISOString()

  await db.insert(schema.authSessions).values([
    {
      sessionTokenHash: hashSessionToken(tokenA),
      userId: 101,
      tokenId: 11,
      encryptedCredential: encryptCredential('sk-userA'),
      createdAt: now,
      expiresAt: farFuture,
    },
    {
      sessionTokenHash: hashSessionToken(tokenB),
      userId: 102,
      tokenId: 22,
      encryptedCredential: encryptCredential('sk-userB'),
      createdAt: now,
      expiresAt: farFuture,
    },
  ])

  // 3. Assemble the test application with all guarded routes
  const app = new Hono()
  app.use('*', authMiddleware)
  app.route('/api/v1/dramas', dramasRoute)
  app.route('/api/v1/episodes', episodesRoute)
  app.route('/api/v1/storyboards', storyboardsRoute)
  app.route('/api/v1/characters', charactersRoute)
  app.route('/api/v1/scenes', scenesRoute)
  app.route('/api/v1/props', propsRoute)
  app.route('/api/v1/tasks', tasksRoute)
  app.route('/api/v1/merge', mergeRoute)
  app.route('/api/v1/ai-configs', aiConfigsRoute)
  app.route('/api/v1/agent', agentRoute)
  app.route('/api/v1/flow-bridge', flowBridgeRoute)
  app.route('/api/v1/storage', storageRoute)
  app.route('/api/v1/skills', skillsRoute)

  const headersA = {
    Authorization: `Bearer ${tokenA}`,
    'Content-Type': 'application/json',
  }
  const headersB = {
    Authorization: `Bearer ${tokenB}`,
    'Content-Type': 'application/json',
  }

  // 4. User A creates Drama A
  const createDramaRes = await app.request('/api/v1/dramas', {
    method: 'POST',
    headers: headersA,
    body: JSON.stringify({ title: 'Drama A by Tenant A' }),
  })
  assert.equal(createDramaRes.status, 201)
  const dramaA = (await createDramaRes.json()).data
  assert.equal(dramaA.owner_user_id, 101)

  // 5. User B creates Drama B
  const createDramaBRes = await app.request('/api/v1/dramas', {
    method: 'POST',
    headers: headersB,
    body: JSON.stringify({ title: 'Drama B by Tenant B' }),
  })
  assert.equal(createDramaBRes.status, 201)
  const dramaB = (await createDramaBRes.json()).data
  assert.equal(dramaB.owner_user_id, 102)

  // 6. User A adds Episode A to Drama A
  const createEpRes = await app.request('/api/v1/episodes', {
    method: 'POST',
    headers: headersA,
    body: JSON.stringify({ drama_id: dramaA.id, title: 'Episode 1 of Drama A', episode_number: 1 }),
  })
  assert.equal(createEpRes.status, 200)
  const epA = (await createEpRes.json()).data

  // 7. User A creates Storyboard A in Episode A
  const createSbRes = await app.request('/api/v1/storyboards', {
    method: 'POST',
    headers: headersA,
    body: JSON.stringify({ episode_id: epA.id, storyboard_num: 1, description: 'Shot 1' }),
  })
  assert.equal(createSbRes.status, 201)
  const sbA = (await createSbRes.json()).data

  // 8. User A creates Character A, Scene A, Prop A
  const createCharRes = await app.request('/api/v1/characters', {
    method: 'POST',
    headers: headersA,
    body: JSON.stringify({ drama_id: dramaA.id, name: 'Hero A' }),
  })
  assert.equal(createCharRes.status, 201)
  const charA = (await createCharRes.json()).data

  const createSceneRes = await app.request('/api/v1/scenes', {
    method: 'POST',
    headers: headersA,
    body: JSON.stringify({ drama_id: dramaA.id, location: 'Scene Palace' }),
  })
  assert.equal(createSceneRes.status, 201)
  const sceneA = (await createSceneRes.json()).data

  const createPropRes = await app.request('/api/v1/props', {
    method: 'POST',
    headers: headersA,
    body: JSON.stringify({ drama_id: dramaA.id, name: 'Sword' }),
  })
  assert.equal(createPropRes.status, 201)
  const propA = (await createPropRes.json()).data

  // 9. User A creates an AIConfig A
  const createCfgRes = await app.request('/api/v1/ai-configs', {
    method: 'POST',
    headers: headersA,
    body: JSON.stringify({
      service_type: 'text',
      provider: 'openai',
      name: 'User A OpenAI',
      base_url: 'https://api.openai.com',
      api_key: 'sk-userA-super-secret-key-12345',
      model: ['gpt-4o'],
    }),
  })
  assert.equal(createCfgRes.status, 201)
  const cfgA = (await createCfgRes.json()).data
  assert.equal(cfgA.owner_user_id, 101)
  // Ensure raw API key is never returned to client!
  assert.notEqual(cfgA.api_key, 'sk-userA-super-secret-key-12345')
  assert.match(cfgA.api_key, /sk-\.\.\./)

  // 10. Seed a task owned by User A
  const [taskA] = await db.insert(schema.sysTask).values({
    ownerUserId: 101,
    dramaId: dramaA.id,
    storyboardId: sbA.id,
    type: 'video',
    provider: 'openai',
    prompt: 'A cinematic shot',
    model: 'sora',
    status: 'completed',
    resultUrl: 'videos/shot1.mp4',
    createdAt: now,
    updatedAt: now,
  }).returning()

  // Seed an unowned legacy drama (ownerUserId = null)
  const [legacyDrama] = await db.insert(schema.dramas).values({
    ownerUserId: null,
    title: 'Legacy Unowned Drama',
    createdAt: now,
    updatedAt: now,
  }).returning()

  /* =========================================================================
     CROSS-TENANT ACCESS PROBING MATRIX: User B attempts to access User A's data
     ========================================================================= */

  // 1. Probing Drama List
  const listDramasB = await app.request('/api/v1/dramas', { headers: headersB })
  assert.equal(listDramasB.status, 200)
  const dramaListB = (await listDramasB.json()).data.items
  assert.equal(dramaListB.length, 1)
  assert.equal(dramaListB[0].id, dramaB.id) // Only sees Drama B! Legacy unowned and Drama A hidden!

  // 2. Probing Drama Detail / Update / Delete
  const getDramaA = await app.request(`/api/v1/dramas/${dramaA.id}`, { headers: headersB })
  assert.equal(getDramaA.status, 404) // Returns 404, not 200 or 403

  const updateDramaA = await app.request(`/api/v1/dramas/${dramaA.id}`, {
    method: 'PUT',
    headers: headersB,
    body: JSON.stringify({ name: 'Hacked by B' }),
  })
  assert.equal(updateDramaA.status, 404)

  const deleteDramaA = await app.request(`/api/v1/dramas/${dramaA.id}`, {
    method: 'DELETE',
    headers: headersB,
  })
  assert.equal(deleteDramaA.status, 404)

  // 3. Probing Legacy Unowned Drama in server mode
  const getLegacy = await app.request(`/api/v1/dramas/${legacyDrama.id}`, { headers: headersB })
  assert.equal(getLegacy.status, 404) // Unowned is NOT public!

  // 4. Probing Episodes
  const getEpA = await app.request(`/api/v1/episodes/${epA.id}`, { headers: headersB })
  assert.equal(getEpA.status, 404)

  // User B tries to forge parent drama_id to inject episode into Drama A
  const injectEp = await app.request('/api/v1/episodes', {
    method: 'POST',
    headers: headersB,
    body: JSON.stringify({ drama_id: dramaA.id, title: 'Injected Episode', episode_number: 2 }),
  })
  assert.equal(injectEp.status, 404)

  // 5. Probing Storyboards
  const getSbA = await app.request(`/api/v1/storyboards/${sbA.id}`, { headers: headersB })
  assert.equal(getSbA.status, 404)

  const updateSbA = await app.request(`/api/v1/storyboards/${sbA.id}`, {
    method: 'PUT',
    headers: headersB,
    body: JSON.stringify({ description: 'Hacked Shot' }),
  })
  assert.equal(updateSbA.status, 404)

  const deleteSbA = await app.request(`/api/v1/storyboards/${sbA.id}`, {
    method: 'DELETE',
    headers: headersB,
  })
  assert.equal(deleteSbA.status, 404)

  // User B tries to inject storyboard into Episode A
  const injectSb = await app.request('/api/v1/storyboards', {
    method: 'POST',
    headers: headersB,
    body: JSON.stringify({ episode_id: epA.id, storyboard_num: 2, description: 'Injected' }),
  })
  assert.equal(injectSb.status, 404)

  // 6. Probing Characters, Scenes, Props
  const getCharA = await app.request(`/api/v1/characters/${charA.id}`, { headers: headersB })
  assert.equal(getCharA.status, 404)

  const injectChar = await app.request('/api/v1/characters', {
    method: 'POST',
    headers: headersB,
    body: JSON.stringify({ drama_id: dramaA.id, name: 'Forged Character' }),
  })
  assert.equal(injectChar.status, 404)

  const injectScene = await app.request('/api/v1/scenes', {
    method: 'POST',
    headers: headersB,
    body: JSON.stringify({ drama_id: dramaA.id, location: 'Forged Scene' }),
  })
  assert.equal(injectScene.status, 404)

  const injectProp = await app.request('/api/v1/props', {
    method: 'POST',
    headers: headersB,
    body: JSON.stringify({ drama_id: dramaA.id, name: 'Forged Prop' }),
  })
  assert.equal(injectProp.status, 404)

  // 7. Probing Tasks
  const getTaskA = await app.request(`/api/v1/tasks/${taskA.id}`, { headers: headersB })
  assert.equal(getTaskA.status, 404)

  const listTasksB = await app.request('/api/v1/tasks', { headers: headersB })
  assert.equal(listTasksB.status, 200)
  const taskListB = (await listTasksB.json()).data
  assert.equal(taskListB.length, 0) // Cannot see Task A

  const deleteTaskA = await app.request(`/api/v1/tasks/${taskA.id}`, {
    method: 'DELETE',
    headers: headersB,
  })
  assert.equal(deleteTaskA.status, 404)

  // User B tries to submit a task referencing Storyboard A
  const submitForgedTask = await app.request('/api/v1/tasks', {
    method: 'POST',
    headers: headersB,
    body: JSON.stringify({
      type: 'image',
      storyboard_id: sbA.id,
      prompt: 'Malicious generation',
    }),
  })
  assert.equal(submitForgedTask.status, 404)

  // 8. Probing Merges
  const getMergeA = await app.request(`/api/v1/merge/episodes/${epA.id}/merge`, { headers: headersB })
  assert.equal(getMergeA.status, 404)

  const listMergesA = await app.request(`/api/v1/merge/episodes/${epA.id}/merges`, { headers: headersB })
  assert.equal(listMergesA.status, 404)

  const postMergeA = await app.request(`/api/v1/merge/episodes/${epA.id}/merge`, {
    method: 'POST',
    headers: headersB,
    body: JSON.stringify({}),
  })
  assert.equal(postMergeA.status, 404)

  // User B creates Episode B
  const epBRes = await app.request('/api/v1/episodes', {
    method: 'POST',
    headers: headersB,
    body: JSON.stringify({ drama_id: dramaB.id, title: 'Episode B', episode_number: 1 }),
  })
  const epB = (await epBRes.json()).data

  // User B attempts to merge Episode B with injected Storyboard A (cross-tenant storyboard inclusion attack)
  const injectSbMerge = await app.request(`/api/v1/merge/episodes/${epB.id}/merge`, {
    method: 'POST',
    headers: headersB,
    body: JSON.stringify({ storyboard_ids: [sbA.id] }),
  })
  assert.equal(injectSbMerge.status, 400) // Rejected as badRequest ('部分镜头不属于该剧集')

  // 9. Probing AI Configs
  const listConfigsB = await app.request('/api/v1/ai-configs', { headers: headersB })
  assert.equal(listConfigsB.status, 200)
  const configsB = (await listConfigsB.json()).data
  assert.equal(configsB.length, 0) // Cannot see Config A

  const getCfgA = await app.request(`/api/v1/ai-configs/${cfgA.id}`, { headers: headersB })
  assert.equal(getCfgA.status, 404)

  const updateCfgA = await app.request(`/api/v1/ai-configs/${cfgA.id}`, {
    method: 'PUT',
    headers: headersB,
    body: JSON.stringify({ name: 'Hacked Config' }),
  })
  assert.equal(updateCfgA.status, 404)

  const deleteCfgA = await app.request(`/api/v1/ai-configs/${cfgA.id}`, {
    method: 'DELETE',
    headers: headersB,
  })
  assert.equal(deleteCfgA.status, 404)

  // 10. Probing Agent Chat
  const chatProbe = await app.request('/api/v1/agent/script_rewriter/chat', {
    method: 'POST',
    headers: headersB,
    body: JSON.stringify({
      drama_id: dramaA.id,
      episode_id: epA.id,
      message: 'Give me the script',
    }),
  })
  assert.equal(chatProbe.status, 404)

  // 11. Probing Flow Bridge in Server Mode
  const flowAccountsProbe = await app.request('/api/v1/flow-bridge/accounts', { headers: headersB })
  assert.equal(flowAccountsProbe.status, 403) // Forbidden in server mode

  const flowRefProbe = await app.request(`/api/v1/flow-bridge/character-refs/${dramaA.id}`, { headers: headersB })
  assert.equal(flowRefProbe.status, 404)

  const flowApplyProbe = await app.request('/api/v1/flow-bridge/apply-to-storyboard', {
    method: 'POST',
    headers: headersB,
    body: JSON.stringify({
      storyboard_id: sbA.id,
      video_url: 'videos/flow.mp4',
    }),
  })
  assert.equal(flowApplyProbe.status, 404)

  // 12. Storage Path Redaction in Server Mode
  const storageRes = await app.request('/api/v1/storage', { headers: headersB })
  assert.equal(storageRes.status, 200)
  const storageData = (await storageRes.json()).data
  assert.equal(storageData.sqlitePath, undefined)
  assert.equal(storageData.dataDir, undefined)
  assert.equal(storageData.storageRoot, undefined)

  // 13. Skills Tampering Prevention in Server Mode
  const skillPutRes = await app.request('/api/v1/skills/screenplay', {
    method: 'PUT',
    headers: headersB,
    body: JSON.stringify({ content: 'Malicious prompt injection' }),
  })
  assert.equal(skillPutRes.status, 400) // Blocked in server mode
})
