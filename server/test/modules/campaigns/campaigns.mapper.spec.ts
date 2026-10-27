import {
  campaignDetailDto,
  campaignInfoDto,
  createCampaignRequestDto,
  publicCampaignDto,
  updateCampaignRequestDto,
  type UpdateCampaignRequestInput,
} from '@lorkarium/contracts';
import { defaultCoverOf } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import {
  coverOf,
  membersOfRecord,
  orderedMembers,
  toCampaignDetailDto,
  toCampaignInfoDto,
  toCampaignMemberDto,
  toCampaignPatch,
  toCampaignSummaryDto,
  toMemberRoleBo,
  toNewCampaignPo,
  toPublicCampaignDto,
  type CampaignDetailView,
} from '../../../src/modules/campaigns/campaigns.mapper';
import { ANA_ID } from '../../support/auth-factories';
import {
  BIA_ID,
  DUDA_ID,
  VHARN_ID,
  campaignListingRow,
  campaignMemberPo,
  campaignMemberRow,
  campaignPo,
} from '../../support/campaigns-factories';
import { VHARN_CAST_ID } from '../../support/scenes-factories';

const CAIO_ID = '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b';

const MEMBERS = [
  campaignMemberRow({ userId: CAIO_ID, name: 'Bia', role: 'player' }),
  campaignMemberRow({ userId: BIA_ID, name: 'Ágata', role: 'player' }),
  campaignMemberRow({ userId: ANA_ID, name: 'Ana', role: 'master' }),
];

const NOBODY_ONLINE: ReadonlySet<string> = new Set();

type Written = Parameters<typeof toCampaignPatch>[1];

// The body as the route hands it over: parsed by the DTO first.
function patchOf(body: UpdateCampaignRequestInput, written: Written) {
  return toCampaignPatch(updateCampaignRequestDto.parse(body), written);
}
const COVER_ID = '7d6c5b4a-3f2e-4d1c-8b0a-9f8e7d6c5b4a';

function detailView(overrides: Partial<CampaignDetailView> = {}): CampaignDetailView {
  return {
    campaign: campaignPo({ joinCode: 'VHRN7K2Q' }),
    membership: campaignMemberPo({ role: 'master', lastEnteredAt: null }),
    members: MEMBERS,
    castSceneId: VHARN_CAST_ID,
    lastAccessAt: null,
    onlineUserIds: NOBODY_ONLINE,
    ...overrides,
  };
}

function detailFor(role: 'master' | 'player', passwordHash: string | null = null) {
  return toCampaignDetailDto(
    detailView({
      campaign: campaignPo({ passwordHash, joinCode: 'VHRN7K2Q' }),
      membership: campaignMemberPo({ role, lastEnteredAt: null }),
    }),
  );
}

