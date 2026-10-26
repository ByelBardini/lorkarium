import { DICE_EVENTS, diceRollCommandDto } from '@lorkarium/contracts';
import type { CommandRateGuard } from '../../realtime/command-rate-guard';
import type { RealtimeSocket } from '../../realtime/realtime-server';
import { onCommand, type CommandEdgeDeps } from '../board/board-command-edge';
import type { DiceService } from './dice.service';

export type DiceGatewayDeps = CommandEdgeDeps &
  Readonly<{
    dice: Pick<DiceService, 'roll'>;
    /** The dice bucket (`DICE_RATE`), apart from the board's: a roll costs physics CPU. */
    rate: CommandRateGuard;
  }>;

/** Socket.IO edge of the dice: validates `dice:roll`, re-reads the session, requires the table
 *  open on this connection and rolls as the session's user, outside the table's queue (nothing is
 *  written); the ack carries the `rollId`, the events go out by the publisher.
 *
 *  Example: `realtime.onConnection(createDiceGateway({ dice, rate, realtime, log }))` */
export function createDiceGateway(deps: DiceGatewayDeps): (socket: RealtimeSocket) => void {
  const { rate } = deps;
  return (socket) => {
    socket.on(
      DICE_EVENTS.roll,
      onCommand({ deps, rate, socket }, diceRollCommandDto, async (userId, command) => {
        const { rollId } = await deps.dice.roll(userId, command);
        return { ok: true, rollId } as const;
      }),
    );
  };
}
