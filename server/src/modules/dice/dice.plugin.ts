import type { FastifyBaseLogger } from 'fastify';
import type { CommandRateGuard } from '../../realtime/command-rate-guard';
import type { Realtime, RealtimeSocket } from '../../realtime/realtime-server';
import { createDiceGateway } from './dice.gateway';
import { DiceService, type DiceServiceDeps } from './dice.service';

export type DiceModuleOptions = DiceServiceDeps &
  Readonly<{
    realtime: Pick<Realtime, 'reauthenticate'>;
    /** A guard built with `DICE_RATE`, never the board's shared one. */
    rate: CommandRateGuard;
    log: FastifyBaseLogger;
  }>;

export type DiceModule = Readonly<{ gateway: (socket: RealtimeSocket) => void }>;

/** Wires the dice module: the roll service and its Socket.IO edge.
 *
 *  Example: `realtime.onConnection(createDiceModule(options).gateway)` */
export function createDiceModule(options: DiceModuleOptions): DiceModule {
  const { realtime, rate, log, ...serviceDeps } = options;
  const dice = new DiceService(serviceDeps);
  return { gateway: createDiceGateway({ dice, rate, realtime, log }) };
}
