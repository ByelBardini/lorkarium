import type { BoardCommandAckDto } from '../board/board.dto';
import type { SheetAdjustBarCommandDto, SheetChangedEventDto } from './sheet.dto';

/** Sheet command and event names on the table connection. */
export const SHEET_EVENTS = {
  adjustBar: 'sheet:adjustBar',
  changed: 'sheet:changed',
} as const;

/** Client → server sheet commands, merged into `TableClientEvents`; the ack is the board's. */
export type SheetClientEvents = {
  'sheet:adjustBar': (
    command: SheetAdjustBarCommandDto,
    ack: (answer: BoardCommandAckDto) => void,
  ) => void;
};

/** Server → room sheet events, merged into `TableServerEvents`. */
export type SheetServerEvents = {
  'sheet:changed': (event: SheetChangedEventDto) => void;
};
