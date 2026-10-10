import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { requestLogger } from '../src/middleware/logger.js'

describe('requestLogger prerequisite for Tora integration', () => {
  function createApp() {
    const app = new Hono()
    app.use('*', requestLogger)

    app.post('/api/credentials', async (c) => {
      const body = await c.req.json()
      return c.json({ echo: body }, 201)
    })

    app.put('/api/credentials', async (c) => {
      const body = await c.req.json()
      return c.json({ echo: body }, 200)
    })

    app.patch('/api/credentials', async (c) => {
      const body = await c.req.json()
      return c.json({ echo: body }, 200)
    })

    app.get('/api/health', (c) => {
      return c.json({ status: 'ok' }, 200)
    })

    app.get('/api/failing', (c) => {
      return c.json({ error: 'server failure' }, 500)
    })

    return app
  }

  async function captureLogs(fn: () => Promise<void>): Promise<string[]> {
    const logs: string[] = []
    const originalLog = console.log
    try {
      console.log = (...args: unknown[]) => {
        logs.push(args.map((a) => String(a)).join(' '))
      }
      await fn()
    } finally {
      console.log = originalLog
    }
    return logs
  }

  it('POST request does not leak synthetic credentials or body to console while handler receives intact body', async () => {
    const app = createApp()
    const payload = {
      apiKey: 'SYNTHETIC_SENTINEL_API_KEY_POST',
      nested: {
        credential: 'SYNTHETIC_SENTINEL_SECRET_POST',
      },
      prompt: 'benign video prompt for post',
    }

    let response: Response | undefined
    const logs = await captureLogs(async () => {
      response = await app.request('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    })

    assert.ok(response)
    assert.strictEqual(response.status, 201)
    const json = await response.json()
    assert.deepStrictEqual(json, { echo: payload })

    const combinedLogs = logs.join('\n')
    assert.doesNotMatch(combinedLogs, /SYNTHETIC_SENTINEL_API_KEY_POST/)
    assert.doesNotMatch(combinedLogs, /SYNTHETIC_SENTINEL_SECRET_POST/)
    assert.doesNotMatch(combinedLogs, /benign video prompt for post/)
    assert.doesNotMatch(combinedLogs, /\bbody:/i)

    // Verify diagnostics intact: method, path, status, time
    assert.match(combinedLogs, /POST/)
    assert.match(combinedLogs, /\/api\/credentials/)
    assert.match(combinedLogs, /201/)
    assert.match(combinedLogs, /\d+ms/)
  })

  it('PUT request does not leak synthetic credentials or body to console while handler receives intact body', async () => {
    const app = createApp()
    const payload = {
      apiKey: 'SYNTHETIC_SENTINEL_API_KEY_PUT',
      nested: {
        credential: 'SYNTHETIC_SENTINEL_SECRET_PUT',
      },
      prompt: 'benign prompt for put',
    }

    let response: Response | undefined
    const logs = await captureLogs(async () => {
      response = await app.request('/api/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    })

    assert.ok(response)
    assert.strictEqual(response.status, 200)
    const json = await response.json()
    assert.deepStrictEqual(json, { echo: payload })

    const combinedLogs = logs.join('\n')
    assert.doesNotMatch(combinedLogs, /SYNTHETIC_SENTINEL_API_KEY_PUT/)
    assert.doesNotMatch(combinedLogs, /SYNTHETIC_SENTINEL_SECRET_PUT/)
    assert.doesNotMatch(combinedLogs, /benign prompt for put/)
    assert.doesNotMatch(combinedLogs, /\bbody:/i)

    assert.match(combinedLogs, /PUT/)
    assert.match(combinedLogs, /\/api\/credentials/)
    assert.match(combinedLogs, /200/)
    assert.match(combinedLogs, /\d+ms/)
  })

  it('PATCH request does not leak synthetic credentials or body to console while handler receives intact body', async () => {
    const app = createApp()
    const payload = {
      apiKey: 'SYNTHETIC_SENTINEL_API_KEY_PATCH',
      nested: {
        credential: 'SYNTHETIC_SENTINEL_SECRET_PATCH',
      },
      prompt: 'benign prompt for patch',
    }

    let response: Response | undefined
    const logs = await captureLogs(async () => {
      response = await app.request('/api/credentials', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    })

    assert.ok(response)
    assert.strictEqual(response.status, 200)
    const json = await response.json()
    assert.deepStrictEqual(json, { echo: payload })

    const combinedLogs = logs.join('\n')
    assert.doesNotMatch(combinedLogs, /SYNTHETIC_SENTINEL_API_KEY_PATCH/)
    assert.doesNotMatch(combinedLogs, /SYNTHETIC_SENTINEL_SECRET_PATCH/)
    assert.doesNotMatch(combinedLogs, /benign prompt for patch/)
    assert.doesNotMatch(combinedLogs, /\bbody:/i)

    assert.match(combinedLogs, /PATCH/)
    assert.match(combinedLogs, /\/api\/credentials/)
    assert.match(combinedLogs, /200/)
    assert.match(combinedLogs, /\d+ms/)
  })

  it('GET requests still retain method, path, status, and latency diagnostics', async () => {
    const app = createApp()
    let response: Response | undefined
    const logs = await captureLogs(async () => {
      response = await app.request('/api/health', {
        method: 'GET',
      })
    })

    assert.ok(response)
    assert.strictEqual(response.status, 200)
    const combinedLogs = logs.join('\n')
    assert.match(combinedLogs, /GET/)
    assert.match(combinedLogs, /\/api\/health/)
    assert.match(combinedLogs, /200/)
    assert.match(combinedLogs, /\d+ms/)
  })

  it('failing status requests retain method, path, status, and latency diagnostics', async () => {
    const app = createApp()
    let response: Response | undefined
    const logs = await captureLogs(async () => {
      response = await app.request('/api/failing', {
        method: 'GET',
      })
    })

    assert.ok(response)
    assert.strictEqual(response.status, 500)
    const combinedLogs = logs.join('\n')
    assert.match(combinedLogs, /GET/)
    assert.match(combinedLogs, /\/api\/failing/)
    assert.match(combinedLogs, /500/)
    assert.match(combinedLogs, /\d+ms/)
  })
})
