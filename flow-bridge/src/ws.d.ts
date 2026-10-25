declare module 'ws' {
  import type { IncomingMessage } from 'node:http';
  import type { Server } from 'node:http';

  export class WebSocket {
    static readonly OPEN: number;
    readonly readyState: number;
    send(data: string, callback?: (error?: Error) => void): void;
    close(code?: number, reason?: string): void;
    on(event: 'message', listener: (data: { toString(): string }) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
  }

  export class WebSocketServer {
    constructor(options: { host: string; port: number });
    on(event: 'connection', listener: (socket: WebSocket, request: IncomingMessage) => void): this;
    once(event: 'listening', listener: () => void): this;
    once(event: 'error', listener: (error: Error) => void): this;
    off(event: 'listening' | 'error', listener: (...args: any[]) => void): this;
    close(callback: () => void): void;
    address(): ReturnType<Server['address']>;
  }
}