import type { AssetDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_CHAT_ATTACHMENT,
  attachingFile,
  attachingLink,
  attachmentAfterUpload,
  canSendWith,
  chatImageLinkOf,
  chatImageRefOf,
} from '@/lib/chat-attachment';
import type { AssetsFailure } from '@/services/assets-api';

const MIB = 1024 * 1024;
const ASSET: AssetDto = {
  id: '6d7e8f9a-0b1c-4d2e-8f3a-4b5c6d7e8f9a',
  mimeType: 'image/png',
  width: 800,
  height: 600,
};
const PNG = { type: 'image/png', size: 2 * MIB };

describe('picking a file', () => {
  it('a PNG of 2 MiB goes out', () => {
    expect(attachingFile(1, PNG)).toEqual({ kind: 'uploading', uploadId: 1 });
  });

  it('a GIF and a file of exactly 10 MiB go out too', () => {
    expect(attachingFile(1, { type: 'image/gif', size: 10 * MIB }).kind).toBe('uploading');
  });

  it('text/plain is rejected for its type, an SVG too', () => {
    expect(attachingFile(1, { type: 'text/plain', size: 10 })).toEqual({
      kind: 'rejected',
      reason: 'type',
    });
    expect(attachingFile(1, { type: 'image/svg+xml', size: 10 })).toMatchObject({
      reason: 'type',
    });
  });

  it('a file of 11 MiB is rejected for its size before any request', () => {
    expect(attachingFile(1, { type: 'image/png', size: 11 * MIB })).toEqual({
      kind: 'rejected',
      reason: 'size',
    });
  });
});

describe('pasting a link (Ctrl+I)', () => {
  it('an https link with spaces around goes out trimmed', () => {
    expect(chatImageLinkOf('  https://x.com/a.png  ')).toBe('https://x.com/a.png');
    expect(attachingLink(2, '  https://x.com/a.png  ')).toEqual({ kind: 'uploading', uploadId: 2 });
  });

  it('text that is not an http(s) link is rejected without asking the server', () => {
    expect(attachingLink(2, 'olha isso')).toEqual({ kind: 'rejected', reason: 'link' });
    expect(attachingLink(2, 'ftp://x.com/a.png')).toEqual({ kind: 'rejected', reason: 'link' });
    expect(chatImageLinkOf('javascript:alert(1)')).toBeNull();
  });
});

describe('the answer of the server', () => {
  const uploading = attachingFile(1, PNG);

  it('ok makes it ready with the size the server kept', () => {
    expect(attachmentAfterUpload(uploading, 1, { ok: true, asset: ASSET })).toEqual({
      kind: 'ready',
      uploadId: 1,
      image: { assetId: ASSET.id, width: 800, height: 600 },
    });
  });

  const planLimit = { resource: 'storage', limit: 1, plan: 'free', reason: 'room' } as const;

  it.each<[AssetsFailure]>([
    [{ kind: 'plan_limit', planLimit }],
    [{ kind: 'rate_limited', retryAfterSeconds: 7 }],
    [{ kind: 'link_blocked' }],
    [{ kind: 'link_unreachable' }],
  ])('a refusal (%o) fails with it', (failure) => {
    expect(attachmentAfterUpload(uploading, 1, { ok: false, failure })).toEqual({
      kind: 'failed',
      failure,
    });
  });

  it('the answer of a replaced send is ignored: the newer one stays on its way', () => {
    const newer = attachingFile(2, PNG);

    expect(attachmentAfterUpload(newer, 1, { ok: true, asset: ASSET })).toBe(newer);
  });

  it('an answer after removing the picture leaves it empty', () => {
    expect(attachmentAfterUpload(EMPTY_CHAT_ATTACHMENT, 1, { ok: true, asset: ASSET })).toBe(
      EMPTY_CHAT_ATTACHMENT,
    );
  });
});

describe('sending', () => {
  const ready = attachmentAfterUpload(attachingFile(1, PNG), 1, {
    ok: true,
    asset: ASSET,
  });

  it('a ready picture with an empty caption can go and cites its id', () => {
    expect(canSendWith(ready, '')).toBe(true);
    expect(chatImageRefOf(ready)).toEqual({ assetId: ASSET.id });
  });

  it('nothing goes while the picture is on its way, not even with text', () => {
    expect(canSendWith(attachingFile(1, PNG), 'olha')).toBe(false);
  });

  it('without a picture, only text that is not blank goes', () => {
    expect(canSendWith(EMPTY_CHAT_ATTACHMENT, 'oi')).toBe(true);
    expect(canSendWith(EMPTY_CHAT_ATTACHMENT, '   ')).toBe(false);
    expect(chatImageRefOf(EMPTY_CHAT_ATTACHMENT)).toBeNull();
  });

  it('a refused picture does not hold the text back', () => {
    expect(canSendWith({ kind: 'rejected', reason: 'size' }, 'oi')).toBe(true);
  });
});
