import { idleIntent, type GameState, type Intent, type Side } from '../sim/entities';

/** Produces one side's intent each tick: a human's devices or the AI. */
export interface Controller {
  readonly kind: 'human' | 'ai' | 'idle';
  intent(s: GameState, side: Side): Intent;
}

export class IdleController implements Controller {
  readonly kind = 'idle' as const;
  intent(): Intent {
    return idleIntent();
  }
}
