import { test } from 'vitest';
import { createGame, idleIntent, step, DT, type Intent } from '../src/sim';
import { newScript, scriptedIntent } from '../tests/helpers/scripted';
test('trace', () => {
  const s = createGame({ seed: Number(process.env.SEED ?? 7) });
  const mem = newScript();
  const out: string[] = [];
  while (s.winner === -1 && s.tick < 60 * 300) {
    const intents: [Intent, Intent] = [scriptedIntent(s, 0, mem), idleIntent()];
    const ev = step(s, intents, DT);
    for (const e of ev) if (!['shot','explosion','structureDamaged','vehicleHit','treeCrushed'].includes(e.type)) out.push(`${s.time.toFixed(1)} ${JSON.stringify(e)}`);
    if (s.tick % 300 === 0) { const v = s.sides[0].vehicle; out.push(`${s.time.toFixed(0)}s v=${v ? `${v.type} ${(v.x/32).toFixed(1)},${(v.y/32).toFixed(1)} hp${v.hp.toFixed(0)} nav${mem.nav.idx}/${mem.nav.path.length} fail${mem.nav.failed}` : '-'} flag1=${s.flags[1].state}`); }
  }
  console.log(out.join('\n'));
});
