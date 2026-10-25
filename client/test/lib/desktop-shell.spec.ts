import { describe, expect, it } from 'vitest';
import { isDesktopShell } from '@/lib/desktop-shell';

const EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0';

describe('isDesktopShell', () => {
  it('the WebView2 user-agent with LorkariumDesktop/0.1.0 appended is the desktop shell', () => {
    expect(isDesktopShell(`${EDGE} LorkariumDesktop/0.1.0`)).toBe(true);
  });

  it('the plain Edge user-agent is a browser', () => {
    expect(isDesktopShell(EDGE)).toBe(false);
  });

  it.each([`${EDGE} LorkariumDesktop`, `${EDGE} LorkariumDesktop/`])(
    'LorkariumDesktop without a version (%s) is not the shell',
    (userAgent) => {
      expect(isDesktopShell(userAgent)).toBe(false);
    },
  );

  it('a token that only ends in LorkariumDesktop/1.0 is not the shell', () => {
    expect(isDesktopShell(`${EDGE} FakeLorkariumDesktop/1.0`)).toBe(false);
  });
});
