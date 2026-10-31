import type { SheetConsoleLevelDto, SheetConsoleMessageDto } from '@lorkarium/contracts';
import { admitInWindow } from '@/lib/rate-window';
import { SHEET_CONSOLE_FRAME_LIMITS } from './sheet-bridge-bootstrap';
import { authorScriptPositionOf, type SheetCodePosition, type SheetSource } from './sheet-srcdoc';

/** One line of a sheet's console as the host shows it. `position` is the line and column of the
 *  editor's JS file, only when the error came from the author's JS. */
export type SheetConsoleEntry = Readonly<{
  id: number;
  level: SheetConsoleLevelDto;
  text: string;
  at: Date;
  position: SheetCodePosition | null;
}>;

/** The lines kept (the newest last) and how many of them are errors. */
export type SheetConsoleLog = Readonly<{
  entries: readonly SheetConsoleEntry[];
  errors: number;
  nextId: number;
}>;

export const EMPTY_SHEET_CONSOLE: SheetConsoleLog = { entries: [], errors: 0, nextId: 1 };

/** Older lines go away past this many, so a chatty sheet never grows the host without end. */
export const SHEET_CONSOLE_MAX_ENTRIES = 300;

/** The host admits at most this many console messages, whatever the frame does (the author can
 *  take the port and skip the SDK's own limit): twice the frame's, so the SDK's count gets in. */
export const SHEET_CONSOLE_HOST_RATE = {
  limit: SHEET_CONSOLE_FRAME_LIMITS.lines * 2,
  windowMs: SHEET_CONSOLE_FRAME_LIMITS.windowMs,
} as const;

/** "12 linhas omitidas: mais de 20 por segundo." */
export function droppedLinesText(count: number): string {
  const lines = count === 1 ? '1 linha omitida' : `${count} linhas omitidas`;
  const perSecond = (SHEET_CONSOLE_FRAME_LIMITS.lines * 1000) / SHEET_CONSOLE_FRAME_LIMITS.windowMs;
  return `${lines}: mais de ${perSecond} por segundo.`;
}

/** The entry (with no id yet) of one console message of the frame running `source`.
 *
 *  Example: `consoleEntryOf({ type: 'console', level: 'log', message: 'oi', at: [] }, source, new Date())` */
export function consoleEntryOf(
  message: SheetConsoleMessageDto,
  source: SheetSource,
  at: Date,
): Omit<SheetConsoleEntry, 'id'> {
  if (message.type === 'console.dropped')
    return { level: 'warn', text: droppedLinesText(message.count), at, position: null };
  const position = authorScriptPositionOf(source, message.at);
  return { level: message.level, text: message.message, at, position };
}

/** `log` with one more line, the oldest dropped past `SHEET_CONSOLE_MAX_ENTRIES`.
 *
 *  Example: `appendConsoleEntry(EMPTY_SHEET_CONSOLE, consoleEntryOf(message, source, now))` */
export function appendConsoleEntry(
  log: SheetConsoleLog,
  entry: Omit<SheetConsoleEntry, 'id'>,
): SheetConsoleLog {
  const entries = [...log.entries, { ...entry, id: log.nextId }];
  const kept = entries.slice(-SHEET_CONSOLE_MAX_ENTRIES);
  const errors = kept.filter(({ level }) => level === 'error').length;
  return { entries: kept, errors, nextId: log.nextId + 1 };
}

/** Where a host hands the console messages it admitted. */
export type SheetConsoleSink = (message: SheetConsoleMessageDto) => void;

/** A sink that lets through at most `SHEET_CONSOLE_HOST_RATE` messages; what it refused comes
 *  back as one `console.dropped` before the next message admitted.
 *
 *  Example: `const intake = createConsoleIntake(() => clock.now(), onConsole); intake(message)` */
export function createConsoleIntake(now: () => number, sink: SheetConsoleSink): SheetConsoleSink {
  let stamps: readonly number[] = [];
  let refused = 0;
  return (message) => {
    const admission = admitInWindow(stamps, now(), SHEET_CONSOLE_HOST_RATE);
    stamps = admission.stamps;
    if (!admission.admitted) {
      refused += message.type === 'console.dropped' ? message.count : 1;
      return;
    }
    if (refused > 0) sink({ type: 'console.dropped', count: refused });
    refused = 0;
    sink(message);
  };
}
