// Renders the laugh offline to a WAV file so it can be listened to outside the game.
// Usage: node scripts/render-laugh.mjs <out.wav>   (needs `npm run dev` running)
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto('http://127.0.0.1:5173/');
const pcm = await p.evaluate(async () => {
  const { playLaugh, LAUGH_LENGTH } = await import('/src/audio/laugh.ts');
  const { noiseBuffer } = await import('/src/audio/synth.ts');
  const sr = 44100;
  const ac = new OfflineAudioContext(2, Math.ceil(sr * (LAUGH_LENGTH + 3.5)), sr);
  const master = ac.createGain();
  master.gain.value = 0.9;
  master.connect(ac.destination);
  playLaugh(ac, master, noiseBuffer(ac, 1), 0.1);
  const buf = await ac.startRendering();
  const l = buf.getChannelData(0), r = buf.getChannelData(1);
  let peak = 0;
  for (let i = 0; i < l.length; i++) peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i]));
  const k = peak > 0.95 ? 0.95 / peak : 1;
  const out = new Array(l.length * 2);
  for (let i = 0; i < l.length; i++) { out[i * 2] = Math.round(l[i] * k * 32767); out[i * 2 + 1] = Math.round(r[i] * k * 32767); }
  return { out, peak, sr };
});
const n = pcm.out.length;
const buf = Buffer.alloc(44 + n * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(pcm.sr, 24);
buf.writeUInt32LE(pcm.sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) buf.writeInt16LE(pcm.out[i], 44 + i * 2);
writeFileSync(process.argv[2], buf);
console.log('peak before normalising', pcm.peak.toFixed(2), '->', process.argv[2]);
await b.close();
