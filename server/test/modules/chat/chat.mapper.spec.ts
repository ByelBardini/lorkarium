import type { ChatChannelDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  toChatCharacterSpeakerDto,
  toChatSentChannelDto,
  toChatSentDto,
  toChatTokenSpeakerDto,
} from '../../../src/modules/chat/chat.mapper';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID } from '../../support/campaigns-factories';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';
import { LYRA_ID } from '../../support/tokens-factories';

const GROUP_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

describe('toChatSentChannelDto', () => {
  it('a direct conversation names both people in ascending order, whoever sends', () => {
    const fromCaio = toChatSentChannelDto({ kind: 'direct', userId: BIA_ID }, CAIO_ID);
    const fromBia = toChatSentChannelDto({ kind: 'direct', userId: CAIO_ID }, BIA_ID);

    expect(fromCaio).toEqual({ kind: 'direct', userIds: [BIA_ID, CAIO_ID] });
    expect(fromBia).toEqual(fromCaio);
  });

  it('the Table, a whisper and a group keep the shape of the command', () => {
    const whisper = { kind: 'table', whisperTo: BIA_ID } as const;
    const group: ChatChannelDto = {
      kind: 'group',
      groupId: GROUP_ID,
      name: 'Conselho',
      memberIds: [ANA_ID, BIA_ID],
    };

    expect(toChatSentChannelDto(whisper, ANA_ID)).toEqual(whisper);
    expect(toChatSentChannelDto(group, ANA_ID)).toEqual(group);
  });
});

describe('toChatTokenSpeakerDto', () => {
  it('the token speaker carries the name it is given (the one read from the grid)', () => {
    expect(toChatTokenSpeakerDto({ sceneId: VHARN_SCENE_ID, tokenId: LYRA_ID }, 'Lyra')).toEqual({
      kind: 'token',
      sceneId: VHARN_SCENE_ID,
      tokenId: LYRA_ID,
      name: 'Lyra',
    });
  });
});

describe('toChatCharacterSpeakerDto', () => {
  it('names the character with the name read by the server', () => {
    expect(toChatCharacterSpeakerDto(LYRA_ID, 'Lyra')).toEqual({
      kind: 'character',
      characterId: LYRA_ID,
      name: 'Lyra',
    });
  });
});

describe('toChatSentDto', () => {
  const IMAGE_ID = '6d7e8f9a-0b1c-4d2e-8f3a-4b5c6d7e8f9a';
  const input = {
    command: {
      actionId: '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a',
      campaignId: '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a',
      channel: { kind: 'table', whisperTo: null } as const,
      speaker: { kind: 'self' } as const,
      text: '',
      image: { assetId: IMAGE_ID },
      replyTo: null,
    },
    messageId: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
    fromUserId: BIA_ID,
    speaker: { kind: 'self' } as const,
    at: '2026-10-27T20:00:00.000Z',
    customEmojis: [],
  };

  it('carries the picture it is given, with its size', () => {
    const image = { assetId: IMAGE_ID, width: 800, height: 600 };

    expect(toChatSentDto({ ...input, image }).image).toEqual(image);
  });

  it('a message without a picture carries null', () => {
    expect(toChatSentDto({ ...input, image: null }).image).toBeNull();
  });
});
