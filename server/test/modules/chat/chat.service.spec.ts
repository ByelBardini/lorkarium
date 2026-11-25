import type { ChatChannelDto, ChatSendCommandDto, ChatSpeakerDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  CampaignNotFoundError,
  ForbiddenActionError,
} from '../../../src/modules/campaigns/campaigns.error';
import {
  ChatRecipientNotMemberError,
  ChatSenderNotInGroupError,
  ChatSpeakerNotAllowedError,
} from '../../../src/modules/chat/chat.error';
import { CharacterNotFoundError } from '../../../src/modules/characters/characters.error';
import { ChatService } from '../../../src/modules/chat/chat.service';
import { SceneNotFoundError } from '../../../src/modules/scenes/scenes.error';
import { TokenNotFoundError } from '../../../src/modules/tokens/tokens.error';
import { ClockFake } from '../../support/auth-fakes';
import { ANA_ID } from '../../support/auth-factories';
import { MembershipReadsFake } from '../../support/campaigns-fakes';
import {
  BIA_ID,
  CAIO_ID,
  DUDA_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';
import { characterRow, LYRA_CHARACTER_ID } from '../../support/characters-factories';
import { CharactersDaoFake } from '../../support/characters-fakes';
import { ChatPublisherFake } from '../../support/chat-fakes';
import { CustomEmojiRefsFake } from '../../support/custom-emojis-fakes';
import { GridAudienceFake } from '../../support/pings-fakes';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';
import { TokensDaoFake } from '../../support/tokens-fakes';
import { LYRA_ID, lyraRow } from '../../support/tokens-factories';

const NOW = new Date('2026-10-27T20:00:00Z');
const MESSAGE_ID = '2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b';
const QUOTED_ID = '3f4a5b6c-7d8e-4f9a-8b1c-2d3e4f5a6b7c';
const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const OTHER_TABLE_ID = '4c2f0b63-7d5e-4a9b-8f3c-2b8d6e4a9f21';
const GROUP_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const MISSING_TOKEN_ID = '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a';
const CONNECTION = 'socket-1';
const TABLE: ChatChannelDto = { kind: 'table', whisperTo: null };
const AS_LYRA_CHARACTER: ChatSpeakerDto = { kind: 'character', characterId: LYRA_CHARACTER_ID };
const AS_LYRA: ChatSpeakerDto = { kind: 'token', sceneId: VHARN_SCENE_ID, tokenId: LYRA_ID };

type Harness = Readonly<{
  service: ChatService;
  members: MembershipReadsFake;
  audience: GridAudienceFake;
  publisher: ChatPublisherFake;
  emojis: CustomEmojiRefsFake;
}>;

function harness(): Harness {
  const members = new MembershipReadsFake([
    campaignMemberPo({ userId: ANA_ID, role: 'master' }),
    campaignMemberPo({ userId: BIA_ID, role: 'player' }),
    campaignMemberPo({ userId: CAIO_ID, role: 'player' }),
    campaignMemberPo({ userId: DUDA_ID, role: 'spectator' }),
    campaignMemberPo({ campaignId: OTHER_TABLE_ID, userId: QUELM_ID, role: 'master' }),
  ]);
  const audience = new GridAudienceFake().join(CONNECTION, VHARN_ID, VHARN_SCENE_ID);
  const tokens = new TokensDaoFake([], [lyraRow()]);
  const characters = new CharactersDaoFake([], [characterRow({ controllerIds: [BIA_ID] })]);
  const publisher = new ChatPublisherFake();
  const clock = new ClockFake(NOW);
  const emojis = new CustomEmojiRefsFake();
  const newId = (): string => MESSAGE_ID;
  const deps = { members, audience, tokens, characters, publisher, clock, emojis, newId };
  return { service: new ChatService(deps), members, audience, publisher, emojis };
}

function commandOf(overrides: Partial<ChatSendCommandDto> = {}): ChatSendCommandDto {
  return {
    actionId: ACTION_ID,
    campaignId: VHARN_ID,
    channel: TABLE,
    speaker: { kind: 'self' },
    text: 'Abram a porta.',
    replyTo: null,
    ...overrides,
  };
}

function group(memberIds: string[]): ChatChannelDto {
  return { kind: 'group', groupId: GROUP_ID, name: 'Conselho', memberIds };
}

describe('ChatService.send — custom emojis', () => {
  const FESTA_ID = '5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d';

  it('the event carries the sender’s active emojis the text names', async () => {
    const { service, publisher, emojis } = harness();
    emojis
      .give(BIA_ID, [{ id: FESTA_ID, name: 'festa' }])
      .give(CAIO_ID, [{ id: 'x', name: 'bolo' }]);

    await service.send(BIA_ID, commandOf({ text: 'bora :festa: :bolo:' }), CONNECTION);

    expect(publisher.published[0]?.event.customEmojis).toEqual([
      { name: 'festa', emojiId: FESTA_ID },
    ]);
    expect(emojis.asked).toEqual([{ userId: BIA_ID, text: 'bora :festa: :bolo:' }]);
  });

  it('speaking as a token still carries the person’s own emojis', async () => {
    const { service, publisher, emojis } = harness();
    emojis.give(BIA_ID, [{ id: FESTA_ID, name: 'festa' }]);

    await service.send(BIA_ID, commandOf({ speaker: AS_LYRA, text: ':festa:' }), CONNECTION);

    expect(publisher.published[0]?.event.customEmojis).toEqual([
      { name: 'festa', emojiId: FESTA_ID },
    ]);
  });

  it('a refused message never asks for emojis', async () => {
    const { service, emojis } = harness();

    await expect(service.send(QUELM_ID, commandOf(), CONNECTION)).rejects.toThrow();

    expect(emojis.asked).toEqual([]);
  });
});

describe('ChatService.send — channels and audience', () => {
  it('Bia on the Table: the whole table hears it, with the clock time and the new id', async () => {
    const { service, publisher } = harness();

    const answer = await service.send(BIA_ID, commandOf(), CONNECTION);

    expect(answer).toEqual({ messageId: MESSAGE_ID });
    expect(publisher.published).toEqual([
      {
        event: {
          campaignId: VHARN_ID,
          messageId: MESSAGE_ID,
          at: '2026-10-27T20:00:00.000Z',
          fromUserId: BIA_ID,
          channel: TABLE,
          speaker: { kind: 'self' },
          text: 'Abram a porta.',
          replyTo: null,
          customEmojis: [],
        },
        audience: { kind: 'table' },
      },
    ]);
  });

  it('a reply carries the quoted id and the called author as they came', async () => {
    const { service, publisher } = harness();
    const replyTo = { messageId: QUOTED_ID, mentionUserId: ANA_ID };

    await service.send(BIA_ID, commandOf({ replyTo }), CONNECTION);

    expect(publisher.published[0]?.event.replyTo).toEqual(replyTo);
  });

  it('Ana whispering to Bia goes only to Ana and Bia, the channel keeps the whisper', async () => {
    const { service, publisher } = harness();
    const channel: ChatChannelDto = { kind: 'table', whisperTo: BIA_ID };

    await service.send(ANA_ID, commandOf({ channel }), CONNECTION);

    expect(publisher.published[0]?.audience).toEqual({
      kind: 'people',
      userIds: [ANA_ID, BIA_ID],
    });
    expect(publisher.published[0]?.event.channel).toEqual(channel);
  });

  it('Caio writing privately to Bia names both in ascending order, whoever sends', async () => {
    const { service, publisher } = harness();

    await service.send(CAIO_ID, commandOf({ channel: { kind: 'direct', userId: BIA_ID } }), 'x');

    expect(publisher.published[0]?.event.channel).toEqual({
      kind: 'direct',
      userIds: [BIA_ID, CAIO_ID],
    });
    expect(publisher.published[0]?.audience).toEqual({
      kind: 'people',
      userIds: [CAIO_ID, BIA_ID],
    });
  });

  it('a group goes to every member and keeps its id, name and members in the event', async () => {
    const { service, publisher } = harness();
    const channel = group([BIA_ID, CAIO_ID, DUDA_ID]);

    await service.send(BIA_ID, commandOf({ channel }), CONNECTION);

    expect(publisher.published[0]?.event.channel).toEqual(channel);
    expect(publisher.published[0]?.audience).toEqual({
      kind: 'people',
      userIds: [BIA_ID, CAIO_ID, DUDA_ID],
    });
  });

  it('Duda, a spectator, speaks as herself on the Table and in a direct message', async () => {
    const { service, publisher } = harness();

    await service.send(DUDA_ID, commandOf(), CONNECTION);
    await service.send(DUDA_ID, commandOf({ channel: { kind: 'direct', userId: ANA_ID } }), 'x');

    expect(publisher.published).toHaveLength(2);
  });
});

describe('ChatService.send — refusals', () => {
  it('Quelm, outside the table, is CAMPAIGN_NOT_FOUND before anything else is read', async () => {
    const { service, members, audience, publisher } = harness();
    const command = commandOf({ channel: { kind: 'direct', userId: BIA_ID }, speaker: AS_LYRA });

    await expect(service.send(QUELM_ID, command, CONNECTION)).rejects.toThrow(
      CampaignNotFoundError,
    );
    expect(members.reads).toEqual([`${VHARN_ID}:${QUELM_ID}`]);
    expect(audience.asked).toEqual([]);
    expect(publisher.published).toEqual([]);
  });

  it('a whisper to Quelm, a master of another table, is CHAT_RECIPIENT_NOT_MEMBER citing him', async () => {
    const { service, publisher } = harness();
    const channel: ChatChannelDto = { kind: 'table', whisperTo: QUELM_ID };

    const sent = service.send(BIA_ID, commandOf({ channel }), CONNECTION);

    await expect(sent).rejects.toThrow(ChatRecipientNotMemberError);
    await expect(sent).rejects.toThrow(
      `user ${QUELM_ID} is not a member of campaign ${VHARN_ID}; expected a member of the campaign`,
    );
    expect(publisher.published).toEqual([]);
  });

  it('a group with one outsider among the members is refused citing the outsider', async () => {
    const { service } = harness();
    const channel = group([BIA_ID, CAIO_ID, QUELM_ID]);

    await expect(service.send(BIA_ID, commandOf({ channel }), CONNECTION)).rejects.toThrow(
      `user ${QUELM_ID} is not a member`,
    );
  });

  it('a group the sender is not in is refused', async () => {
    const { service, publisher } = harness();

    const sent = service.send(ANA_ID, commandOf({ channel: group([BIA_ID, CAIO_ID]) }), 'x');

    await expect(sent).rejects.toThrow(ChatSenderNotInGroupError);
    expect(publisher.published).toEqual([]);
  });

  it('speaking as a token in a whisper is CHAT_SPEAKER_NOT_ALLOWED, no token read', async () => {
    const { service, audience } = harness();
    const channel: ChatChannelDto = { kind: 'table', whisperTo: CAIO_ID };

    const sent = service.send(BIA_ID, commandOf({ channel, speaker: AS_LYRA }), CONNECTION);

    await expect(sent).rejects.toThrow(ChatSpeakerNotAllowedError);
    expect(audience.asked).toEqual([]);
  });

  it('Duda, a spectator, speaking as a token is FORBIDDEN', async () => {
    const { service, audience, publisher } = harness();

    const sent = service.send(DUDA_ID, commandOf({ speaker: AS_LYRA }), CONNECTION);

    await expect(sent).rejects.toThrow(ForbiddenActionError);
    expect(audience.asked).toEqual([]);
    expect(publisher.published).toEqual([]);
  });

  it('Caio speaking as Lyra, which Bia controls, is FORBIDDEN', async () => {
    const { service, publisher } = harness();

    const sent = service.send(CAIO_ID, commandOf({ speaker: AS_LYRA }), CONNECTION);

    await expect(sent).rejects.toThrow(ForbiddenActionError);
    await expect(sent).rejects.toThrow(`speak as token ${LYRA_ID}`);
    expect(publisher.published).toEqual([]);
  });

  it('a token of a grid the connection does not have open is SCENE_NOT_FOUND', async () => {
    const { service } = harness();
    const closedGridId = '8e4d3c2b-1a0f-4e9d-a8b7-6f5e4d3c2b1a';
    const speaker: ChatSpeakerDto = { kind: 'token', sceneId: closedGridId, tokenId: LYRA_ID };

    await expect(service.send(ANA_ID, commandOf({ speaker }), CONNECTION)).rejects.toThrow(
      SceneNotFoundError,
    );
  });

  it('the grid of the right table, but from another connection, is SCENE_NOT_FOUND', async () => {
    const { service } = harness();

    await expect(service.send(ANA_ID, commandOf({ speaker: AS_LYRA }), 'socket-2')).rejects.toThrow(
      SceneNotFoundError,
    );
  });

  it('a token missing from the grid is TOKEN_NOT_FOUND', async () => {
    const { service } = harness();
    const speaker: ChatSpeakerDto = {
      kind: 'token',
      sceneId: VHARN_SCENE_ID,
      tokenId: MISSING_TOKEN_ID,
    };

    await expect(service.send(ANA_ID, commandOf({ speaker }), CONNECTION)).rejects.toThrow(
      TokenNotFoundError,
    );
  });
});

describe('ChatService.send — speaking as a token', () => {
  it('Bia speaks as Lyra, which she controls: the event carries the name read from the grid', async () => {
    const { service, publisher } = harness();

    await service.send(BIA_ID, commandOf({ speaker: AS_LYRA }), CONNECTION);

    expect(publisher.published[0]?.event.speaker).toEqual({ ...AS_LYRA, name: 'Lyra' });
  });

  it('Ana, the master, speaks as any token of the grid', async () => {
    const { service, publisher } = harness();

    await service.send(ANA_ID, commandOf({ speaker: AS_LYRA }), CONNECTION);

    expect(publisher.published[0]?.event).toMatchObject({
      fromUserId: ANA_ID,
      speaker: { kind: 'token', tokenId: LYRA_ID, name: 'Lyra' },
    });
  });
});

describe('ChatService.send — speaking as a character', () => {
  it('Bia speaks as Lyra with no token on any grid: the name is read from the table', async () => {
    const { service, publisher } = harness();

    await service.send(BIA_ID, commandOf({ speaker: AS_LYRA_CHARACTER }), 'no-grid-open');

    expect(publisher.published[0]?.event.speaker).toEqual({ ...AS_LYRA_CHARACTER, name: 'Lyra' });
  });

  it('Ana, the master, speaks as any character of the table', async () => {
    const { service, publisher } = harness();

    await service.send(ANA_ID, commandOf({ speaker: AS_LYRA_CHARACTER }), CONNECTION);

    expect(publisher.published[0]?.event.speaker).toMatchObject({ kind: 'character' });
  });

  it('Caio speaking as Lyra, whom he does not control, is FORBIDDEN and nothing goes out', async () => {
    const { service, publisher } = harness();

    const sent = service.send(CAIO_ID, commandOf({ speaker: AS_LYRA_CHARACTER }), CONNECTION);

    await expect(sent).rejects.toBeInstanceOf(ForbiddenActionError);
    expect(publisher.published).toEqual([]);
  });

  it('Duda, a spectator, speaking as a character is FORBIDDEN', async () => {
    const { service } = harness();

    const sent = service.send(DUDA_ID, commandOf({ speaker: AS_LYRA_CHARACTER }), CONNECTION);

    await expect(sent).rejects.toBeInstanceOf(ForbiddenActionError);
  });

  it('a character of another table, or none, is CHARACTER_NOT_FOUND', async () => {
    const { service } = harness();
    const speaker: ChatSpeakerDto = { kind: 'character', characterId: MISSING_TOKEN_ID };

    const sent = service.send(BIA_ID, commandOf({ speaker }), CONNECTION);

    await expect(sent).rejects.toBeInstanceOf(CharacterNotFoundError);
  });

  it('speaking as a character in a whisper is CHAT_SPEAKER_NOT_ALLOWED', async () => {
    const { service } = harness();
    const channel: ChatChannelDto = { kind: 'table', whisperTo: CAIO_ID };

    const sent = service.send(
      BIA_ID,
      commandOf({ channel, speaker: AS_LYRA_CHARACTER }),
      CONNECTION,
    );

    await expect(sent).rejects.toBeInstanceOf(ChatSpeakerNotAllowedError);
  });
});
