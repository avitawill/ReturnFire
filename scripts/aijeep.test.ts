import { test } from 'vitest';
import { createGame, step, DT, type Intent } from '../src/sim';
import { AiCommander } from '../src/sim/ai/commander';
import { newScript, scriptedIntent } from '../tests/helpers/scripted';
test('ai jeep', () => {
  const s = createGame({ seed: 1 });
  const ai = new AiCommander(1, 'easy', 1);
  const mem = newScript();
  let n = 0;
  while (s.winner === -1 && s.tick < 60 * 400) {
    const it1 = ai.intent(s);
    step(s, [scriptedIntent(s, 0, mem), it1] as [Intent, Intent], DT);
    const v = s.sides[1].vehicle;
    if (s.time > 310 && v?.type === 'jeep' && s.tick % 15 === 0 && n++ < 24) console.log(s.time.toFixed(2), (v.x/32).toFixed(1), (v.y/32).toFixed(1), v.a.toFixed(2), 'mv', it1.move.x.toFixed(2), it1.move.y.toFixed(2), ai.debug.mode, 'left', v.left, (ai as any).nav.path.length, (ai as any).nav.failed, (ai as any).unstickT.toFixed(2));
  }
});
