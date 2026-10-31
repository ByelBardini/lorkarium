import { sheetAdjustBarCommandDto } from '@lorkarium/contracts';
import type { RealtimeSocket } from '../../realtime/realtime-server';
import type { SheetBarsService } from '../sheets/sheet-bars.service';
import type { MutateCommand } from './character-commands';

export type SheetCommandsDeps = Readonly<{ sheetBars: Pick<SheetBarsService, 'adjustBar'> }>;

/** The commands of a sheet on one connection: `sheet:adjustBar`, in the table's queue like
 *  `token:adjustBar`, answering the version of the `token:updated` it produced.
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
}
