import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BrowserFileDownload } from '@/services/file-download';

/** Stands for the browser's object URLs (jsdom has none) and remembers the Blobs made. */
class ObjectUrlsFake {
  readonly made: Blob[] = [];
  readonly revoked: string[] = [];
  create = (blob: Blob): string => {
    this.made.push(blob);
    return `blob:fake/${this.made.length}`;
  };
  revoke = (url: string): void => {
    this.revoked.push(url);
  };
}

/** Stands for the click on the `<a download>`, remembering which file name it asked for. */
class AnchorClicksFake {
  readonly fileNames: string[] = [];
  readonly record = (anchor: HTMLAnchorElement): void => {
    this.fileNames.push(anchor.download);
  };
}

describe('BrowserFileDownload', () => {
  const original = {
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
    click: HTMLAnchorElement.prototype.click,
  };
  let urls: ObjectUrlsFake;
  let clicks: AnchorClicksFake;

  beforeEach(() => {
    urls = new ObjectUrlsFake();
    clicks = new AnchorClicksFake();
    URL.createObjectURL = urls.create;
    URL.revokeObjectURL = urls.revoke;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement): void {
      clicks.record(this);
    };
  });

  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
    HTMLAnchorElement.prototype.click = original.click;
  });

  it('saves the text under the file name with the type passed', async () => {
    new BrowserFileDownload().save('{"v":3}', 'Ficha Tormenta.lksheet', 'application/json');
    expect(clicks.fileNames).toEqual(['Ficha Tormenta.lksheet']);
    expect(urls.made[0]?.type).toBe('application/json');
    expect(await urls.made[0]?.text()).toBe('{"v":3}');
    expect(urls.revoked).toEqual(['blob:fake/1']);
  });

  it('falls back to plain UTF-8 text when no type is passed', () => {
    new BrowserFileDownload().save('k7m2p-9qrst\n', 'codigos.txt');
    expect(urls.made[0]?.type).toBe('text/plain;charset=utf-8');
  });
});
