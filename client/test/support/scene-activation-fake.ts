import type { BoardScope } from '@/services/board-command-sender';
import type { SceneActivation, SceneActivationResult } from '@/services/scene-activation';

/** Scripted `SceneActivation`: records each scope asked for and answers what the test set
 *  (`{ ok: true }` by default). */
export class SceneActivationFake implements SceneActivation {
  readonly activated: BoardScope[] = [];
  private answer: SceneActivationResult = { ok: true };

  answerWith(result: SceneActivationResult): this {
    this.answer = result;
    return this;
  }

  activate(scope: BoardScope): Promise<SceneActivationResult> {
    this.activated.push(scope);
    return Promise.resolve(this.answer);
  }
}
