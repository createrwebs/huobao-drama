import assert from 'node:assert/strict';
import test from 'node:test';
import WebSocket from 'ws';
import { FlowBridgeServer } from '../dist/server.js';
import { MemoryPairingStore } from '../dist/pairing.js';
import { toQzentCookieArray, validateQzentCookieArray } from '../dist/cookies.js';

function cookie(domain, name, value, path = '/') {
  return { domain, name, value, path, secure: true };
}

async function open(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return ws;
}

function nextMessage(ws) {
  return new Promise((resolve) => ws.once('message', (data) => resolve(JSON.parse(data.toString()))));
}

test('cookie normalization excludes unsupported names/domains and validates session', () => {
  const result = toQzentCookieArray([
    cookie('.google.com', 'SID', 'sid'),
    cookie('.flow.google.com', '__Secure-3PSIDCC', 'cc'),
    cookie('.labs.google', '__Secure-next-auth.session-token', 'drop'),
    cookie('mail.google.com', 'SID', 'drop'),
    cookie('.google.com', 'SID', 'bad;value'),
  ]);
  assert.deepEqual(result.map((item) => item.name), ['SID', '__Secure-3PSIDCC']);
  assert.doesNotThrow(() => validateQzentCookieArray(result));
});

test('first extension connection receives pairing config and reconnects with token', async (t) => {
  const pairing = new MemoryPairingStore();
  const server = new FlowBridgeServer({ host: '127.0.0.1', port: 0, pairingStore: pairing, requestTimeoutMs: 1000 });
  await server.start();
  t.after(() => server.close());
  const address = server.getAddress();

  const first = await open(`ws://${address.host}:${address.port}`);
  first.send(JSON.stringify({ event: 'bridge.ready', params: { version: '1.2.3', protocol: 1 } }));
  const pairingRequest = await nextMessage(first);
  assert.equal(pairingRequest.op, 'config.set');
  assert.equal(pairingRequest.params.patch.bridgeToken.length >= 32, true);
  first.send(JSON.stringify({ id: pairingRequest.id, result: pairingRequest.params.patch }));
  await new Promise((resolve) => first.once('close', resolve));

  const token = await pairing.load();
  assert.ok(token);
  const second = await open(`ws://${address.host}:${address.port}?token=${encodeURIComponent(token)}`);
  second.send(JSON.stringify({ event: 'bridge.ready', params: { version: '1.2.3', protocol: 1 } }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(server.getStatus().paired, true);
  second.close();
});

test('invalid supplied token is rejected with 1008', async (t) => {
  const pairing = new MemoryPairingStore('x'.repeat(43));
  const server = new FlowBridgeServer({ host: '127.0.0.1', port: 0, pairingStore: pairing });
  await server.start();
  t.after(() => server.close());
  const address = server.getAddress();
  const ws = new WebSocket(`ws://${address.host}:${address.port}?token=wrong-token`);
  const code = await new Promise((resolve) => ws.once('close', (value) => resolve(value)));
  assert.equal(code, 1008);
});

test('tokenless connection receives existing token and pairs', async (t) => {
  const existingToken = 'x'.repeat(43);
  const pairing = new MemoryPairingStore(existingToken);
  const server = new FlowBridgeServer({ host: '127.0.0.1', port: 0, pairingStore: pairing, requestTimeoutMs: 1000 });
  await server.start();
  t.after(() => server.close());
  const address = server.getAddress();

  const first = await open(`ws://${address.host}:${address.port}`);
  first.send(JSON.stringify({ event: 'bridge.ready', params: { version: '1.2.3', protocol: 1 } }));
  const pairingRequest = await nextMessage(first);
  assert.equal(pairingRequest.op, 'config.set');
  assert.equal(pairingRequest.params.patch.bridgeToken, existingToken);
  first.send(JSON.stringify({ id: pairingRequest.id, result: pairingRequest.params.patch }));
  await new Promise((resolve) => first.once('close', resolve));

  const second = await open(`ws://${address.host}:${address.port}?token=${encodeURIComponent(existingToken)}`);
  second.send(JSON.stringify({ event: 'bridge.ready', params: { version: '1.2.3', protocol: 1 } }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(server.getStatus().paired, true);
  second.close();
});


test('tokenless connection receives existing token and pairs', async (t) => {
  const existingToken = 'x'.repeat(43);
  const pairing = new MemoryPairingStore(existingToken);
  const server = new FlowBridgeServer({ host: '127.0.0.1', port: 0, pairingStore: pairing, requestTimeoutMs: 1000 });
  await server.start();
  t.after(() => server.close());
  const address = server.getAddress();

  const first = await open(`ws://${address.host}:${address.port}`);
  first.send(JSON.stringify({ event: 'bridge.ready', params: { version: '1.2.3', protocol: 1 } }));
  const pairingRequest = await nextMessage(first);
  assert.equal(pairingRequest.op, 'config.set');
  assert.equal(pairingRequest.params.patch.bridgeToken, existingToken);
  first.send(JSON.stringify({ id: pairingRequest.id, result: pairingRequest.params.patch }));
  await new Promise((resolve) => first.once('close', resolve));

  const second = await open(`ws://${address.host}:${address.port}?token=${encodeURIComponent(existingToken)}`);
  second.send(JSON.stringify({ event: 'bridge.ready', params: { version: '1.2.3', protocol: 1 } }));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(server.getStatus().paired, true);
  second.close();
});
});