import { BOARD_EVENTS, sceneActivateAckDto } from '@lorkarium/contracts';
import { boardFailureOf, type BoardCommandFailure, type BoardScope } from './board-command-sender';
import type { RealtimeTransport } from './realtime-transport';

export type SceneActivationResult =
  Readonly<{ ok: true }> | Readonly<{ ok: false; failure: BoardCommandFailure }>;

/** "Levar o grupo pra cá": the master moves the whole table to a grid (`scene:activate`). The
 *  room follows by the `scene:activated` the server sends to everyone, not by this answer.
 *
 *  Example: `await sceneActivation.activate({ campaignId, sceneId: estradaId })` */
export interface SceneActivation {
  activate(scope: BoardScope): Promise<SceneActivationResult>;
}

// Same patience as every board command.
const ACTIVATE_ACK_TIMEOUT_MS = 5000;

/** `SceneActivation` over the realtime transport: a new action id per call, an ack outside the
 *  DTO is `unexpected`, no ack in 5 s is `offline`. Never throws.
 *
 *  Example: `new RealtimeSceneActivation(transport, newActionId).activate(scope)` */
export class RealtimeSceneActivation implements SceneActivation {
  constructor(
    private readonly transport: RealtimeTransport,
    private readonly newActionId: () => string,
  ) {}

  async activate(scope: BoardScope): Promise<SceneActivationResult> {
    const payload = { actionId: this.newActionId(), ...scope };
    try {
      const answer = await this.transport.emitWithAck(
        BOARD_EVENTS.activateScene,
        payload,
        ACTIVATE_ACK_TIMEOUT_MS,
      );
      return activationResultOf(answer);
    } catch {
      return { ok: false, failure: 'offline' };
    }
  }
}

function activationResultOf(answer: unknown): SceneActivationResult {
  const parsed = sceneActivateAckDto.safeParse(answer);
  if (!parsed.success) return { ok: false, failure: 'unexpected' };
  if (parsed.data.ok) return { ok: true };
  return { ok: false, failure: boardFailureOf(parsed.data.error.code) };
}
