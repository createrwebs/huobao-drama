export const PROTOCOL_VERSION = 1;

export const SUPPORTED_EXTENSION_OPS = [
  'ping',
  'config.get',
  'config.set',
  'config.reset',
  'tabs.list',
  'tabs.open',
  'tab.attach',
  'tab.detach',
  'tab.current',
  'events.read',
  'cookies.list',
  'cookies.names',
  'flow.fingerprint',
  'flow.navigate',
  'flow.projects',
  'flow.captcha',
  'flow.at',
  'status',
] as const;

export type ExtensionOperation = (typeof SUPPORTED_EXTENSION_OPS)[number];

export interface BridgeConfig {
  bridgeUrl: string;
  bridgeToken?: string;
  targetUrlPrefixes: string[];
  cookieDomains: string[];
  autoOpenOnCommand: boolean;
  eventBufferSize: number;
  reconnectDelayMs: number;
}

export interface BridgeReadyParams {
  version?: string;
  protocol?: number;
  config?: Partial<BridgeConfig>;
}

export interface RequestFrame {
  id: string;
  op: string;
  params?: Record<string, unknown>;
}

export interface ResponseFrame {
  id: string;
  result?: unknown;
  error?: { message: string };
}

export interface EventFrame {
  event: string;
  params?: Record<string, unknown>;
}

export interface ChromeCookie {
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  expirationDate?: number;
  hostOnly?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
  session?: boolean;
  storeId?: string;
}

export interface QzentCookie {
  name: string;
  value: string;
  domain: string;
  path: '/';
  secure: true;
}

export interface BridgeStatus {
  connected: boolean;
  paired: boolean;
  extensionVersion: string | null;
  protocol: number | null;
  cookieCount: number;
  lastCookieSyncAt: string | null;
  lastEventAt: string | null;
  lastError: string | null;
}