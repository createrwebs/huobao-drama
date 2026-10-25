import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { FilePairingStore, createPairingToken, tokensEqual, type PairingStore } from './pairing.js';
import { isEventFrame, isResponseFrame, parseFrame, safeError } from './protocol.js';
import { PROTOCOL_VERSION, SUPPORTED_EXTENSION_OPS, type BridgeConfig, type BridgeReadyParams, type BridgeStatus, type ChromeCookie, type ResponseFrame } from './types.js';

export interface BridgeServerOptions {
  host?: string;
  port?: number;
  requestTimeoutMs?: number;
  pairingStore?: PairingStore;
}

interface ClientState {
  socket: WebSocket;
  authenticated: boolean;
  extensionVersion: string | null;
  protocol: number | null;
  cookieCount: number;
  lastCookieSyncAt: string | null;
  lastEventAt: string | null;
  lastError: string | null;
}

const DEFAULT_CONFIG: BridgeConfig = {
  bridgeUrl: 'ws://127.0.0.1:9222',
  targetUrlPrefixes: ['https://flow.google.com', 'https://labs.google'],
  cookieDomains: ['labs.google', 'google.com', 'flow.google.com', 'accounts.google.com'],
  autoOpenOnCommand: true,
  eventBufferSize: 500,
  reconnectDelayMs: 1500,
};

export class FlowBridgeServer {
  private readonly host: string;
  private readonly port: number;
  private readonly requestTimeoutMs: number;
  private readonly pairingStore: PairingStore;
  private readonly server: WebSocketServer;
  private client: ClientState | null = null;
  private sequence = 0;
  private pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();

