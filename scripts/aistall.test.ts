import { test } from 'vitest';
import { createGame, idleIntent, step, DT, type Intent } from '../src/sim';
import { AiCommander } from '../src/sim/ai/commander';
test('stall', () => {
  const seed = Number(process.env.SEED ?? 1);
  const s = createGame({ seed, map: process.env.MAP ?? 'random' });
  const ai = new AiCommander(1, 'hard', seed);
  const out: string[] = [];
  while (s.winner === -1 && s.tick < 60 * 60 * 15) {
    const it = ai.intent(s);
    const ev = step(s, [idleIntent(), it] as [Intent, Intent], DT);
    for (const e of ev) if (['vehicleSpawned','vehicleLost','vehicleDocked','flagRevealed','flagTaken','flagDropped'].includes(e.type) || (e.type==='structureDestroyed'&&e.kind==='tower')) out.push(`${s.time.toFixed(0)} ${e.type} ${(e as any).vehicle ?? ''} ${(e as any).cause ?? ''}`);
    const v = s.sides[1].vehicle;
    if (s.tick % 1800 === 0) out.push(`  t=${s.time.toFixed(0)} ${v ? `${v.type} ${(v.x/32).toFixed(1)},${(v.y/32).toFixed(1)} hp${v.hp.toFixed(0)} fuel${v.fuel.toFixed(0)} ammo${v.ammo}` : '-'} mode=${ai.debug.mode} tgt=${ai.debug.target} ${ai.debug.target>0? JSON.stringify((({kind,tx,ty,alive})=>({kind,tx,ty,alive}))(s.structs[ai.debug.target-1])):''} stock=${JSON.stringify(s.sides[1].stock)} flag0=${s.flags[0].state}`);
  }
  console.log(out.join('\n'));
});
