// Browser side of the relay: create or join a room by code, then exchange
// game messages with the other player.

export type RelayEvent =
  | { t: 'created'; code: string }
  | { t: 'paired'; role: 'host' | 'guest' }
  | { t: 'error'; e: string }
  | { t: 'peer-left' }
  | { t: 'closed' }
  | { t: 'm'; d: unknown };

/** Where the relay lives: ?relay=, a saved choice, the build's default, or a local one in development. */
export function relayUrl(): string {
  const p = new URLSearchParams(location.search).get('relay');
  if (p) return p;
  try {
    const saved = localStorage.getItem('mivtza.relay');
    if (saved) return saved;
  } catch {
    /* ignore */
  }
  const built = import.meta.env.VITE_RELAY_URL as string | undefined;
  if (built) return built;
  return `ws://${location.hostname || '127.0.0.1'}:8787`;
}

export function saveRelayUrl(url: string) {
  try {
    if (url) localStorage.setItem('mivtza.relay', url);
    else localStorage.removeItem('mivtza.relay');
  } catch {
    /* ignore */
  }
}

export class RelayClient {
  private ws: WebSocket | null = null;
  private listeners: ((e: RelayEvent) => void)[] = [];
  private pings = new Map<number, number>();
  private pingN = 0;
  /** Round-trip time to the relay in ms (median of recent pings). */
  rtts: number[] = [];

  on(fn: (e: RelayEvent) => void) {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }

  private emit(e: RelayEvent) {
    for (const l of [...this.listeners]) l(e);
  }

  connect(url = relayUrl(), timeoutMs = 60000): Promise<void> {
    this.close();
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (e) {
        reject(e);
        return;
      }
      this.ws = ws;
      // Free hosting may need a while to wake up.
      const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('connect'));
      };
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        this.emit({ t: 'closed' });
      };
      ws.onmessage = (ev) => {
        let m: { t: string; n?: number } & Record<string, unknown>;
        try {
          m = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (m.t === 'pong' && typeof m.n === 'number') {
          const at = this.pings.get(m.n);
          if (at !== undefined) {
            this.rtts.push(performance.now() - at);
            if (this.rtts.length > 9) this.rtts.shift();
            this.pings.delete(m.n);
          }
          return;
        }
        this.emit(m as unknown as RelayEvent);
      };
    });
  }

  get open() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private raw(o: unknown) {
    if (this.open) this.ws!.send(JSON.stringify(o));
  }

  create() {
    this.raw({ t: 'create' });
  }

  join(code: string) {
    this.raw({ t: 'join', code: code.toUpperCase().trim() });
  }

  send(d: unknown) {
    this.raw({ t: 'm', d });
  }

  ping() {
    const n = ++this.pingN;
    this.pings.set(n, performance.now());
    this.raw({ t: 'ping', n });
  }

  /** Median relay round trip; the player-to-player round trip is about twice this. */
  get rtt(): number {
    if (!this.rtts.length) return 100;
    const s = [...this.rtts].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  close() {
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  }
}