describe('campaigns mapper', () => {
  it('the detail carries the id of the table cast, to master and player alike', () => {
    expect(detailFor('master').castSceneId).toBe(VHARN_CAST_ID);
    expect(detailFor('player').castSceneId).toBe(VHARN_CAST_ID);
  });

  it('a listing row becomes the summary with ISO dates and the nulls preserved', () => {
    const row = campaignListingRow({
      campaign: campaignPo({ system: null, status: 'ongoing', description: null }),
      role: 'player',
      masterName: 'Bia',
      memberCount: 4,
      lastEnteredAt: new Date('2026-10-13T22:30:00Z'),
    });
    expect(toCampaignSummaryDto(row)).toEqual({
      id: VHARN_ID,
      name: 'Os Sinos de Vharn',
      system: null,
      status: 'ongoing',
      description: null,
      visibility: 'private',
      ownerId: ANA_ID,
      myRole: 'player',
      juggernaut: false,
      masterName: 'Bia',
      memberCount: 4,
      cover: { kind: 'drawn', ...defaultCoverOf(VHARN_ID) },
      contentWarnings: [],
      tags: [],
      playersCreateTokens: false,
      playersDeleteTokens: false,
      lastEnteredAt: '2026-10-13T22:30:00.000Z',
    });
  });

  describe('toPublicCampaignDto', () => {
    const publicRow = (passwordHash: string | null, myRole: 'player' | null) => ({
      campaign: campaignPo({
        visibility: 'public',
        passwordHash,
        contentWarnings: ['gore', 'old'],
      }),
      masterIds: [BIA_ID],
      masterName: 'Bia',
      masterUsername: 'bia',
      memberCount: 3,
      myRole,
    });
    const nobody: ReadonlySet<string> = new Set();

    it('a public row becomes a card the contract accepts, with the reader not in it', () => {
      const card = toPublicCampaignDto(publicRow(null, null), false, nobody);

      expect(publicCampaignDto.parse(card)).toEqual(card);
      expect(card).toMatchObject({
        id: VHARN_ID,
        visibility: 'public',
        masterName: 'Bia',
        masterUsername: 'bia',
        memberCount: 3,
        myRole: null,
        hasPassword: false,
        contentWarnings: ['gore'],
      });
    });

    it('a protected campaign says it has a password and never sends the hash', () => {
      const card = toPublicCampaignDto(publicRow('hashed:sino', 'player'), false, nobody);

      expect(card).toMatchObject({ hasPassword: true, myRole: 'player' });
      expect(JSON.stringify(card)).not.toContain('hashed:sino');
    });

    it('for an admin a protected campaign asks no password: they join without it', () => {
      const card = toPublicCampaignDto(publicRow('hashed:sino', null), true, nobody);

      expect(card.hasPassword).toBe(false);
    });

    it('nobody at the table: the master is offline and no player is online', () => {
      const card = toPublicCampaignDto(publicRow(null, null), false, nobody);

      expect(card).toMatchObject({ masterOnline: false, playersOnline: 0 });
    });

    it('the master online counts apart from the players at the table', () => {
      const online = new Set([BIA_ID, ANA_ID, CAIO_ID]);
      const card = toPublicCampaignDto(publicRow(null, null), false, online);

      expect(card).toMatchObject({ masterOnline: true, playersOnline: 2 });
    });

    it('players online with the master away', () => {
      const card = toPublicCampaignDto(publicRow(null, null), false, new Set([CAIO_ID]));

      expect(card).toMatchObject({ masterOnline: false, playersOnline: 1 });
    });
  });

  it('the detail for the master carries the join code', () => {
    expect(detailFor('master').joinCode).toBe('VHRN7K2Q');
  });

  it('the detail for a player hides the join code', () => {
    expect(detailFor('player').joinCode).toBeNull();
  });

  it.each([
    ['hashed:sino', true],
    [null, false],
  ] as const)('a password hash of %s gives hasPassword %s', (passwordHash, expected) => {
    expect(detailFor('master', passwordHash).hasPassword).toBe(expected);
  });

  it('members come master first, then by name in pt-BR order', () => {
    expect(detailFor('player').members.map(({ name, role }) => ({ name, role }))).toEqual([
      { name: 'Ana', role: 'master' },
      { name: 'Ágata', role: 'player' },
      { name: 'Bia', role: 'player' },
    ]);
  });

  it('each participant carries the user id, the drawn color when none was chosen and no photo', () => {
    expect(detailFor('player').members).toEqual([
      { userId: ANA_ID, name: 'Ana', role: 'master', color: 'teal', avatarId: null, online: false },
      {
        userId: BIA_ID,
        name: 'Ágata',
        role: 'player',
        color: 'moss',
        avatarId: null,
        online: false,
      },
      {
        userId: CAIO_ID,
        name: 'Bia',
        role: 'player',
        color: 'bone',
        avatarId: null,
        online: false,
      },
    ]);
  });

  it('a chosen color and a photo reach the participant as they are', () => {
    const photo = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
    const ana = campaignMemberRow({ colorChoice: 'rose', avatarId: photo });
    const detail = toCampaignDetailDto(detailView({ members: [ana] }));
    expect(detail.members[0]).toMatchObject({ color: 'rose', avatarId: photo });
  });

  it('the detail counts the members and names the master', () => {
    expect(detailFor('player')).toMatchObject({ masterName: 'Ana', memberCount: 3 });
  });

  it('the detail passes the strict DTO and never carries the password hash', () => {
    const detail = detailFor('master', 'hashed:sino');
    expect(campaignDetailDto.safeParse(detail).success).toBe(true);
    expect(JSON.stringify(detail)).not.toContain('hashed:sino');
  });
});

