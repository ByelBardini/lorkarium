import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import type { CampaignRole } from '../../../src/modules/campaigns/campaign-access.bo';
import { ForbiddenActionError } from '../../../src/modules/campaigns/campaigns.error';
import {
  ChatMessageBo,
  type ChatChannel,
  type ChatSpeaker,
} from '../../../src/modules/chat/chat-message.bo';
import {
  ChatRecipientIsSenderError,
  ChatSenderNotInGroupError,
  ChatSpeakerNotAllowedError,
} from '../../../src/modules/chat/chat.error';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, DUDA_ID, VHARN_ID } from '../../support/campaigns-factories';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';
import { LYRA_ID } from '../../support/tokens-factories';

const GROUP_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const TABLE: ChatChannel = { kind: 'table', whisperTo: null };
const SELF: ChatSpeaker = { kind: 'self' };
const AS_LYRA: ChatSpeaker = { kind: 'token', sceneId: VHARN_SCENE_ID, tokenId: LYRA_ID };

function group(memberIds: string[]): ChatChannel {
  return { kind: 'group', groupId: GROUP_ID, name: 'Conselho', memberIds };
}

function accessOf(userId: string, role: CampaignRole): CampaignAccessBo {
  return new CampaignAccessBo({ campaignId: VHARN_ID, userId, role });
}

describe('ChatMessageBo.audience', () => {
  it('the Table without a whisper goes to the whole table and checks no recipient', () => {
    const message = new ChatMessageBo(ANA_ID, TABLE);

    expect(message.audience()).toEqual({ kind: 'table' });
    expect(message.recipientIds()).toEqual([]);
  });

  it('Ana whispering to Bia reaches only the two of them; Bia is the one to check', () => {
    const message = new ChatMessageBo(ANA_ID, { kind: 'table', whisperTo: BIA_ID });

    expect(message.audience()).toEqual({ kind: 'people', userIds: [ANA_ID, BIA_ID] });
    expect(message.recipientIds()).toEqual([BIA_ID]);
  });

  it('a direct message from Caio to Bia reaches the two of them', () => {
    const message = new ChatMessageBo(CAIO_ID, { kind: 'direct', userId: BIA_ID });

    expect(message.audience()).toEqual({ kind: 'people', userIds: [CAIO_ID, BIA_ID] });
    expect(message.recipientIds()).toEqual([BIA_ID]);
  });

  it('a group reaches every member, the sender included; the others are checked', () => {
    const message = new ChatMessageBo(BIA_ID, group([CAIO_ID, BIA_ID, DUDA_ID]));

    expect(message.audience()).toEqual({ kind: 'people', userIds: [CAIO_ID, BIA_ID, DUDA_ID] });
    expect(message.recipientIds()).toEqual([CAIO_ID, DUDA_ID]);
  });

  it('a whisper to oneself is refused citing the sender', () => {
    const message = new ChatMessageBo(BIA_ID, { kind: 'table', whisperTo: BIA_ID });

    expect(() => message.audience()).toThrow(ChatRecipientIsSenderError);
    expect(() => message.audience()).toThrow(
      `user ${BIA_ID} cannot send a whisper message to themselves`,
    );
  });

  it('a direct message to oneself is refused', () => {
    const message = new ChatMessageBo(BIA_ID, { kind: 'direct', userId: BIA_ID });

    expect(() => message.audience()).toThrow(ChatRecipientIsSenderError);
  });

  it('a group the sender is not in is refused citing the group and the sender', () => {
    const message = new ChatMessageBo(ANA_ID, group([BIA_ID, CAIO_ID]));

    expect(() => message.audience()).toThrow(ChatSenderNotInGroupError);
    expect(() => message.audience()).toThrow(`user ${ANA_ID} is not in chat group ${GROUP_ID}`);
  });
});

describe('ChatMessageBo.requireSpeaker', () => {
  it('anyone speaks as themselves in every channel, the spectator included', () => {
    const channels = [TABLE, { kind: 'direct', userId: BIA_ID } as const, group([DUDA_ID, BIA_ID])];

    for (const channel of channels) {
      expect(() =>
        new ChatMessageBo(DUDA_ID, channel).requireSpeaker(SELF, accessOf(DUDA_ID, 'spectator')),
      ).not.toThrow();
    }
  });

  it('a player may speak as a token on the Table without a whisper', () => {
    const message = new ChatMessageBo(BIA_ID, TABLE);

    expect(() => message.requireSpeaker(AS_LYRA, accessOf(BIA_ID, 'player'))).not.toThrow();
  });

  it.each([
    ['a whisper', { kind: 'table', whisperTo: CAIO_ID } as const, 'whisper'],
    ['a direct message', { kind: 'direct', userId: CAIO_ID } as const, 'direct'],
    ['a group', group([BIA_ID, CAIO_ID]), 'group'],
  ])('speaking as a token in %s is CHAT_SPEAKER_NOT_ALLOWED', (_, channel, kind) => {
    const message = new ChatMessageBo(BIA_ID, channel);

    const refused = (): void => message.requireSpeaker(AS_LYRA, accessOf(BIA_ID, 'master'));

    expect(refused).toThrow(ChatSpeakerNotAllowedError);
    expect(refused).toThrow(`speaking as a token is not allowed in a ${kind} message`);
  });

  it('the spectator speaking as a token on the Table is FORBIDDEN', () => {
    const message = new ChatMessageBo(DUDA_ID, TABLE);

    const refused = (): void => message.requireSpeaker(AS_LYRA, accessOf(DUDA_ID, 'spectator'));

    expect(refused).toThrow(ForbiddenActionError);
  });
});
