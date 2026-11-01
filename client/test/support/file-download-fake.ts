import type { FileDownload } from '@/services/file-download';

/** One file handed to the browser; `type` is `undefined` when the caller kept the default. */
export type SavedFile = Readonly<{ text: string; fileName: string; type: string | undefined }>;

/** Records every file saved, in order, instead of touching the browser. */
export class FileDownloadFake implements FileDownload {
  readonly saves: SavedFile[] = [];

  save(text: string, fileName: string, type?: string): void {
    this.saves.push({ text, fileName, type });
  }
}
