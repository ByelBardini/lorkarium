import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { downloadText } from '@/lib/download-text';

/** Stands for the browser's object URLs (jsdom has none) and remembers what was made and freed. */
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

describe('downloadText', () => {
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  let urls: ObjectUrlsFake;

  beforeEach(() => {
    urls = new ObjectUrlsFake();
    URL.createObjectURL = urls.create;
    URL.revokeObjectURL = urls.revoke;
  });

  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
  });

  it('makes a text Blob of the content and frees its URL after the click', () => {
    downloadText('k7m2p-9qrst\n', 'codigos.txt');
    expect(urls.made).toHaveLength(1);
    expect(urls.made[0]?.size).toBe('k7m2p-9qrst\n'.length);
    expect(urls.made[0]?.type).toContain('text/plain');
    expect(urls.revoked).toEqual(['blob:fake/1']);
  });
});
