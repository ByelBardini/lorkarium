import { describe, expect, it } from 'vitest';
import { ChatImageBo } from '../../../src/modules/chat/chat-image.bo';
import { ChatImageNotFoundError } from '../../../src/modules/chat/chat.error';
import type { AssetPo } from '../../../src/modules/assets/assets.po';
import { CHAT_IMAGE_ID, chatImagePo } from '../../support/assets-factories';
import { BIA_ID, CAIO_ID } from '../../support/campaigns-factories';

const SENT_AT = new Date('2026-10-27T19:00:00Z');
const HOUR = 60 * 60 * 1000;
const AN_HOUR_LATER = new Date(SENT_AT.getTime() + HOUR);

function usableBy(row: AssetPo | undefined, now: Date = AN_HOUR_LATER): () => unknown {
  return () => new ChatImageBo(CHAT_IMAGE_ID, row).requireUsableBy(BIA_ID, now);
}

describe('ChatImageBo.requireUsableBy', () => {
  it("Bia's chat image of an hour ago comes back with the size of the row", () => {
    const image = usableBy(chatImagePo({ ownerId: BIA_ID }))();

    expect(image).toEqual({ assetId: CHAT_IMAGE_ID, width: 800, height: 600 });
  });

  it('a missing row is CHAT_IMAGE_NOT_FOUND citing the id and the sender', () => {
    const missing = usableBy(undefined);

    expect(missing).toThrow(ChatImageNotFoundError);
    expect(missing).toThrow(`asset ${CHAT_IMAGE_ID} is not a chat image of user ${BIA_ID}`);
  });

  it("Caio's chat image cited by Bia is refused", () => {
    expect(usableBy(chatImagePo({ ownerId: CAIO_ID }))).toThrow(ChatImageNotFoundError);
  });

  it('an asset of another purpose (a token) is refused', () => {
    const token = chatImagePo({ ownerId: BIA_ID, purpose: 'token' });

    expect(usableBy(token)).toThrow(ChatImageNotFoundError);
  });

  it('one of 23 h 59 passes, one of exactly 24 h is refused (the sweep may have taken it)', () => {
    const row = chatImagePo({ ownerId: BIA_ID });
    const almost = new Date(SENT_AT.getTime() + 24 * HOUR - 60_000);
    const day = new Date(SENT_AT.getTime() + 24 * HOUR);

    expect(usableBy(row, almost)).not.toThrow();
    expect(usableBy(row, day)).toThrow(ChatImageNotFoundError);
  });
});
