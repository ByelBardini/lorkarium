import { describe, expect, it } from 'vitest';
import {
  deviceOf,
  toAccountSecurityDto,
  toAccountSessionDto,
} from '../../../src/modules/account-security/account-security.mapper';
import { authSessionPo } from '../../support/auth-factories';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';
const EDGE_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.58 Mobile Safari/537.36';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const OPERA_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/115.0.0.0';

describe('deviceOf', () => {
  it.each([
    [
      'Chrome on Windows',
      CHROME_WINDOWS,
      { browser: 'chrome', os: 'windows', formFactor: 'desktop' },
    ],
    ['Safari on the iPhone', SAFARI_IPHONE, { browser: 'safari', os: 'ios', formFactor: 'mobile' }],
    ['Firefox on Linux', FIREFOX_LINUX, { browser: 'firefox', os: 'linux', formFactor: 'desktop' }],
    ['Edge (not Chrome)', EDGE_WINDOWS, { browser: 'edge', os: 'windows', formFactor: 'desktop' }],
    [
      'Chrome on Android',
      CHROME_ANDROID,
      { browser: 'chrome', os: 'android', formFactor: 'mobile' },
    ],
    ['Safari on the Mac', SAFARI_MAC, { browser: 'safari', os: 'macos', formFactor: 'desktop' }],
    [
      'Opera (not Chrome)',
      OPERA_WINDOWS,
      { browser: 'opera', os: 'windows', formFactor: 'desktop' },
    ],
  ])('%s is read from its user agent', (_label, agent, device) => {
    expect(deviceOf(agent)).toEqual(device);
  });

  it.each([
    ['an empty agent', ''],
    ['no agent at all', null],
    ['curl', 'curl/8.5.0'],
  ])('%s is other all along', (_label, agent) => {
    expect(deviceOf(agent)).toEqual({ browser: 'other', os: 'other', formFactor: 'other' });
  });
});

describe('toAccountSessionDto', () => {
  const row = authSessionPo({
    id: 'sha:token-da-ana',
    publicId: '5b1d7c2e-8f4a-4e6b-9c3d-2a1f0e9d8c7b',
    userAgent: CHROME_WINDOWS,
    createdAt: new Date('2026-10-01T12:00:00Z'),
    lastSeenAt: new Date('2026-10-13T08:30:00Z'),
  });

  it('shows the public id and the device, never the token hash', () => {
    const dto = toAccountSessionDto(row, 'sha:outra');
    expect(dto).toEqual({
      id: '5b1d7c2e-8f4a-4e6b-9c3d-2a1f0e9d8c7b',
      browser: 'chrome',
      os: 'windows',
      formFactor: 'desktop',
      createdAt: '2026-10-01T12:00:00.000Z',
      lastSeenAt: '2026-10-13T08:30:00.000Z',
      current: false,
    });
    expect(JSON.stringify(dto)).not.toContain('sha:token-da-ana');
  });

  it('the session making the request is the current one', () => {
    expect(toAccountSessionDto(row, 'sha:token-da-ana').current).toBe(true);
  });
});

describe('toAccountSecurityDto', () => {
  it('turns the dates into ISO and nests the 2FA facts', () => {
    expect(
      toAccountSecurityDto({
        email: 'ana@mesa.com',
        passwordChangedAt: new Date('2026-10-10T10:00:00Z'),
        pendingEmail: 'b*****@x.com',
        twoFactorEnabled: true,
        recoveryCodesLeft: 7,
      }),
    ).toEqual({
      email: 'ana@mesa.com',
      passwordChangedAt: '2026-10-10T10:00:00.000Z',
      pendingEmail: 'b*****@x.com',
      twoFactor: { enabled: true, recoveryCodesLeft: 7 },
    });
  });

  it('a password never changed is null', () => {
    const facts = {
      email: 'ana@mesa.com',
      passwordChangedAt: null,
      pendingEmail: null,
      twoFactorEnabled: false,
      recoveryCodesLeft: 0,
    };
    expect(toAccountSecurityDto(facts).passwordChangedAt).toBeNull();
  });
});
