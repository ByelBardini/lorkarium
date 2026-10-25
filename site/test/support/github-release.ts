import type { DesktopRelease } from '@/lib/desktop-release';

export const INSTALLER_URL =
  'https://github.com/ByelBardini/lorkarium/releases/download/desktop-v0.3.1/Lorkarium_0.3.1_x64-setup.exe';

export interface GithubAssetBody {
  name: string;
  size: number;
  browser_download_url: string;
}

export interface GithubReleaseBody {
  tag_name: string;
  published_at: string;
  assets: GithubAssetBody[];
}

/**
 * A `releases/latest` body for desktop-v0.3.1: the installer, its signature and the updater manifest.
 * Example: `githubReleaseBody({ tag_name: 'desktop-v0.4.0' })`
 */
export function githubReleaseBody(overrides: Partial<GithubReleaseBody> = {}): GithubReleaseBody {
  return {
    tag_name: 'desktop-v0.3.1',
    published_at: '2026-10-20T18:42:00Z',
    assets: [
      installerAsset('0.3.1'),
      githubAsset('Lorkarium_0.3.1_x64-setup.exe.sig', 412),
      githubAsset('latest.json', 1290),
    ],
    ...overrides,
  };
}

/**
 * The NSIS installer asset of a version, 8 808 038 bytes unless told otherwise.
 * Example: `installerAsset('0.3.0', { size: 1 })`
 */
export function installerAsset(
  version: string,
  overrides: Partial<GithubAssetBody> = {},
): GithubAssetBody {
  return { ...githubAsset(`Lorkarium_${version}_x64-setup.exe`, 8_808_038), ...overrides };
}

function githubAsset(name: string, size: number): GithubAssetBody {
  const tag = name.match(/\d+\.\d+\.\d+/)?.[0] ?? '0.3.1';
  return {
    name,
    size,
    browser_download_url: `https://github.com/ByelBardini/lorkarium/releases/download/desktop-v${tag}/${name}`,
  };
}

/** What `desktopReleaseOf` returns for the default body. */
export const RELEASE_0_3_1: DesktopRelease = {
  version: '0.3.1',
  sizeBytes: 8_808_038,
  url: INSTALLER_URL,
  publishedAt: '2026-10-20T18:42:00Z',
};
