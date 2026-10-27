import { describe, expect, it } from 'vitest';
import { desktopShellOf, isDesktopShell } from '@/lib/desktop-shell';

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

  it('the shell with its own title bar is still the shell', () => {
    expect(isDesktopShell(`${EDGE} LorkariumDesktop/1.2.0 LorkariumTitleBar/1`)).toBe(true);
  });
});

describe('desktopShellOf', () => {
  it('a browser user-agent is no shell', () => {
    expect(desktopShellOf(EDGE)).toBeNull();
  });

  it('a shell that only appends LorkariumDesktop/1.1.0 keeps the native title bar', () => {
    expect(desktopShellOf(`${EDGE} LorkariumDesktop/1.1.0`)).toEqual({
      version: '1.1.0',
      titleBar: false,
    });
  });

  it('a shell that also appends LorkariumTitleBar/1 draws its own title bar', () => {
    expect(desktopShellOf(`${EDGE} LorkariumDesktop/1.2.0 LorkariumTitleBar/1`)).toEqual({
      version: '1.2.0',
      titleBar: true,
    });
  });

  it('the title bar mark without LorkariumDesktop is no shell', () => {
    expect(desktopShellOf(`${EDGE} LorkariumTitleBar/1`)).toBeNull();
  });

  it.each([`${EDGE} LorkariumDesktop/`, `${EDGE} LorkariumDesktop/x.1`])(
    'a malformed shell version (%s) is no shell',
    (userAgent) => {
      expect(desktopShellOf(userAgent)).toBeNull();
    },
  );

  it('a title bar mark glued to another word does not count', () => {
    expect(desktopShellOf(`${EDGE} LorkariumDesktop/1.2.0 FakeLorkariumTitleBar/1`)).toEqual({
      version: '1.2.0',
      titleBar: false,
    });
  });
});
