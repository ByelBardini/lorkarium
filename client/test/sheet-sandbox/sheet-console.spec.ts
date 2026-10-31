import type { SheetConsoleMessageDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  appendConsoleEntry,
  consoleEntryOf,
  createConsoleIntake,
  droppedLinesText,
  EMPTY_SHEET_CONSOLE,
  SHEET_CONSOLE_HOST_RATE,
  SHEET_CONSOLE_MAX_ENTRIES,
} from '@/sheet-sandbox/sheet-console';
import { authorScriptStartOf, type SheetSource } from '@/sheet-sandbox/sheet-srcdoc';

const SOURCE: SheetSource = { html: '<p>x</p>', css: '', js: 'const a = 1;\nfalhou();' };
const AT = new Date('2026-10-31T14:05:09.000Z');

function line(text: string, level: 'log' | 'error' = 'log'): SheetConsoleMessageDto {
  return { type: 'console', level, message: text, at: [] };
}

describe('consoleEntryOf', () => {
  it('keeps the level and the text, with no position for a plain log', () => {
    expect(consoleEntryOf(line('oi'), SOURCE, AT)).toEqual({
      level: 'log',
      text: 'oi',
      at: AT,
      position: null,
    });
  });

  it('an error inside the author js gets the line of the JS file', () => {
    const start = authorScriptStartOf(SOURCE);
    const error = { ...line('ReferenceError', 'error'), at: [{ line: start.line + 1, column: 1 }] };
    expect(consoleEntryOf(error, SOURCE, AT).position).toEqual({ line: 2, column: 1 });
  });

  it('an error outside the author js has no position', () => {
    const error = { ...line('TypeError', 'error'), at: [{ line: 1, column: 5 }] };
    expect(consoleEntryOf(error, SOURCE, AT).position).toBeNull();
  });

  it('the dropped lines become a warning in words', () => {
    expect(consoleEntryOf({ type: 'console.dropped', count: 12 }, SOURCE, AT)).toEqual({
      level: 'warn',
      text: '12 linhas omitidas: mais de 20 por segundo.',
      at: AT,
      position: null,
    });
    expect(droppedLinesText(1)).toBe('1 linha omitida: mais de 20 por segundo.');
  });
});

describe('appendConsoleEntry', () => {
  it('numbers the lines and counts the errors', () => {
    let log = appendConsoleEntry(EMPTY_SHEET_CONSOLE, consoleEntryOf(line('a'), SOURCE, AT));
    log = appendConsoleEntry(log, consoleEntryOf(line('b', 'error'), SOURCE, AT));
    expect(log.entries.map(({ id, text }) => [id, text])).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
    expect(log.errors).toBe(1);
  });

  it('keeps only the newest lines past the limit, and the count follows', () => {
    let log = appendConsoleEntry(
      EMPTY_SHEET_CONSOLE,
      consoleEntryOf(line('x', 'error'), SOURCE, AT),
    );
    for (let at = 0; at < SHEET_CONSOLE_MAX_ENTRIES; at += 1)
      log = appendConsoleEntry(log, consoleEntryOf(line(`l${at}`), SOURCE, AT));
    expect(log.entries).toHaveLength(SHEET_CONSOLE_MAX_ENTRIES);
    expect(log.entries[0]?.text).toBe('l0');
    expect(log.errors).toBe(0);
  });
});

describe('createConsoleIntake', () => {
  it('lets through the host rate and reports what it refused before the next one', () => {
    let nowMs = 0;
    const got: SheetConsoleMessageDto[] = [];
    const intake = createConsoleIntake(
      () => nowMs,
      (message) => got.push(message),
    );
    for (let at = 0; at < SHEET_CONSOLE_HOST_RATE.limit + 3; at += 1) intake(line(`${at}`));
    expect(got).toHaveLength(SHEET_CONSOLE_HOST_RATE.limit);
    nowMs = SHEET_CONSOLE_HOST_RATE.windowMs;
    intake(line('depois'));
    expect(got.slice(-2)).toEqual([{ type: 'console.dropped', count: 3 }, line('depois')]);
  });

  it('a refused count of the frame adds its own lines to the count', () => {
    let nowMs = 0;
    const got: SheetConsoleMessageDto[] = [];
    const intake = createConsoleIntake(
      () => nowMs,
      (message) => got.push(message),
    );
    for (let at = 0; at < SHEET_CONSOLE_HOST_RATE.limit; at += 1) intake(line(`${at}`));
    intake({ type: 'console.dropped', count: 40 });
    nowMs = SHEET_CONSOLE_HOST_RATE.windowMs;
    intake(line('depois'));
    expect(got.at(-2)).toEqual({ type: 'console.dropped', count: 40 });
  });
});
