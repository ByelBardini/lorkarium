import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { SheetConsolePanel } from '@/features/sheets/sheet-console-panel';
import {
  appendConsoleEntry,
  EMPTY_SHEET_CONSOLE,
  type SheetConsoleEntry,
  type SheetConsoleLog,
} from '@/sheet-sandbox/sheet-console';

const AT = new Date(2026, 9, 31, 14, 5, 9);

function logOf(...entries: Array<Omit<SheetConsoleEntry, 'id' | 'at'>>): SheetConsoleLog {
  return entries.reduce(
    (log, entry) => appendConsoleEntry(log, { ...entry, at: AT }),
    EMPTY_SHEET_CONSOLE,
  );
}

const MIXED = logOf(
  { level: 'log', text: 'Força 14', position: null },
  { level: 'debug', text: 'detalhe', position: null },
  { level: 'info', text: 'pronta', position: null },
  { level: 'warn', text: 'sem PV', position: null },
  { level: 'error', text: 'ReferenceError: pv is not defined', position: { line: 2, column: 3 } },
);

function Harness({ initial }: Readonly<{ initial: SheetConsoleLog }>) {
  const [log, setLog] = useState(initial);
  return <SheetConsolePanel log={log} onClear={() => setLog(EMPTY_SHEET_CONSOLE)} />;
}

function lines(): string[] {
  const list = screen.getByRole('log', { name: 'Linhas do console' });
  return within(list)
    .queryAllByRole('listitem')
    .map((item) => item.textContent ?? '');
}

describe('SheetConsolePanel', () => {
  it('shows each line with its kind, time and text', () => {
    render(<Harness initial={MIXED} />);
    expect(lines()).toEqual([
      'Log14:05:09Força 14',
      'Debug14:05:09detalhe',
      'Info14:05:09pronta',
      'Aviso14:05:09sem PV',
      'Erro14:05:09ReferenceError: pv is not defined(linha 2, coluna 3 do JS)',
    ]);
  });

  it('an error with no position in the author js shows no line', () => {
    render(<Harness initial={logOf({ level: 'error', text: 'TypeError', position: null })} />);
    expect(lines()).toEqual(['Erro14:05:09TypeError']);
  });

  it.each([
    ['Erro', ['ReferenceError: pv is not defined']],
    ['Aviso', ['sem PV']],
    ['Info', ['pronta']],
    ['Log', ['Força 14', 'detalhe']],
  ])('the filter "%s" shows only that kind', async (filter, texts) => {
    const user = userEvent.setup();
    render(<Harness initial={MIXED} />);
    await user.click(screen.getByRole('button', { name: filter }));
    expect(screen.getByRole('button', { name: filter })).toHaveAttribute('aria-pressed', 'true');
    expect(lines().map((line) => texts.some((text) => line.includes(text)))).toEqual(
      texts.map(() => true),
    );
    expect(lines()).toHaveLength(texts.length);
  });

  it('"Tudo" brings every line back', async () => {
    const user = userEvent.setup();
    render(<Harness initial={MIXED} />);
    await user.click(screen.getByRole('button', { name: 'Erro' }));
    await user.click(screen.getByRole('button', { name: 'Tudo' }));
    expect(lines()).toHaveLength(5);
  });

  it('"Limpar" empties the console', async () => {
    const user = userEvent.setup();
    render(<Harness initial={MIXED} />);
    await user.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(lines()).toEqual(['Nada no console ainda.']);
  });

  it('a filter with nothing of its kind says so', async () => {
    const user = userEvent.setup();
    render(<Harness initial={logOf({ level: 'log', text: 'oi', position: null })} />);
    await user.click(screen.getByRole('button', { name: 'Erro' }));
    expect(lines()).toEqual(['Nenhuma linha deste tipo.']);
  });
});
