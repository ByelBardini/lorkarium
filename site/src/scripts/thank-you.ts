import { fileSizeLabel } from '@/lib/file-size';
import type { PageNavigator } from '@/services/page-navigator';
import type { ReleaseSource } from '@/services/release-source';

export interface ThankYouContext {
  source: ReleaseSource;
  navigator: PageNavigator;
}

/**
 * Starts the installer download on the thank-you page, or explains the fallback when the latest
 * release cannot be read; the manual link to the releases page works from the first paint.
 * Example: `await startDesktopDownload(document, { source, navigator: new WindowNavigator() })`
 */
export async function startDesktopDownload(
  root: Document,
  { source, navigator }: ThankYouContext,
): Promise<void> {
  const release = await source.latest();
  if (release === null) {
    root.querySelector<HTMLElement>('[data-download-fallback]')?.removeAttribute('hidden');
    return;
  }
  root.querySelector('a[data-manual-download]')?.setAttribute('href', release.url);
  const label = root.querySelector('[data-release-label]');
  if (label)
    label.textContent = `Lorkarium ${release.version} · ${fileSizeLabel(release.sizeBytes)}`;
  navigator.assign(release.url);
}
