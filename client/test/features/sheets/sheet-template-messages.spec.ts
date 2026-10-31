import { describe, expect, it } from 'vitest';
import {
  sheetSourceSizeLabel,
  sheetTemplateFailureMessage,
} from '@/features/sheets/sheet-template-messages';

describe('sheet template messages', () => {
  it('the size reads in KiB with one decimal against the 512 KiB budget', () => {
    expect(sheetSourceSizeLabel(12_600)).toBe('12,3 KiB de 512 KiB');
    expect(sheetSourceSizeLabel(0)).toBe('0 KiB de 512 KiB');
  });

  it('a template in use says to unlink its sheets first', () => {
    expect(sheetTemplateFailureMessage('in_use')).toMatch(/ligado a fichas/u);
  });
});
