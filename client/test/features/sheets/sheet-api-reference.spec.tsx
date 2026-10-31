import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SheetApiReference } from '@/features/sheets/sheet-api-reference';
import * as content from '@/features/sheets/sheet-api-reference-content';
import { SHEET_BRIDGE_BOOTSTRAP } from '@/sheet-sandbox/sheet-bridge-bootstrap';
import { SheetFrameWindowFake } from '../../support/sheet-frame-fakes';

const SECTIONS = [
  'Como a ficha conversa com a mesa',
  'O estado',
  'Funções',
  'Como achar a barra',
  'Valores',
  'Erros',
  'Exemplo completo',
  'Limites da ficha',
];

const CALLS = [
  'ready',
  'onState',
  'values.get',
  'values.all',
  'values.set',
  'bars.list',
  'bars.get',
  'bars.adjust',
  'dice.roll',
];

// Every code the host, the preview or the frame's bars.get can produce.
const CODES = [
  'FORBIDDEN',
  'OFFLINE',
  'NO_TOKEN',
  'BAR_NOT_FOUND',
  'BAR_AMBIGUOUS',
  'RATE_LIMITED',
  'INVALID_DICE_EXPRESSION',
  'PREVIEW_ONLY',
  'INVALID_MESSAGE',
  'NOT_FOUND',
];

function allDocumentedCode(): string {
  const strings = Object.values(content).filter((entry) => typeof entry === 'string');
  const calls = content.SDK_CALLS.flatMap((call) => [call.signature, call.example]);
  return [...strings, ...calls].join('\n');
}

function sdkMember(path: string): unknown {
  const frame = new SheetFrameWindowFake();
  new Function('window', SHEET_BRIDGE_BOOTSTRAP)(frame);
  return path
    .split('.')
    .reduce<unknown>((at, key) => (at as Record<string, unknown>)[key], frame.sdk);
}

describe('SheetApiReference', () => {
  it('has a titled section for each part of the guide', () => {
    render(<SheetApiReference />);
    for (const name of SECTIONS) expect(screen.getByRole('region', { name })).toBeInTheDocument();
  });

  it('documents every SDK call with its signature', () => {
    render(<SheetApiReference />);
    const signatures = screen.getAllByRole('term').map((term) => term.textContent);
    expect(signatures.map((text) => /^lorkarium\.([\w.]+)\(/u.exec(text ?? '')?.[1])).toEqual(
      CALLS,
    );
  });

  it('every lorkarium call the guide cites exists in the SDK the frame gets', () => {
    const cited = new Set(
      [...allDocumentedCode().matchAll(/lorkarium\.([a-zA-Z]+(?:\.[a-zA-Z]+)?)\(/gu)].map(
        (match) => match[1] ?? '',
      ),
    );
    expect([...cited].filter((path) => typeof sdkMember(path) !== 'function')).toEqual([]);
    expect(cited.size).toBe(CALLS.length);
  });

  it('the state table explains each field the frame receives', () => {
    render(<SheetApiReference />);
    const table = screen.getByRole('table', { name: 'Campos do estado' });
    const fields = within(table)
      .getAllByRole('rowheader')
      .map((cell) => cell.textContent);
    expect(fields).toEqual(['token', 'token.name', 'token.image', 'bars', 'values', 'canEdit']);
  });

  it('the error table lists every code the bridge can answer', () => {
    render(<SheetApiReference />);
    const table = screen.getByRole('table', { name: 'Códigos de erro' });
    const codes = within(table)
      .getAllByRole('rowheader')
      .map((cell) => cell.textContent);
    expect(CODES.filter((code) => !codes.includes(code))).toEqual([]);
  });

  it('explains how to find a bar id and that ready is what makes the state arrive', () => {
    render(<SheetApiReference />);
    expect(screen.getByRole('region', { name: 'Como achar a barra' })).toHaveTextContent(
      'console.log(lorkarium.bars.list())',
    );
    expect(
      screen.getByRole('region', { name: 'Como a ficha conversa com a mesa' }),
    ).toHaveTextContent('Sem ready(), nenhum estado chega');
  });

  it('reads the limits from the constants', () => {
    render(<SheetApiReference />);
    const limits = screen.getByRole('region', { name: 'Limites da ficha' });
    for (const text of ['512 KiB', '256 KiB', '1000 chaves', '8 níveis', '10 rolagens a cada 10 s'])
      expect(limits).toHaveTextContent(text);
  });
});
