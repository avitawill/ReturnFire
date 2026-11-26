import { AiCommander, type Difficulty } from '../sim/ai/commander';
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

export class AiController implements Controller {
  readonly kind = 'ai' as const;
  readonly ai: AiCommander;
  constructor(side: Side, difficulty: Difficulty, seed: number) {
    this.ai = new AiCommander(side, difficulty, seed);
  }
  intent(s: GameState): Intent {
    return this.ai.intent(s);
  }
}
