import { describe, expect, it } from 'vitest';
import { visitorPlatformOf, type VisitorPlatform } from '@/lib/visitor-platform';

const EDGE_WINDOWS_11 =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
const SAFARI_MACOS =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const FIREFOX_UBUNTU =
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

describe('visitorPlatformOf', () => {
  it.each<[string, VisitorPlatform, string, number]>([
    ['Edge on Windows 11', 'windows', EDGE_WINDOWS_11, 0],
    ['Safari on macOS', 'mac', SAFARI_MACOS, 0],
    ['Firefox on Ubuntu', 'linux', FIREFOX_UBUNTU, 0],
    ['Chrome on Android, whose UA also says Linux', 'mobile', CHROME_ANDROID, 5],
    ['Safari on iPhone, whose UA also says Mac OS X', 'mobile', SAFARI_IPHONE, 5],
    ['iPad posing as a Mac with a touch screen', 'mobile', SAFARI_MACOS, 5],
    ['an empty user agent', 'unknown', '', 0],
    ['an unrecognized user agent', 'unknown', 'curl/8.10.1', 0],
  ])('%s is %s', (_label, platform, userAgent, maxTouchPoints) => {
    expect(visitorPlatformOf({ userAgent, maxTouchPoints })).toBe(platform);
  });

  it('a Windows laptop with a touch screen is still windows', () => {
    expect(visitorPlatformOf({ userAgent: EDGE_WINDOWS_11, maxTouchPoints: 10 })).toBe('windows');
  });
});
