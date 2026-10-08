import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-reference-test-'))
process.env.FLOW_ENGINE_DIR = root
process.env.SQLITE_PATH = path.join(root, 'app.sqlite3')
fs.mkdirSync(path.join(root, 'bin'))
fs.mkdirSync(path.join(root, 'cookies'))
fs.mkdirSync(path.join(root, 'data'))
const binary = path.join(root, 'bin', process.platform === 'darwin' ? 'flow-macos' : 'flow-linux')
fs.writeFileSync(binary, `#!/bin/sh\nprintf '%s\\n' "$@" > "${root}/generate-args"\necho 'fixture generation stopped' >&2\nexit 1\n`, { mode: 0o755 })
const helper = path.join(root, 'bin', 'flow-reference-helper')
fs.writeFileSync(helper, `#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
const root = process.cwd(); const args = process.argv.slice(2);
const value = key => args[args.indexOf(key) + 1];
fs.appendFileSync(path.join(root, 'uploads-log'), 'upload\\n');
if (fs.existsSync(path.join(root, 'fail-upload'))) process.exit(1);
const cookie = value('--cookies');
const account = path.basename(cookie).replace(/^account_/, '').replace(/\\.json$/, '');
const result = {media_id: 'server-media-' + fs.readFileSync(path.join(root, 'uploads-log'), 'utf8').trim().split('\\n').length, account_id: 'acct-' + account, project_id: value('--project')};
if (fs.existsSync(path.join(root, 'wrong-project'))) result.project_id = 'wrong';
setTimeout(() => console.log(JSON.stringify(result)), 20);
`, { mode: 0o755 })
function account(id: string, project: string) {
  const file = path.join(root, 'cookies', `account_${id}.json`)
  fs.writeFileSync(file, JSON.stringify({ project_id: project, cookies: [{ name: 'test', value: 'fixture' }] }))
  fs.utimesSync(file, new Date(), new Date(Date.now() + 100))
}
account('aaaa', 'project-a')
const image = path.join(root, 'character.png')
fs.writeFileSync(image, 'fixture-image')
const { db, schema } = await import('../src/db/index.js')
const refs = await import('../src/services/flow-character-ref.js')
const flow = await import('../src/services/flow-engine.js')
const upload = await import('../src/services/flow-reference-upload.js')
const { eq } = await import('drizzle-orm')
const timestamp = new Date().toISOString()
await db.insert(schema.characters).values({ id: 1, dramaId: 1, name: 'ทิน', imageUrl: image, referenceImages: JSON.stringify({ custom: 'preserve', flow: { synced: true, media_id: 'acct-fake', image_url: image } }), createdAt: timestamp, updatedAt: timestamp })
await db.insert(schema.storyboardCharacters).values({ storyboardId: 1, characterId: 1 })
const count = () => fs.existsSync(path.join(root, 'uploads-log')) ? fs.readFileSync(path.join(root, 'uploads-log'), 'utf8').trim().split('\n').length : 0

