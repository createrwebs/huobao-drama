import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import Database from 'better-sqlite3'
import { initSqliteSchema } from '../src/db/sqlite-schema.js'
import { isSharedPoolIdleExpired, isSharedPoolLeaseActive } from '../src/services/shared-vast-pool.js'

function createDatabase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'huobao-shared-vast-'))
  const sqlite = new Database(path.join(dir, 'test.sqlite3'))
  initSqliteSchema(sqlite)
  return { sqlite, dir }
}

test('shared pool schema supports FIFO ordering and atomic single-worker claims', (t) => {
  const { sqlite, dir } = createDatabase()
  t.after(() => {
    sqlite.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const insert = sqlite.prepare(`INSERT INTO vast_render_queue
    (owner_user_id, pool_key, drama_id, storyboard_ids, status, created_at, updated_at)
    VALUES (?, 'minimax_h3', 1, ?, 'queued', ?, ?)`)
  insert.run(10, '[1]', '2026-11-02T10:00:00.000Z', '2026-11-02T10:00:00.000Z')
  insert.run(11, '[2]', '2026-11-02T10:00:01.000Z', '2026-11-02T10:00:01.000Z')

  const first = sqlite.prepare(`SELECT id FROM vast_render_queue
    WHERE pool_key = 'minimax_h3' AND status = 'queued'
    ORDER BY created_at ASC, id ASC LIMIT 1`).get() as { id: number }
  assert.equal(first.id, 1)

  const claim = sqlite.prepare(`UPDATE vast_render_queue
    SET status = 'starting', updated_at = ?
    WHERE id = ? AND status = 'queued'`).run('2026-11-02T10:00:02.000Z', first.id)
  assert.equal(claim.changes, 1)

  const duplicateClaim = sqlite.prepare(`UPDATE vast_render_queue
    SET status = 'starting', updated_at = ?
    WHERE id = ? AND status = 'queued'`).run('2026-11-02T10:00:03.000Z', first.id)
  assert.equal(duplicateClaim.changes, 0)
})

test('usage ledger idempotency key prevents duplicate reserve/settle/refund entries', (t) => {
  const { sqlite, dir } = createDatabase()
  t.after(() => {
    sqlite.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  const insert = sqlite.prepare(`INSERT INTO vast_usage_ledger
    (idempotency_key, queue_id, owner_user_id, event_type, quota_amount, created_at)
    VALUES (?, 1, 10, ?, ?, ?)`)
  insert.run('queue:1:reserve', 'reserve', 2000, '2026-11-02T10:00:00.000Z')
  assert.throws(() => insert.run('queue:1:reserve', 'reserve', 2000, '2026-11-02T10:00:01.000Z'), /UNIQUE/i)
  insert.run('queue:1:settle', 'settle', 1200, '2026-11-02T10:00:02.000Z')
  assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM vast_usage_ledger').get() as { count: number }).count, 2)
})

test('restart recovery can return interrupted work to queued without losing ownership', (t) => {
  const { sqlite, dir } = createDatabase()
  t.after(() => {
    sqlite.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  sqlite.prepare(`INSERT INTO vast_render_queue
    (owner_user_id, pool_key, drama_id, storyboard_ids, status, runner_job_id, tora_request_id, created_at, updated_at)
    VALUES (42, 'minimax_h3', 7, '[99]', 'rendering', 'runner-1', 'tora-1', ?, ?)`).run('2026-11-02T10:00:00.000Z', '2026-11-02T10:00:00.000Z')
  const result = sqlite.prepare(`UPDATE vast_render_queue SET
    status = 'queued', runner_job_id = NULL, tora_request_id = NULL, reserved_quota = 0,
    error_msg = ?, updated_at = ?
    WHERE owner_user_id = 42 AND status IN ('starting', 'rendering')`).run('ระบบกลับมาใหม่ งานถูกนำกลับเข้าคิวอัตโนมัติ', '2026-11-02T10:00:05.000Z')
  assert.equal(result.changes, 1)
  const recovered = sqlite.prepare('SELECT owner_user_id, status, runner_job_id FROM vast_render_queue WHERE id = 1').get() as any
  assert.deepEqual(recovered, { owner_user_id: 42, status: 'queued', runner_job_id: null })
})

test('idle termination only expires after the configured duration', () => {
  const at = Date.parse('2026-11-02T10:05:00.000Z')
  assert.equal(isSharedPoolIdleExpired('2026-11-02T10:00:00.000Z', 300, at), true)
  assert.equal(isSharedPoolIdleExpired('2026-11-02T10:00:01.000Z', 300, at), false)
  assert.equal(isSharedPoolIdleExpired(null, 300, at), false)
})

test('cancellation is a terminal transition and cannot be claimed again', (t) => {
  const { sqlite, dir } = createDatabase()
  t.after(() => {
    sqlite.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  sqlite.prepare(`INSERT INTO vast_render_queue
    (owner_user_id, pool_key, drama_id, storyboard_ids, status, tora_request_id, created_at, updated_at)
    VALUES (10, 'minimax_h3', 1, '[1]', 'rendering', 'tora-1', ?, ?)`).run('2026-11-02T10:00:00.000Z', '2026-11-02T10:00:00.000Z')
  const cancelled = sqlite.prepare(`UPDATE vast_render_queue SET status = 'cancelled', completed_at = ?, updated_at = ?
    WHERE id = 1 AND status IN ('queued', 'starting', 'rendering')`).run('2026-11-02T10:00:01.000Z', '2026-11-02T10:00:01.000Z')
  assert.equal(cancelled.changes, 1)
  const secondCancel = sqlite.prepare(`UPDATE vast_render_queue SET status = 'cancelled', updated_at = ?
    WHERE id = 1 AND status IN ('queued', 'starting', 'rendering')`).run('2026-11-02T10:00:02.000Z')
  assert.equal(secondCancel.changes, 0)
  assert.equal((sqlite.prepare("SELECT status FROM vast_render_queue WHERE id = 1").get() as any).status, 'cancelled')
})

test('a cancelled job cannot attach a late reservation', (t) => {
  const { sqlite, dir } = createDatabase()
  t.after(() => {
    sqlite.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  sqlite.prepare(`INSERT INTO vast_render_queue
    (owner_user_id, pool_key, drama_id, storyboard_ids, status, created_at, updated_at)
    VALUES (10, 'minimax_h3', 1, '[1]', 'cancelled', ?, ?)`).run('2026-11-02T10:00:00.000Z', '2026-11-02T10:00:01.000Z')
  const attach = sqlite.prepare(`UPDATE vast_render_queue SET reserved_quota = 2000, tora_request_id = 'tora-1'
    WHERE id = 1 AND status = 'starting'`).run()
  assert.equal(attach.changes, 0)
  assert.deepEqual(sqlite.prepare('SELECT reserved_quota, tora_request_id FROM vast_render_queue WHERE id = 1').get(), { reserved_quota: 0, tora_request_id: null })
})

test('pool lease allows one worker and can be reclaimed after expiry', (t) => {
  const { sqlite, dir } = createDatabase()
  t.after(() => {
    sqlite.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  sqlite.prepare(`INSERT INTO vast_render_pools
    (pool_key, model, status, lease_owner, lease_until, created_at, updated_at)
    VALUES ('minimax_h3', 'minimax_h3', 'stopped', NULL, NULL, ?, ?)`).run('2026-11-02T10:00:00.000Z', '2026-11-02T10:00:00.000Z')
  const claim = sqlite.prepare(`UPDATE vast_render_pools SET lease_owner = ?, lease_until = ?
    WHERE id = 1 AND (lease_owner IS NULL OR lease_until IS NULL OR lease_until < ?)`)
  assert.equal(claim.run('worker-a', '2026-11-02T10:02:00.000Z', '2026-11-02T10:00:00.000Z').changes, 1)
  assert.equal(claim.run('worker-b', '2026-11-02T10:04:00.000Z', '2026-11-02T10:01:00.000Z').changes, 0)
  assert.equal(isSharedPoolLeaseActive('2026-11-02T10:02:00.000Z', Date.parse('2026-11-02T10:01:59.000Z')), true)
  assert.equal(isSharedPoolLeaseActive('2026-11-02T10:02:00.000Z', Date.parse('2026-11-02T10:02:00.000Z')), false)
  assert.equal(claim.run('worker-b', '2026-11-02T10:04:00.000Z', '2026-11-02T10:03:00.000Z').changes, 1)
})