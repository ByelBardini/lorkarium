import { describe, expect, it } from 'vitest';
import {
  liveTableTokenRightsOf,
  roleCanCreateTokens,
  tableTokenRightsOf,
  viewerTokenRightsOf,
} from '@/lib/token-rights-of-viewer';
import { createOpenTablesStore } from '@/stores/open-tables-store';
import { ANA } from '../support/auth-api-fake';
import { VHARN } from '../support/campaigns-api-fake';
import { VHARN_CAST_ID } from '../support/cast-fixtures';
import { StorageFake } from '../support/storage-fake';
import { tabInteractions } from '../support/tab-interactions';
import { TableSessionApiFake } from '../support/table-session-api-fake';
import { BIA_AT_TABLE, CAIO_AT_TABLE, lyra, vharnRenamed } from '../support/table-session-fixtures';

const BIA = { userId: BIA_AT_TABLE.userId, role: 'player' } as const;
const BOTH_KEYS = { create: true, delete: true };
const BIAS_TOKEN = lyra({ createdBy: BIA_AT_TABLE.userId });
const ANCHOR_ID = '7f6e5d4c-3b2a-4f1e-9d8c-7b6a5f4e3d2c';

describe('viewerTokenRightsOf', () => {
  it('a player with the create key may create and edit, not delete, her own token', () => {
    const rights = viewerTokenRightsOf({ create: true, delete: false }, BIA);

    expect(rights.canCreate).toBe(true);
    expect(rights.of(BIAS_TOKEN)).toEqual({ edit: true, delete: false });
  });

  it('the master creates, edits and deletes anyone’s token with both keys off', () => {
    const master = { userId: ANA.id, role: 'master' } as const;
    const rights = viewerTokenRightsOf({ create: false, delete: false }, master);

    expect(rights.canCreate).toBe(true);
    expect(rights.of(lyra({ createdBy: null }))).toEqual({ edit: true, delete: true });
  });

  it.each([
    ['Caio’s token', lyra({ createdBy: CAIO_AT_TABLE.userId })],
    ['a token from before authors (createdBy null)', lyra({ createdBy: null })],
    ['her token linked to a character', lyra({ createdBy: BIA.userId, anchorTokenId: ANCHOR_ID })],
  ])('with both keys on, the player gets nothing on %s', (_case, token) => {
    expect(viewerTokenRightsOf(BOTH_KEYS, BIA).of(token)).toEqual({ edit: false, delete: false });
  });

  it('without a viewer yet (board loading) nobody creates or edits', () => {
    const rights = viewerTokenRightsOf(BOTH_KEYS, null);

    expect(rights.canCreate).toBe(false);
    expect(rights.of(BIAS_TOKEN)).toEqual({ edit: false, delete: false });
  });
});

describe('tableTokenRightsOf', () => {
  it('reads the two keys of the campaign', () => {
    const campaign = { ...VHARN, playersCreateTokens: true, playersDeleteTokens: false };

    expect(tableTokenRightsOf(campaign)).toEqual({ create: true, delete: false });
  });
});

describe('liveTableTokenRightsOf', () => {
  function openVharn() {
    const api = new TableSessionApiFake();
    const store = createOpenTablesStore({
      api,
      storage: new StorageFake(),
      createInteraction: tabInteractions(),
    });
    store.getState().restore(ANA.id);
    store.getState().open({ campaignId: VHARN.id, name: 'Vharn', castSceneId: VHARN_CAST_ID });
    const table = () => store.getState().tables[0] ?? null;
    return { api, table };
  }

  it('before any campaignUpdated the keys are the route’s campaign', () => {
    const { table } = openVharn();
    const campaign = { ...VHARN, playersCreateTokens: true, playersDeleteTokens: true };

    expect(liveTableTokenRightsOf(table(), campaign)).toEqual(BOTH_KEYS);
  });

  it('a campaignUpdated turning the create key off changes the answer without touching the tokens', () => {
    const { api, table } = openVharn();
    const campaign = { ...VHARN, playersCreateTokens: true, playersDeleteTokens: true };
    const board = table()?.board.getState().board;
    const off = vharnRenamed();
    const event = {
      ...off,
      campaign: { ...off.campaign, playersCreateTokens: false, playersDeleteTokens: true },
    };

    api.emit({ kind: 'campaignUpdated', event });

    const keys = liveTableTokenRightsOf(table(), campaign);
    expect(keys).toEqual({ create: false, delete: true });
    expect(viewerTokenRightsOf(keys, BIA).of(BIAS_TOKEN)).toEqual({ edit: false, delete: true });
    expect(table()?.board.getState().board).toBe(board);
  });

  it('outside an open table the route’s campaign answers', () => {
    expect(liveTableTokenRightsOf(null, VHARN)).toEqual({ create: false, delete: false });
  });
});

describe('roleCanCreateTokens', () => {
  it.each([
    ['master', { create: false, delete: false }, true],
    ['player', { create: true, delete: false }, true],
    ['player', { create: false, delete: true }, false],
    ['spectator', { create: true, delete: true }, false],
  ] as const)('a %s with %o creates: %s', (role, keys, expected) => {
    expect(roleCanCreateTokens(role, keys)).toBe(expected);
  });
});
