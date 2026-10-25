import { describe, expect, it } from 'vitest';
import { desktopReleaseOf } from '@/lib/desktop-release';
import { githubReleaseBody, installerAsset, RELEASE_0_3_1 } from '../support/github-release';

describe('desktopReleaseOf', () => {
  it('reads version, size, url and date from the installer, ignoring the .sig and latest.json', () => {
    expect(desktopReleaseOf(githubReleaseBody())).toEqual(RELEASE_0_3_1);
  });

  it('a release without an installer asset is null', () => {
    const body = githubReleaseBody({ assets: [] });

    expect(desktopReleaseOf(body)).toBeNull();
  });

  it('with two installers, the one matching the desktop-v tag wins', () => {
    const body = githubReleaseBody({
      assets: [installerAsset('0.3.0', { size: 7_000_000 }), installerAsset('0.3.1')],
    });

    expect(desktopReleaseOf(body)).toEqual(RELEASE_0_3_1);
  });

  it('with two installers and none matching the tag, it is null', () => {
    const body = githubReleaseBody({
      tag_name: 'desktop-v0.4.0',
      assets: [installerAsset('0.3.0'), installerAsset('0.3.1')],
    });

    expect(desktopReleaseOf(body)).toBeNull();
  });

  it('a lone installer is taken even when the tag does not carry its version', () => {
    const body = githubReleaseBody({ tag_name: 'v-sem-versao' });

    expect(desktopReleaseOf(body)).toEqual(RELEASE_0_3_1);
  });

  it.each([
    ['a negative size', installerAsset('0.3.1', { size: -1 })],
    ['a fractional size', installerAsset('0.3.1', { size: 1.5 })],
    [
      'a url outside github.com',
      installerAsset('0.3.1', { browser_download_url: 'https://evil.test/x.exe' }),
    ],
    [
      'a github look-alike host',
      installerAsset('0.3.1', { browser_download_url: 'https://github.com.evil.test/x.exe' }),
    ],
  ])('an installer with %s is null', (_label, asset) => {
    expect(desktopReleaseOf(githubReleaseBody({ assets: [asset] }))).toBeNull();
  });

  it.each(['tag_name', 'published_at', 'assets'] as const)('a body without %s is null', (field) => {
    const body: Record<string, unknown> = { ...githubReleaseBody() };
    delete body[field];

    expect(desktopReleaseOf(body)).toBeNull();
  });

  it.each([null, undefined, 'not found', 42, []])(
    'a non-object body (%j) is null without throwing',
    (body) => {
      expect(desktopReleaseOf(body)).toBeNull();
    },
  );
});
