import { sheetAdjustBarCommandDto, sheetSpendBarsCommandDto } from '@lorkarium/contracts';
import type { RealtimeSocket } from '../../realtime/realtime-server';
import type { SheetBarsService } from '../sheets/sheet-bars.service';
import type { MutateCommand } from './character-commands';

export type SheetCommandsDeps = Readonly<{
  sheetBars: Pick<SheetBarsService, 'adjustBar' | 'spendBars'>;
}>;

/** The commands of a sheet on one connection: `sheet:adjustBar` and `sheet:spendBars`, in the
 *  table's queue like `token:adjustBar`, answering the version of the event they produced.
 *
 *  Example: `bindSheetCommands(socket, mutate, { sheetBars })` */
export function bindSheetCommands(
  socket: RealtimeSocket,
  mutate: MutateCommand,
  { sheetBars }: SheetCommandsDeps,
): void {
  socket.on(
    'sheet:adjustBar',
    mutate(sheetAdjustBarCommandDto, sheetBars.adjustBar.bind(sheetBars)),
  );
  socket.on(
    'sheet:spendBars',
    mutate(sheetSpendBarsCommandDto, sheetBars.spendBars.bind(sheetBars)),
  );
}
