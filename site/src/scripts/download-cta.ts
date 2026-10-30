import type { DesktopRelease } from '@/lib/desktop-release';
import { fileSizeLabel } from '@/lib/file-size';
import type { VisitorPlatform } from '@/lib/visitor-platform';
import type { LinkClipboard } from '@/services/link-clipboard';
import type { ReleaseSource } from '@/services/release-source';

export interface DownloadCtaContext {
  source: ReleaseSource;
  platform: VisitorPlatform;
  clipboard: LinkClipboard;
  /** The landing address a phone visitor copies to open on a computer. */
  pageUrl: string;
}

const NOTE_OF_PLATFORM: Record<VisitorPlatform, string | null> = {
  windows: null,
  unknown: null,
  mac: 'desktop-browser',
  linux: 'desktop-browser',
  mobile: 'mobile',
};

const COPIED = 'Link copiado.';
const NOT_COPIED = 'Não foi possível copiar o link. Copie o endereço na barra do navegador.';

/**
 * Fills the download lines with the latest release and shows the note for a non-Windows visitor.
 * Example: `await enhanceDownloadCtas(document, { source, platform: 'mac', clipboard, pageUrl })`
 */
export async function enhanceDownloadCtas(
  root: Document,
  { source, platform, clipboard, pageUrl }: DownloadCtaContext,
): Promise<void> {
  showPlatformNote(root, platform);
  wireCopyLink(root, clipboard, pageUrl);
  const release = await source.latest();
  if (release === null) return;
  showRelease(root, release);
}

function showPlatformNote(root: Document, platform: VisitorPlatform): void {
  const wanted = NOTE_OF_PLATFORM[platform];
  for (const note of root.querySelectorAll<HTMLElement>('[data-platform-note]')) {
    note.hidden = note.dataset.platformNote !== wanted;
  }
}

function wireCopyLink(root: Document, clipboard: LinkClipboard, pageUrl: string): void {
  const status = root.querySelector('[data-copy-status]');
  root.querySelector('[data-copy-link]')?.addEventListener('click', async () => {
    const copied = await clipboard.copy(pageUrl);
    if (status) status.textContent = copied ? COPIED : NOT_COPIED;
  });
}

function showRelease(root: Document, release: DesktopRelease): void {
  for (const meta of root.querySelectorAll<HTMLElement>('[data-release-meta]')) {
    setText(meta, '[data-release-version]', release.version);
    setText(meta, '[data-release-size]', fileSizeLabel(release.sizeBytes));
    meta.hidden = false;
  }
}

function setText(scope: HTMLElement, selector: string, text: string): void {
  const target = scope.querySelector(selector);
  if (target) target.textContent = text;
}
