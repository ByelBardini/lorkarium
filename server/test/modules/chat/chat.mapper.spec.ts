import type { ChatChannelDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { toChatSentChannelDto, toChatTokenSpeakerDto } from '../../../src/modules/chat/chat.mapper';
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