test('character references use genuine uploads and a content/account/project cache', async t => {
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await t.test('legacy fake metadata is not a successful sync', async () => {
    assert.equal((await refs.getDramaCharacterRefs(1)).all_synced, false)
  })
  await t.test('upload once, preserve metadata, and reuse on another request', async () => {
    assert.equal((await refs.syncDramaCharacterRefsToFlow(1)).all_synced, true)
    await refs.syncDramaCharacterRefsToFlow(1)
    assert.equal(count(), 1)
    const row = (await db.select().from(schema.characters))[0]
    const meta = JSON.parse(row.referenceImages!)
    assert.equal(meta.custom, 'preserve')
    assert.equal(meta.flow.media_id, 'server-media-1')
  })
  await t.test('video uses direct files without depending on manual sync cache', async () => {
    await assert.rejects(flow.generateFlowVideo({ prompt: 'fixture', storyboardId: 1 }))
    const args = fs.readFileSync(path.join(root, 'generate-args'), 'utf8').trim().split('\n')
    assert.equal(args[args.indexOf('--reference') + 1], image)
    assert.equal(args[args.indexOf('--cookies') + 1], path.join(root, 'cookies', 'account_aaaa.json'))
    assert.equal(count(), 1)
  })
  await t.test('changed bytes at the same path invalidate sync', async () => {
    fs.writeFileSync(image, 'new-image')
    assert.equal((await refs.getDramaCharacterRefs(1)).all_synced, false)
    await refs.syncDramaCharacterRefsToFlow(1)
    assert.equal(count(), 2)
  })
  await t.test('changed project and account each require a new upload', async () => {
    account('aaaa', 'project-b')
    assert.equal((await refs.getDramaCharacterRefs(1)).all_synced, false)
    await refs.syncDramaCharacterRefsToFlow(1)
    account('bbbb', 'project-b')
    assert.equal((await refs.getDramaCharacterRefs(1)).all_synced, false)
    await refs.syncDramaCharacterRefsToFlow(1)
    assert.equal(count(), 4)
  })
  await t.test('concurrent requests share the same upload', async () => {
    fs.writeFileSync(image, 'concurrent-image')
    const context = upload.getFlowReferenceContext()
    const results = await Promise.all([upload.uploadFlowReference(image, context), upload.uploadFlowReference(image, context)])
    assert.equal(results[0].media_id, results[1].media_id)
    assert.equal(count(), 5)
  })
  await t.test('force refresh uploads again', async () => {
    await refs.syncDramaCharacterRefsToFlow(1, { force: true })
    assert.equal(count(), 6)
  })
  await t.test('manual sync upload failures remain visible and retryable', async () => {
    fs.writeFileSync(image, 'failed-image')
    fs.writeFileSync(path.join(root, 'fail-upload'), '')
    fs.rmSync(path.join(root, 'generate-args'))
    await assert.rejects(refs.syncDramaCharacterRefsToFlow(1), /upload failed/)
    assert.equal(fs.existsSync(path.join(root, 'generate-args')), false)
    assert.equal((await refs.getDramaCharacterRefs(1)).all_synced, false)
    fs.rmSync(path.join(root, 'fail-upload'))
    assert.equal((await refs.syncDramaCharacterRefsToFlow(1)).all_synced, true)
  })
  await t.test('wrong project response never enters cache', async () => {
    fs.writeFileSync(image, 'wrong-project-image')
    fs.writeFileSync(path.join(root, 'wrong-project'), '')
    await assert.rejects(refs.syncDramaCharacterRefsToFlow(1), /different account\/project/)
    assert.equal((await refs.getDramaCharacterRefs(1)).all_synced, false)
    fs.rmSync(path.join(root, 'wrong-project'))
  })
  await t.test('account switch during upload rejects the stale result', async () => {
    fs.writeFileSync(image, 'switch-during-upload')
    const work = upload.uploadFlowReference(image, upload.getFlowReferenceContext())
    account('cccc', 'project-c')
    await assert.rejects(work, /เปลี่ยนระหว่างซิงค์/)
    assert.equal((await refs.getDramaCharacterRefs(1)).all_synced, false)
  })
  await t.test('missing helper does not report sync success', async () => {
    fs.renameSync(helper, helper + '.disabled')
    try { await assert.rejects(refs.syncDramaCharacterRefsToFlow(1), /helper ยังไม่ได้ build/) }
    finally { fs.renameSync(helper + '.disabled', helper) }
  })
  await t.test('explicit unsupported model is not silently ignored', async () => {
    await assert.rejects(flow.generateFlowVideo({ prompt: 'fixture', model: 'veo-3.1' }), /ไม่รองรับการเลือกโมเดล/)
  })
  await t.test('missing bound character image stops generation rather than falling back', async () => {
    await db.update(schema.characters).set({ imageUrl: null, localPath: null }).where(eq(schema.characters.id, 1))
    await assert.rejects(flow.generateFlowVideo({ prompt: 'fixture', storyboardId: 1 }), /ยังไม่มีไฟล์ภาพ/)
    assert.equal(fs.existsSync(path.join(root, 'generate-args')), false)
  })
})