describe('the campaign settings in the mapper', () => {
  it('a campaign that never chose a cover gets the drawing of its id', () => {
    expect(coverOf(campaignPo())).toEqual({ kind: 'drawn', ...defaultCoverOf(VHARN_ID) });
  });

  it('a chosen drawing is the cover', () => {
    const campaign = campaignPo({ coverDrawing: 2, coverTone: 4 });
    expect(coverOf(campaign)).toEqual({ kind: 'drawn', drawing: 2, tone: 4 });
  });

  it('an image cover wins over a stored drawing', () => {
    const campaign = campaignPo({ coverDrawing: 2, coverTone: 4, coverAssetId: COVER_ID });
    expect(coverOf(campaign)).toEqual({ kind: 'image', assetId: COVER_ID });
  });

  it('the status, the warnings and the tags reach the summary as stored', () => {
    const campaign = campaignPo({
      status: 'finished',
      contentWarnings: ['gore', 'horror'],
      tags: ['sandbox', 'mistério'],
    });
    expect(toCampaignSummaryDto(campaignListingRow({ campaign }))).toMatchObject({
      status: 'finished',
      contentWarnings: ['gore', 'horror'],
      tags: ['sandbox', 'mistério'],
    });
  });

  it('the detail carries the creation date and the latest entry of any member', () => {
    const lastAccessAt = new Date('2026-10-20T23:10:00Z');
    const detail = toCampaignDetailDto(detailView({ lastAccessAt }));
    expect(detail.createdAt).toBe('2026-10-01T12:00:00.000Z');
    expect(detail.lastAccessAt).toBe('2026-10-20T23:10:00.000Z');
  });

  it('nobody entered yet gives lastAccessAt null', () => {
    expect(toCampaignDetailDto(detailView()).lastAccessAt).toBeNull();
  });

  it('each member is online only when the presence lists them', () => {
    const detail = toCampaignDetailDto(detailView({ onlineUserIds: new Set([BIA_ID]) }));
    const online = detail.members.map(({ userId, online }) => ({ userId, online }));
    expect(online).toEqual([
      { userId: ANA_ID, online: false },
      { userId: BIA_ID, online: true },
      { userId: CAIO_ID, online: false },
    ]);
  });

  it('the info of the detail drops what depends on the reader and passes the strict DTO', () => {
    const info = toCampaignInfoDto(detailFor('master'));
    expect(campaignInfoDto.safeParse(info).success).toBe(true);
    expect(info).not.toHaveProperty('myRole');
    expect(info).not.toHaveProperty('joinCode');
  });

  it('a new campaign keeps the status and the drawn cover it was created with', () => {
    const input = createCampaignRequestDto.parse({
      ...{ name: 'Vharn', status: 'recruiting' },
      ...{ cover: { kind: 'drawn', drawing: 1, tone: 2 } },
    });
    const owned = { ownerId: ANA_ID, joinCode: 'VHRN7K2Q', passwordHash: null };
    expect(toNewCampaignPo(input, owned)).toMatchObject({
      status: 'recruiting',
      coverDrawing: 1,
      coverTone: 2,
      coverAssetId: null,
    });
  });

  it('a new campaign without a cover leaves the cover columns out', () => {
    const input = { name: 'Vharn', system: null, description: null } as const;
    const owned = { ownerId: ANA_ID, joinCode: 'VHRN7K2Q', passwordHash: null };
    const row = toNewCampaignPo({ ...input, status: 'building', visibility: 'private' }, owned);
    expect(row).not.toHaveProperty('coverDrawing');
    expect(row).not.toHaveProperty('coverAssetId');
  });

  it('the patch writes only the fields sent, plus the moment', () => {
    const updatedAt = new Date('2026-10-24T10:00:00Z');
    const patch = patchOf({ name: 'Vharn' }, { passwordHash: undefined, updatedAt });
    expect(patch).toEqual({ name: 'Vharn', updatedAt });
  });

  it('a cleared text is written as null and a removed password as a null hash', () => {
    const updatedAt = new Date('2026-10-24T10:00:00Z');
    const patch = patchOf({ system: null }, { passwordHash: null, updatedAt });
    expect(patch).toEqual({ system: null, passwordHash: null, updatedAt });
  });

  it('an image cover clears the drawing and a drawing clears the image', () => {
    const at = { passwordHash: undefined, updatedAt: new Date('2026-10-24T10:00:00Z') };
    const image = patchOf({ cover: { kind: 'image', assetId: COVER_ID } }, at);
    const drawn = patchOf({ cover: { kind: 'drawn', drawing: 0, tone: 3 } }, at);
    expect(image).toMatchObject({ coverAssetId: COVER_ID, coverDrawing: null, coverTone: null });
    expect(drawn).toMatchObject({ coverAssetId: null, coverDrawing: 0, coverTone: 3 });
  });

  it('a token setting sent alone writes only its column, plus the moment', () => {
    const updatedAt = new Date('2026-10-26T10:00:00Z');
    const patch = patchOf({ playersCreateTokens: true }, { passwordHash: undefined, updatedAt });
    expect(patch).toEqual({ playersCreateTokens: true, updatedAt });
  });

  it('a token setting turned off is written as false, not dropped as absent', () => {
    const updatedAt = new Date('2026-10-26T10:00:00Z');
    const patch = patchOf({ playersDeleteTokens: false }, { passwordHash: undefined, updatedAt });
    expect(patch).toEqual({ playersDeleteTokens: false, updatedAt });
  });

  it('the info and the summary carry both token settings as the row stores them', () => {
    const campaign = campaignPo({ playersCreateTokens: true, playersDeleteTokens: false });
    const info = toCampaignInfoDto(toCampaignDetailDto(detailView({ campaign })));
    const summary = toCampaignSummaryDto(campaignListingRow({ campaign }));
    expect(info).toMatchObject({ playersCreateTokens: true, playersDeleteTokens: false });
    expect(summary).toMatchObject({ playersCreateTokens: true, playersDeleteTokens: false });
  });

  it('the plain password never reaches the patch', () => {
    const at = { passwordHash: 'hashed:sino', updatedAt: new Date('2026-10-24T10:00:00Z') };
    const patch = patchOf({ password: 'sino' }, at);
    expect(patch).toEqual({ passwordHash: 'hashed:sino', updatedAt: at.updatedAt });
  });
});