  constructor(options: BridgeServerOptions = {}) {
    this.host = options.host || process.env.FLOW_BRIDGE_HOST || '127.0.0.1';
    if (this.host !== '127.0.0.1' && this.host !== 'localhost') {
      throw new Error('Flow Bridge must bind to localhost; LAN binding is disabled');
    }
    this.port = options.port ?? Number(process.env.FLOW_BRIDGE_PORT || 9222);
    this.requestTimeoutMs = options.requestTimeoutMs ?? Number(process.env.FLOW_BRIDGE_REQUEST_TIMEOUT_MS || 15000);
    this.pairingStore = options.pairingStore || new FilePairingStore(process.env.FLOW_BRIDGE_STATE_FILE || path.join(os.homedir(), '.huobao-flow-bridge', 'pairing.json'));
    this.server = new WebSocketServer({ host: this.host, port: this.port });
    this.server.on('connection', (socket, request) => void this.handleConnection(socket, request.url || '/'));
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onListening = () => { cleanup(); resolve(); };
      const onError = (error: Error) => { cleanup(); reject(error); };
      const cleanup = () => { this.server.off('listening', onListening); this.server.off('error', onError); };
      this.server.once('listening', onListening);
      this.server.once('error', onError);
    });
  }

  async close(): Promise<void> {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Bridge server is closing'));
    }
    this.pending.clear();
    this.client?.socket.close(1001, 'server shutdown');
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  getAddress(): { host: string; port: number } {
    const address = this.server.address();
    return { host: this.host, port: typeof address === 'object' && address ? address.port : this.port };
  }

  getStatus(): BridgeStatus {
    const client = this.client;
    return {
      connected: !!client?.socket && client.socket.readyState === 1,
      paired: client?.authenticated === true,
      extensionVersion: client?.extensionVersion || null,
      protocol: client?.protocol ?? null,
      cookieCount: client?.cookieCount || 0,
      lastCookieSyncAt: client?.lastCookieSyncAt || null,
      lastEventAt: client?.lastEventAt || null,
      lastError: client?.lastError || null,
    };
  }

  async request(op: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const client = this.client;
    if (!client || client.socket.readyState !== 1 || !client.authenticated) {
      throw new Error('Flow extension is not connected and paired');
    }
    const id = `bridge-${++this.sequence}`;
    const frame = JSON.stringify({ id, op, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Extension operation timed out: ${op}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      client.socket.send(frame, (error?: Error) => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  async listQzentCookies(): Promise<ChromeCookie[]> {
    const result = await this.request('cookies.list', { details: { domain: 'google.com' } });
    const cookies = Array.isArray(result) ? result as ChromeCookie[] : [];
    if (this.client) {
      this.client.cookieCount = cookies.length;
      this.client.lastCookieSyncAt = new Date().toISOString();
    }
    return cookies;
  }

  async syncCookies(): Promise<void> {
    if (!this.client || !this.client.authenticated) return;
    try {
      const cookies = await this.listQzentCookies();
      if (!cookies || cookies.length === 0) return;

      let at = '';
      let fsid = '';
      let projectId = '';
      let fingerprint: Record<string, unknown> | null = null;

      try {
        const tokens = (await this.request('flow.at')) as { at?: string; fsid?: string } | null;
        if (tokens) {
          at = String(tokens.at || '');
          fsid = String(tokens.fsid || '');
        }
      } catch {
        // Tab might not be on flow.google.com
      }

      try {
        const fp = (await this.request('flow.fingerprint')) as {
          userAgent?: string;
          brands?: string;
          platformFull?: string;
          language?: string;
          mobile?: boolean;
        } | null;
        if (fp) {
          fingerprint = {
            user_agent: fp.userAgent || '',
            sec_ch_ua: fp.brands || '',
            platform: fp.platformFull || '',
            language: fp.language || 'th',
            mobile: fp.mobile ? '?1' : '?0',
          };
        }
      } catch {
        // ignore
      }

      try {
        const tabs = (await this.request('tabs.list')) as Array<{ url?: string }> | null;
        if (Array.isArray(tabs)) {
          for (const tab of tabs) {
            const m = /\/project\/([A-Za-z0-9_-]+)/.exec(String(tab.url || ''));
            if (m) {
              projectId = m[1];
              break;
            }
          }
        }
      } catch {
        // ignore
      }

      const cookiesDir = process.env.FLOW_COOKIES_DIR || path.resolve(fileURLToPath(import.meta.url), '../../../cookies');
      if (fs.existsSync(cookiesDir)) {
        const files = fs.readdirSync(cookiesDir).filter(f => f.startsWith('account_') && f.endsWith('.json'));
        let targetFile = files[0] || 'account_synced.json';
        if (projectId) {
          for (const f of files) {
            try {
              const content = JSON.parse(fs.readFileSync(path.join(cookiesDir, f), 'utf-8'));
              if (content.project_id === projectId) {
                targetFile = f;
                break;
              }
            } catch {
              // ignore
            }
          }
        }

        const targetPath = path.join(cookiesDir, targetFile);
        let existingData: Record<string, unknown> = {};
        if (fs.existsSync(targetPath)) {
          try {
            existingData = JSON.parse(fs.readFileSync(targetPath, 'utf-8'));
          } catch {
            // ignore
          }
        }

        const bundle = {
          project_id: projectId || existingData.project_id || '',
          at: at || existingData.at || '',
          fsid: fsid || existingData.fsid || '',
          fingerprint: fingerprint || existingData.fingerprint || {
            user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            sec_ch_ua: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            platform: '"Windows"',
            language: 'th',
            mobile: '?0',
          },
          cookies,
        };

        fs.writeFileSync(targetPath, JSON.stringify(bundle, null, 2), 'utf-8');
        const now = new Date();
        fs.utimesSync(targetPath, now, now);
        console.log(`[flow-bridge] Synced ${cookies.length} cookies to ${targetPath}`);
      }
    } catch (err: any) {
      console.warn('[flow-bridge] Cookie sync notice:', err.message);
    }
  }

  private async handleConnection(socket: WebSocket, requestUrl: string): Promise<void> {
    const query = new URL(requestUrl, 'ws://127.0.0.1').searchParams;
    const storedToken = await this.pairingStore.load();
    const suppliedToken = query.get('token');
    const authenticated = storedToken ? tokensEqual(suppliedToken, storedToken) : false;

    // Only reject if an explicit INVALID token was provided.
    // If no token was provided, allow connection so the client can pair via bridge.ready.
    if (storedToken && suppliedToken && !authenticated) {
      socket.close(1008, 'pairing required');
      return;
    }

    if (this.client?.socket.readyState === 1) this.client.socket.close(1000, 'replaced by newer connection');
    this.client = { socket, authenticated, extensionVersion: null, protocol: null, cookieCount: 0, lastCookieSyncAt: null, lastEventAt: null, lastError: null };
    socket.on('message', (data: { toString(): string }) => void this.handleMessage(socket, data.toString()));
    socket.on('close', () => {
      if (this.client?.socket === socket) this.client = null;
    });
    socket.on('error', (error: Error) => {
      const client = this.client;
      if (client?.socket === socket) client.lastError = safeError(error).message;
    });
  }

  private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
    const frame = parseFrame(raw);
    if (!frame) return;
    if (isEventFrame(frame)) {
      if (frame.event === 'bridge.ready') {
        await this.handleReady(socket, (frame.params || {}) as Record<string, unknown>);
        return;
      }
      if (frame.event === 'bridge.cookies_rotated') {
        await this.syncCookies();
        return;
      }
      return;
    }
    if (isResponseFrame(frame)) {
      const pending = this.pending.get(frame.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(frame.id);
      if (frame.error) pending.reject(new Error(frame.error.message));
      else pending.resolve(frame.result);
    }
  }

  private async handleReady(socket: WebSocket, params: Record<string, unknown>): Promise<void> {
    if (!this.client || this.client.socket !== socket) return;
    const ready = params as BridgeReadyParams;
    this.client.extensionVersion = typeof ready.version === 'string' ? ready.version : null;
    this.client.protocol = typeof ready.protocol === 'number' ? ready.protocol : null;
    this.client.lastEventAt = new Date().toISOString();

    if (this.client.authenticated) {
      void this.syncCookies();
      return;
    }

    const token = (await this.pairingStore.load()) || createPairingToken();
    await this.pairingStore.save(token);
    const id = `bridge-${++this.sequence}`;
    const timer = setTimeout(() => this.pending.delete(id), this.requestTimeoutMs);
    this.pending.set(id, {
      timer,
      resolve: () => {
        const client = this.client;
        if (client?.socket === socket) {
          client.authenticated = true;
          socket.close(1000, 'pairing complete; reconnect with token');
        }
      },
      reject: (error) => {
        const client = this.client;
        if (client?.socket === socket) client.lastError = safeError(error).message;
      },
    });
    socket.send(JSON.stringify({ id, op: 'config.set', params: { patch: { bridgeToken: token } } }));
  }
}

export function createServer(options: BridgeServerOptions = {}): FlowBridgeServer {
  return new FlowBridgeServer(options);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const bridge = createServer();
  bridge.start().then(() => {
    const address = bridge.getAddress();
    console.log(`[flow-bridge] listening on ws://${address.host}:${address.port}`);
    console.log(`[flow-bridge] supported extension operations: ${SUPPORTED_EXTENSION_OPS.length}`);
  }).catch((error) => {
    console.error(`[flow-bridge] failed to start: ${safeError(error).message}`);
    process.exitCode = 1;
  });
}
