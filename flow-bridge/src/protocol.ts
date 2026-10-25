import type { EventFrame, RequestFrame, ResponseFrame } from './types.js';

export function parseFrame(raw: unknown): RequestFrame | EventFrame | ResponseFrame | null {
  if (typeof raw !== 'string') return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const frame = value as Record<string, unknown>;
  if (typeof frame.id === 'string' && typeof frame.op === 'string') {
    return { id: frame.id, op: frame.op, params: isRecord(frame.params) ? frame.params : undefined };
  }
  if (typeof frame.event === 'string') {
    return { event: frame.event, params: isRecord(frame.params) ? frame.params : undefined };
  }
  if (typeof frame.id === 'string' && ('result' in frame || 'error' in frame)) {
    return { id: frame.id, result: frame.result, error: isRecord(frame.error) && typeof frame.error.message === 'string' ? { message: frame.error.message } : undefined };
  }
  return null;
}

export function isRequestFrame(frame: RequestFrame | EventFrame | ResponseFrame): frame is RequestFrame {
  return 'op' in frame;
}

export function isEventFrame(frame: RequestFrame | EventFrame | ResponseFrame): frame is EventFrame {
  return 'event' in frame;
}

export function isResponseFrame(frame: RequestFrame | EventFrame | ResponseFrame): frame is ResponseFrame {
  return 'result' in frame || 'error' in frame;
}

export function safeError(error: unknown): { message: string } {
  const message = error instanceof Error ? error.message : String(error);
  return { message: message.replace(/(cookie|authorization|bearer|token|api[_ -]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]') };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}