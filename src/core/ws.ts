import WebSocket from 'ws';
import chalk from 'chalk';

const PING_INTERVAL_MS = 20_000;
const RECONNECT_DELAY_MS = 3_000;
const MAX_RECONNECTS = 10;

export interface WsOptions {
  url: string;
  channels: string[];
  headers?: Record<string, string>;
  onMessage: (channel: string, data: unknown) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
}

export class EdgexWebSocket {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectCount = 0;
  private closed = false;
  private opts: WsOptions;

  constructor(opts: WsOptions) {
    this.opts = opts;
  }

  connect(): void {
    this.closed = false;
    this.doConnect();
  }

  close(): void {
    this.closed = true;
    this.stopPing();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private doConnect(): void {
    if (this.closed) return;

    const wsOpts: WebSocket.ClientOptions = {};
    if (this.opts.headers) {
      wsOpts.headers = this.opts.headers;
    }

    this.ws = new WebSocket(this.opts.url, wsOpts);

    this.ws.on('open', () => {
      this.reconnectCount = 0;
      process.stderr.write(chalk.gray('Connected\n'));

      for (const channel of this.opts.channels) {
        this.subscribe(channel);
      }

      this.startPing();
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        this.handleMessage(msg);
      } catch {
        // Ignore unparseable messages
      }
    });

    this.ws.on('error', (err: Error) => {
      if (this.opts.onError) {
        this.opts.onError(err);
      }
    });

    this.ws.on('close', () => {
      this.stopPing();
      if (!this.closed && this.reconnectCount < MAX_RECONNECTS) {
        this.reconnectCount++;
        process.stderr.write(
          chalk.yellow(`Disconnected, reconnecting (${this.reconnectCount}/${MAX_RECONNECTS})...\n`),
        );
        setTimeout(() => this.doConnect(), RECONNECT_DELAY_MS);
      } else if (this.opts.onClose) {
        this.opts.onClose();
      }
    });
  }

  private subscribe(channel: string): void {
    this.send({ type: 'subscribe', channel });
  }

  private send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const type = msg.type as string;

    if (type === 'ping') {
      this.send({ type: 'pong', time: msg.time });
      return;
    }

    if (type === 'pong' || type === 'subscribed') {
      return;
    }

    if (type === 'error') {
      const content = msg.content as Record<string, string> | undefined;
      process.stderr.write(chalk.red(`WS error: ${content?.msg ?? JSON.stringify(msg)}\n`));
      return;
    }

    if (type === 'quote-event' || type === 'data') {
      const channel = msg.channel as string;
      const content = msg.content as Record<string, unknown> | undefined;
      this.opts.onMessage(channel, content?.data ?? content ?? msg);
      return;
    }

    // Private channel events (account/order/position updates)
    if (type === 'account' || type === 'order' || type === 'position' || msg.channel) {
      const channel = (msg.channel ?? msg.type) as string;
      this.opts.onMessage(channel, msg.content ?? msg.data ?? msg);
      return;
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping', time: String(Date.now()) });
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }
}