describe('orderedMembers', () => {
  it('keeps each member id and puts the master first, then names in pt-BR order', () => {
    expect(orderedMembers(MEMBERS)).toMatchObject([
      { userId: ANA_ID, name: 'Ana', role: 'master' },
      { userId: BIA_ID, name: 'Ágata', role: 'player' },
      { userId: CAIO_ID, name: 'Bia', role: 'player' },
    ]);
  });
});

describe('the table keeps no trace of a spectator', () => {
  const ana = campaignMemberRow({ userId: ANA_ID, name: 'Ana', role: 'master' });
  const bia = campaignMemberRow({ userId: BIA_ID, name: 'Bia', role: 'player' });
  const duda = campaignMemberRow({ userId: DUDA_ID, name: 'Duda', role: 'spectator' });

  it('the detail lists Ana and Bia, not Duda, and counts 2 members with Ana as master', () => {
    const detail = toCampaignDetailDto(
      detailView({ members: [ana, bia, duda], onlineUserIds: new Set([DUDA_ID]) }),
    );

    expect(detail.members.map(({ userId }) => userId)).toEqual([ANA_ID, BIA_ID]);
    expect([detail.memberCount, detail.masterName]).toEqual([2, 'Ana']);
  });

  it('the detail Duda reads of the table counts 2 members and does not list her', () => {
    const membership = campaignMemberPo({ userId: DUDA_ID, role: 'spectator' });

    const detail = toCampaignDetailDto(detailView({ members: [ana, bia, duda], membership }));

    expect(detail.myRole).toBe('spectator');
    expect(detail.members.map(({ userId }) => userId)).toEqual([ANA_ID, BIA_ID]);
    expect(detail.memberCount).toBe(2);
  });

  it('membersOfRecord leaves out only the spectators', () => {
    expect(membersOfRecord([duda, bia, ana]).map(({ name }) => name)).toEqual(['Bia', 'Ana']);
  });
});

describe('the role change in the mapper', () => {
  it('toCampaignMemberDto turns a member row into the participant the table shows, with the online given', () => {
    const duda = campaignMemberRow({ userId: DUDA_ID, name: 'Duda', role: 'player' });
    const rose = { ...duda, colorChoice: 'rose' as const, avatarId: VHARN_CAST_ID };

    expect(toCampaignMemberDto(rose, true)).toEqual({
      userId: DUDA_ID,
      name: 'Duda',
      role: 'player',
      color: 'rose',
      avatarId: VHARN_CAST_ID,
      online: true,
    });
  });

  it('toMemberRoleBo reads the role of the target from its membership, and its absence as not a member', () => {
    const lookup = {
      campaignId: VHARN_ID,
      userId: ANA_ID,
      targetId: DUDA_ID,
      requester: campaignMemberPo({ userId: ANA_ID, role: 'master' }),
      ownerId: ANA_ID,
    };
    const spectator = campaignMemberPo({ userId: DUDA_ID, role: 'spectator' });

    expect(toMemberRoleBo({ ...lookup, target: spectator }).decide('player')).toEqual({
      change: 'changed',
      from: 'spectator',
      to: 'player',
    });
    expect(() => toMemberRoleBo({ ...lookup, target: undefined }).decide('player')).toThrow(
      expect.objectContaining({ code: 'MEMBER_NOT_FOUND' }),
    );
  });
});
