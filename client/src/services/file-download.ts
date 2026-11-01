import { downloadText } from '@/lib/download-text';

/** Saving a text as a file on the person's machine behind a project interface, so tests can read
 *  what was saved. */
export interface FileDownload {
  /** Hands `text` to the browser as `fileName`; `type` is the Blob's MIME (plain text by default). */
  save(text: string, fileName: string, type?: string): void;
}

/** `FileDownload` over a `Blob` and an `<a download>` click (works in the desktop shell too).
 *
 *  Example: `new BrowserFileDownload().save(fileText, 'Ficha Tormenta.lksheet', 'application/json')` */
export class BrowserFileDownload implements FileDownload {
  save(text: string, fileName: string, type?: string): void {
    downloadText(text, fileName, type);
  }
}
