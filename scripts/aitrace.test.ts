import { test } from 'vitest';
import { createGame, step, DT, type Intent } from '../src/sim';
import { AiCommander } from '../src/sim/ai/commander';
import { newScript, scriptedIntent } from '../tests/helpers/scripted';
test('ai trace', () => {
  const seed = Number(process.env.SEED ?? 1);
  const s = createGame({ seed });
  const ai = [new AiCommander(0, 'medium', seed), new AiCommander(1, (process.env.D1 as any) ?? 'medium', seed)];
  const mem = newScript();
  const p0 = process.env.P0 === 'scripted' ? () => scriptedIntent(s, 0, mem) : () => ai[0].intent(s);
  const out: string[] = [];
  while (s.winner === -1 && s.tick < 60 * 60 * 15) {
    const ev = step(s, [p0(), ai[1].intent(s)] as [Intent, Intent], DT);
    for (const e of ev) {
      if (e.type==='vehicleHit' && e.side===0 && s.sides[0].vehicle?.type==='jeep') { const ev1=s.sides[1].vehicle; const near=s.units.filter(u=>u.side===1&&Math.hypot(u.x-s.sides[0].vehicle!.x,u.y-s.sides[0].vehicle!.y)<260).map(u=>u.kind); const gun=s.structs.filter(t=>t.alive&&t.side===1&&(t.kind==='turret'||t.kind==='guard')&&Math.hypot(t.x-s.sides[0].vehicle!.x,t.y-s.sides[0].vehicle!.y)<280).map(t=>t.kind); out.push(`  jeephit hp${e.hp} enemyVeh ${ev1?.type} d=${ev1?Math.round(Math.hypot(ev1.x-s.sides[0].vehicle!.x,ev1.y-s.sides[0].vehicle!.y)):'-'} units ${near} guns ${gun} lastHit`); }
      if (['vehicleSpawned','vehicleLost','vehicleDocked','flagRevealed','flagTaken','flagDropped','gameOver'].includes(e.type) || (e.type==='structureDestroyed' && e.kind==='tower'))
        out.push(`${(s.time).toFixed(1)} ${e.type} ${JSON.stringify(e).slice(0,140)} | modes ${ai[0].debug.mode}/${ai[1].debug.mode}`);
    }
  }
  console.log(out.join('\n'));
});
