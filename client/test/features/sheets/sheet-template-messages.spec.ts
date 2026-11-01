import { describe, expect, it } from 'vitest';
import {
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
