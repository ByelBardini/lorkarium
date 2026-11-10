import { describe, expect, it } from 'vitest';
import {
  inlineHandlerNotice,
  sheetSourceSizeLabel,
  sheetTemplateFailureMessage,
  sheetTemplateFileProblemMessage,
} from '@/features/sheets/sheet-template-messages';

describe('sheet template messages', () => {
  it('the size reads in KiB with one decimal against the 512 KiB budget', () => {
    expect(sheetSourceSizeLabel(12_600)).toBe('12,3 KiB de 512 KiB');
    expect(sheetSourceSizeLabel(0)).toBe('0 KiB de 512 KiB');
  });

  it('a template in use says to unlink its sheets first', () => {
    expect(sheetTemplateFailureMessage('in_use')).toMatch(/ligado a fichas/u);
  });

  it('a file of a newer format says it came from a newer Lorkarium', () => {
    expect(sheetTemplateFileProblemMessage('newer_version')).toBe(
      'Este arquivo foi feito numa versão mais nova do Lorkarium.',
    );
  });

  it('a file that is not JSON or not a .lksheet says it is not a sheet template', () => {
    const notTemplate = 'Este arquivo não é um modelo de ficha (.lksheet).';
    expect(sheetTemplateFileProblemMessage('not_json')).toBe(notTemplate);
    expect(sheetTemplateFileProblemMessage('not_lksheet')).toBe(notTemplate);
  });

  it('code over the budget names the 512 KiB limit and a broken file says so', () => {
    expect(sheetTemplateFileProblemMessage('over_budget')).toMatch(/512 KiB/u);
    expect(sheetTemplateFileProblemMessage('invalid')).toMatch(/incompleto/u);
  });
});

describe('inlineHandlerNotice', () => {
  it('one attribute says it will not run, its file and its line', () => {
    expect(
      inlineHandlerNotice([{ path: 'index.html', handlers: [{ line: 3, attribute: 'onclick' }] }]),
    ).toBe('1 atributo de evento não vai rodar · index.html, linha 3');
  });

  it('several say how many and each line once, in order', () => {
    const handlers = [
      { line: 7, attribute: 'onclick' },
      { line: 3, attribute: 'onmouseover' },
      { line: 3, attribute: 'onmouseout' },
      { line: 12, attribute: 'href' },
    ];
    expect(inlineHandlerNotice([{ path: 'index.html', handlers }])).toBe(
      '4 atributos de evento não vão rodar · index.html, linhas 3, 7 e 12',
    );
  });

  it('counts across files and names each file with its lines, skipping clean ones', () => {
    expect(
      inlineHandlerNotice([
        { path: 'index.html', handlers: [{ line: 2, attribute: 'onclick' }] },
        { path: 'paginas/limpa.html', handlers: [] },
        { path: 'paginas/perfil.html', handlers: [{ line: 5, attribute: 'onerror' }] },
      ]),
    ).toBe(
      '2 atributos de evento não vão rodar · index.html, linha 2; paginas/perfil.html, linha 5',
    );
  });

  it('none says nothing', () => {
    expect(inlineHandlerNotice([])).toBe('');
    expect(inlineHandlerNotice([{ path: 'index.html', handlers: [] }])).toBe('');
  });
});
