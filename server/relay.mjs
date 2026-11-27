// Mivtza Degel relay: pairs two players by a short room code and forwards
// their messages. No dependencies; a minimal WebSocket server (RFC 6455).
//
// Run: node server/relay.mjs        (PORT env, default 8787)
// Optional: ALLOWED_ORIGINS="https://you.github.io,http://localhost:5173"

import { createHash, randomInt } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const MAX_MESSAGE = 4 * 1024 * 1024;
const MAX_ROOMS = 500;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** @type {Map<string, {host: Conn, guest: Conn | null, created: number}>} */
const rooms = new Map();

class Conn {
  constructor(socket) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.room = null;
    this.alive = true;
    this.frags = [];
    socket.on('data', (d) => this.onData(d));
    socket.on('close', () => this.onClose());
    socket.on('error', () => socket.destroy());
  }

  send(obj) {
    if (this.socket.destroyed) return;
    const payload = Buffer.from(JSON.stringify(obj));
    const n = payload.length;
    const head = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 127]), u64(n)]);
    this.socket.write(Buffer.concat([head, payload]));
  }

  control(op, data = Buffer.alloc(0)) {
    if (!this.socket.destroyed) this.socket.write(Buffer.concat([Buffer.from([0x80 | op, data.length]), data]));
  }

  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const op = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        len = Number(this.buf.readBigUInt64BE(2));
        off = 10;
      }
      if (len > MAX_MESSAGE || !masked) return this.socket.destroy();
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      if (op === 8) return this.socket.end(Buffer.from([0x88, 0]));
      if (op === 9) this.control(10, data);
      else if (op === 10) this.alive = true;
      else if (op === 1 || op === 0) {
        this.frags.push(data);
        if (fin) {
          const text = Buffer.concat(this.frags).toString('utf8');
          this.frags = [];
          this.onMessage(text);
        }
      }
    }
  }

  onMessage(text) {
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg.t === 'create' && !this.room) {
      if (rooms.size >= MAX_ROOMS) return this.send({ t: 'error', e: 'full' });
      let code;
      do code = Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
      while (rooms.has(code));
      rooms.set(code, { host: this, guest: null, created: Date.now() });
      this.room = code;
      this.send({ t: 'created', code });
    } else if (msg.t === 'join' && !this.room) {
      const code = String(msg.code ?? '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return this.send({ t: 'error', e: 'no-room' });
      if (room.guest) return this.send({ t: 'error', e: 'room-full' });
      room.guest = this;
      this.room = code;
      room.host.send({ t: 'paired', role: 'host' });
      this.send({ t: 'paired', role: 'guest' });
    } else if (msg.t === 'm' && this.room) {
      const room = rooms.get(this.room);
      const peer = room && (room.host === this ? room.guest : room.host);
      if (peer) peer.send({ t: 'm', d: msg.d });
    } else if (msg.t === 'ping') this.send({ t: 'pong', n: msg.n });
  }

  onClose() {
    const room = this.room && rooms.get(this.room);
    if (room) {
      const peer = room.host === this ? room.guest : room.host;
      peer?.send({ t: 'peer-left' });
      if (peer) peer.room = null;
      rooms.delete(this.room);
    }
    this.room = null;
  }
}

function u64(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(n));
  return b;
}

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
  res.end(`mivtza-degel relay: ${rooms.size} rooms\n`);
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  const origin = req.headers.origin ?? '';
  if (!key || (req.headers.upgrade ?? '').toLowerCase() !== 'websocket' || (ALLOWED.length && !ALLOWED.includes(origin))) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }
  const accept = createHash('sha1').update(key + GUID).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const c = new Conn(socket);
  conns.add(c);
  socket.on('close', () => conns.delete(c));
});

/** @type {Set<Conn>} */
const conns = new Set();
// Keep connections alive through proxies and drop dead ones; forget rooms nobody joined.
setInterval(() => {
  for (const c of conns) {
    if (!c.alive) c.socket.destroy();
    else {
      c.alive = false;
      c.control(9);
    }
  }
  for (const [code, r] of rooms) if (!r.guest && Date.now() - r.created > 30 * 60 * 1000) rooms.delete(code);
}, 25000).unref();

server.listen(PORT, () => console.log(`relay listening on :${PORT}`));
