// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BrowserSessionCache } from '@/services/session-cache';

describe('BrowserSessionCache', () => {
  it('a written value is read back from the sessionStorage', () => {
    new BrowserSessionCache().write('lorkarium:test', 'valor');

    expect(sessionStorage.getItem('lorkarium:test')).toBe('valor');
    expect(new BrowserSessionCache().read('lorkarium:test')).toBe('valor');
  });

  it('a key never written reads null', () => {
    expect(new BrowserSessionCache().read('lorkarium:ausente')).toBeNull();
  });
});
