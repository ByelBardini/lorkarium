import {
  chooseNextPhaseCommandDto,
  defineRoundCycleCommandDto,
  deleteRoundCycleCommandDto,
  updateRoundCycleCommandDto,
} from '@lorkarium/contracts';
import type { RealtimeSocket } from '../../realtime/realtime-server';
import type { RoundCyclesService } from '../round-cycles/round-cycles.service';
import type { MutateCommand } from './character-commands';

export type RoundCycleCommandsDeps = Readonly<{
  roundCycles: Pick<RoundCyclesService, 'define' | 'update' | 'delete' | 'chooseNext'>;
}>;

/** The round cycle commands of one connection: the master's writes and the chooser's pick, each
 *  in the table's queue and acked with the table stream's version.
 *
 *  Example: `bindRoundCycleCommands(socket, mutate, { roundCycles })` */
export function bindRoundCycleCommands(
  socket: RealtimeSocket,
  mutate: MutateCommand,
  { roundCycles: cycles }: RoundCycleCommandsDeps,
): void {
  socket.on('cycle:define', mutate(defineRoundCycleCommandDto, cycles.define.bind(cycles)));
  socket.on('cycle:update', mutate(updateRoundCycleCommandDto, cycles.update.bind(cycles)));
  socket.on('cycle:delete', mutate(deleteRoundCycleCommandDto, cycles.delete.bind(cycles)));
  socket.on('cycle:chooseNext', mutate(chooseNextPhaseCommandDto, cycles.chooseNext.bind(cycles)));
}
