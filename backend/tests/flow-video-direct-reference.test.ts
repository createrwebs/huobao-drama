import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-direct-video-'))
process.env.FLOW_ENGINE_DIR = root
process.env.SQLITE_PATH = path.join(root, 'app.sqlite3')
for (const dir of ['bin', 'cookies', 'data']) fs.mkdirSync(path.join(root, dir))
const binary = path.join(root, 'bin', process.platform === 'darwin' ? 'flow-macos' : 'flow-linux')
fs.writeFileSync(binary, `#!/usr/bin/env node
require('fs').writeFileSync('args.json',JSON.stringify(process.argv.slice(2)));
console.error('fixture stopped before submission'); process.exit(1);
`, { mode: 0o755 })
for (const id of ['aaaa', 'bbbb']) fs.writeFileSync(path.join(root, 'cookies', `account_${id}.json`), JSON.stringify({project_id:id,cookies:[{name:'test',value:'fixture'}]}))
const first = path.join(root, 'first.png'), second = path.join(root, 'second.png')
fs.writeFileSync(first, 'fixture-one'); fs.writeFileSync(second, 'fixture-two')
const flow = await import('../src/services/flow-engine.js')
const args = () => JSON.parse(fs.readFileSync(path.join(root, 'args.json'), 'utf8')) as string[]

test('direct video references use existing engine cookies without an upload helper', async t => {
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await t.test('reference mode passes ordered files and never combines start-image', async () => {
    flow.switchFlowAccount('aaaa')
    await assert.rejects(flow.generateFlowVideo({prompt:'fixture',referenceMode:'reference',referenceImages:[first,second,first],startImage:first}))
    const a = args()
    assert.deepEqual(a.flatMap((v,i) => v === '--reference' ? [a[i+1]] : []), [first,second])
    assert.equal(a.includes('--start-image'), false)
    assert.equal(a[a.indexOf('--cookies')+1], path.join(root,'cookies','account_aaaa.json'))
    assert.equal(a.includes('--project-id'), false)
  })
  await t.test('next request follows a newly selected cookie file', async () => {
    flow.switchFlowAccount('bbbb')
    await assert.rejects(flow.generateFlowVideo({prompt:'fixture',referenceMode:'reference',referenceImages:[first]}))
    assert.equal(args()[args().indexOf('--cookies')+1], path.join(root,'cookies','account_bbbb.json'))
  })
  await t.test('first-frame mode keeps the old start-image precedence', async () => {
    await assert.rejects(flow.generateFlowVideo({prompt:'fixture',referenceMode:'first_frame',referenceImages:[second],startImage:first}))
    assert.equal(args().includes('--reference'),false)
    assert.equal(args()[args().indexOf('--start-image')+1],first)
  })
  await t.test('missing explicit reference fails before starting engine', async () => {
    fs.rmSync(path.join(root,'args.json'))
    await assert.rejects(flow.generateFlowVideo({prompt:'fixture',referenceMode:'reference',referenceImages:['/missing/image.png']}), /ไม่พบไฟล์/)
    assert.equal(fs.existsSync(path.join(root,'args.json')),false)
  })
  await t.test('successful CLI exit without an output cannot return another job video', async () => {
    fs.mkdirSync(path.join(root, 'output'))
    fs.writeFileSync(path.join(root, 'output', 'unrelated.mp4'), 'old-video')
    fs.writeFileSync(binary, '#!/bin/sh\necho "{}"\nexit 0\n', { mode: 0o755 })
    await assert.rejects(flow.generateFlowVideo({prompt:'fixture',referenceMode:'reference',referenceImages:[first]}))
  })
})