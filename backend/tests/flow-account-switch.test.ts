import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'huobao-flow-test-'))
process.env.FLOW_ENGINE_DIR = root
fs.mkdirSync(path.join(root, 'bin'))
fs.mkdirSync(path.join(root, 'cookies'))
fs.mkdirSync(path.join(root, 'data'))
const binary = path.join(root, 'bin', process.platform === 'darwin' ? 'flow-macos' : process.platform === 'win32' ? 'flow-windows.exe' : 'flow-linux')
fs.writeFileSync(binary, `#!/bin/sh
printf '%s\\n' "$@" > "${root}/args.txt"
if [ -f "${root}/fail" ]; then exit 1; fi
exit 0
`, { mode: 0o755 })
for (const id of ['aaaa', 'bbbb']) {
  fs.writeFileSync(path.join(root, 'cookies', `account_${id}.json`), JSON.stringify({ project_id: id, cookies: [{ name: 'test', value: 'fixture' }] }))
}
const db = new Database(path.join(root, 'data', 'flow.db'))
db.exec("CREATE TABLE accounts (account_id TEXT, credits INTEGER, status TEXT, last_error TEXT); INSERT INTO accounts VALUES ('acct-aaaa', NULL, 'active', NULL), ('acct-bbbb', 100, 'active', NULL)")
db.close()
const flow = await import('../src/services/flow-engine.js')

test('Flow follows browser account updates and refreshes the same database', async (t) => {
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  await t.test('bridge cookie updates replace the account previously selected in Huobao', () => {
    flow.switchFlowAccount('aaaa')
    fs.writeFileSync(path.join(root, 'data', 'huobao-flow-account.json'), JSON.stringify({ filename: 'account_aaaa.json' }))
    const later = new Date(Date.now() + 60000)
    fs.utimesSync(path.join(root, 'cookies', 'account_bbbb.json'), later, later)
    assert.equal(flow.listFlowAccounts().find(a => a.is_active)?.id, 'bbbb')
  })
  await t.test('refresh explicitly uses the database read by Huobao', async () => {
    await flow.getFlowEngineStatus(true)
    const args = fs.readFileSync(path.join(root, 'args.txt'), 'utf8').trim().split('\n')
    assert.ok(args.includes('--refresh'))
    assert.equal(args[args.indexOf('--db') + 1], path.join(root, 'data', 'flow.db'))
  })
  await t.test('manual selection does not block later browser updates with future timestamps', () => {
    const other = path.join(root, 'cookies', 'account_bbbb.json')
    const future = new Date(Date.now() + 60000)
    fs.utimesSync(other, future, future)
    flow.switchFlowAccount('aaaa')
    const selected = path.join(root, 'cookies', 'account_aaaa.json')
    assert.ok(fs.statSync(selected).mtimeMs <= Date.now())
    assert.ok(fs.statSync(other).mtimeMs < fs.statSync(selected).mtimeMs)
    fs.utimesSync(other, new Date(Date.now() + 10), new Date(Date.now() + 10))
    assert.equal(flow.listFlowAccounts().find(a => a.is_active)?.id, 'bbbb')
  })
  await t.test('unknown active balance is not replaced with another account balance', async () => {
    const earlier = new Date(Date.now() - 10000)
    fs.utimesSync(path.join(root, 'cookies', 'account_bbbb.json'), earlier, earlier)
    flow.switchFlowAccount('aaaa')
    const status = await flow.getFlowEngineStatus()
    assert.equal(status.activeAccount?.id, 'aaaa')
    assert.equal(status.totalCredits, undefined)
  })
  await t.test('failed refresh is visible rather than reported as success', async () => {
    fs.writeFileSync(path.join(root, 'fail'), '')
    const status = await flow.getFlowEngineStatus(true)
    assert.ok(status.lastError)
  })
  await t.test('video uses legacy cookie selection while image behavior is unchanged', async () => {
    for (const [kind, generate] of [
      ['image', () => flow.generateFlowImage({ prompt: 'fixture' })],
      ['video', () => flow.generateFlowVideo({ prompt: 'fixture' })],
    ] as const) {
      await assert.rejects(generate)
      const args = fs.readFileSync(path.join(root, 'args.txt'), 'utf8').trim().split('\n')
      assert.equal(args.includes('--cookies'), kind === 'video')
      assert.equal(args[args.indexOf('--db') + 1], path.join(root, 'data', 'flow.db'))
    }
  })
  await t.test('unknown accounts cannot be used to switch arbitrary files', () => {
    assert.throws(() => flow.switchFlowAccount('../data/flow.db'))
  })
})