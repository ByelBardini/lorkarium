import { describe, expect, it } from 'vitest';
import { deviceLabel } from '../../src/account/device-label';

describe('deviceLabel', () => {
  it.each([
    [{ browser: 'chrome', os: 'windows' }, 'Chrome no Windows'],
    [{ browser: 'safari', os: 'ios' }, 'Safari no iOS'],
    [{ browser: 'edge', os: 'macos' }, 'Edge no macOS'],
    [{ browser: 'firefox', os: 'other' }, 'Firefox'],
    [{ browser: 'other', os: 'android' }, 'Navegador no Android'],
    [{ browser: 'other', os: 'other' }, 'Navegador desconhecido'],
    [{ browser: 'lorkarium', os: 'windows' }, 'Lorkarium para Windows'],
    [{ browser: 'lorkarium', os: 'other' }, 'Lorkarium'],
    [{ browser: 'edge', os: 'windows' }, 'Edge no Windows'],
  ] as const)('%o reads "%s"', (device, label) => {
    expect(deviceLabel(device)).toBe(label);
  });
});
