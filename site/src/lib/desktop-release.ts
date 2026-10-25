import { z } from 'zod';

export const DESKTOP_RELEASE_REPO = 'ByelBardini/lorkarium';
export const LATEST_RELEASE_API_URL =
  'https://api.github.com/repos/ByelBardini/lorkarium/releases/latest';
export const RELEASES_PAGE_URL = 'https://github.com/ByelBardini/lorkarium/releases/latest';

export interface DesktopRelease {
  version: string;
  sizeBytes: number;
  url: string;
  publishedAt: string;
}

const INSTALLER_NAME = /^Lorkarium_(\d+\.\d+\.\d+)_x64-setup\.exe$/;
const DESKTOP_TAG = /^desktop-v(\d+\.\d+\.\d+)$/;

const githubAssetSchema = z.object({
  name: z.string(),
  size: z.number().int().positive(),
  browser_download_url: z.url({ protocol: /^https$/, hostname: /^github\.com$/ }),
});

const githubReleaseSchema = z.object({
  tag_name: z.string(),
  published_at: z.iso.datetime(),
  assets: z.array(z.unknown()),
});

const namedAssetSchema = z.object({ name: z.string() });

interface NamedInstaller {
  version: string;
  asset: unknown;
}

/**
 * The Windows installer of a GitHub `releases/latest` body, or null when the body has none it can trust.
 * Example: `desktopReleaseOf(await response.json())?.url // 'https://github.com/…/Lorkarium_0.3.1_x64-setup.exe'`
 */
export function desktopReleaseOf(body: unknown): DesktopRelease | null {
  const release = githubReleaseSchema.safeParse(body);
  if (!release.success) return null;
  const installer = chosenInstaller(release.data.assets, release.data.tag_name);
  const asset = githubAssetSchema.safeParse(installer?.asset);
  if (!installer || !asset.success) return null;
  return {
    version: installer.version,
    sizeBytes: asset.data.size,
    url: asset.data.browser_download_url,
    publishedAt: release.data.published_at,
  };
}

function chosenInstaller(assets: unknown[], tagName: string): NamedInstaller | null {
  const installers = assets.flatMap(namedInstallerOf);
  const tagVersion = DESKTOP_TAG.exec(tagName)?.[1];
  const tagged = installers.find((installer) => installer.version === tagVersion);
  if (tagged) return tagged;
  return installers.length === 1 ? (installers[0] ?? null) : null;
}

function namedInstallerOf(asset: unknown): NamedInstaller[] {
  const named = namedAssetSchema.safeParse(asset);
  const version = named.success ? INSTALLER_NAME.exec(named.data.name)?.[1] : undefined;
  return version ? [{ version, asset }] : [];
}
