import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import {
  TokenAuthorshipBo,
  type EditedToken,
  type TokenEdit,
} from '../../../src/modules/tokens/token-authorship.bo';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import { BRAM_ID, LOBO_ID, LYRA_ID } from '../../support/tokens-factories';

type Role = 'master' | 'player' | 'spectator';
type Rights = Readonly<{ create: boolean; delete: boolean }>;

const BOTH_ON: Rights = { create: true, delete: true };
const BOTH_OFF: Rights = { create: false, delete: false };
const LYRA_CHARACTER_ID = 'c0ffee00-1a2b-4c3d-8e5f-6a7b8c9d0e1f';
const BLIND = { sight: null, light: null, sightAngle: 360 } as const;

function authorshipOf(userId: string, role: Role, rights: Rights = BOTH_ON): TokenAuthorshipBo {
  return new TokenAuthorshipBo(
    new CampaignAccessBo({ campaignId: VHARN_ID, userId, role }),
    rights,
  );
}

function tokenBy(createdBy: string | null, overrides: Partial<EditedToken> = {}): EditedToken {
  return { tokenId: LYRA_ID, createdBy, characterId: null, vision: BLIND, ...overrides };
}

function editOf(overrides: Partial<TokenEdit> = {}): TokenEdit {
  return { controllerIds: [BIA_ID], ...overrides };
}

function forbiddenCiting(...parts: string[]) {
  const pattern = parts.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return expect.objectContaining({ code: 'FORBIDDEN', message: expect.stringMatching(pattern) });
}

describe('TokenAuthorshipBo.requireCreate', () => {
  it('the master creates with both settings off, on any layer and with sight', () => {
    const create = { layer: 'objects', sight: { bright: 6, dim: 0 } } as const;

    expect(() => authorshipOf(ANA_ID, 'master', BOTH_OFF).requireCreate(create)).not.toThrow();
  });

  it('Bia with the create setting creates on the tokens layer', () => {
    expect(() => authorshipOf(BIA_ID, 'player').requireCreate({ layer: 'tokens' })).not.toThrow();
  });

  it('Bia without the create setting is refused citing her and the setting it takes', () => {
    const create = () => authorshipOf(BIA_ID, 'player', BOTH_OFF).requireCreate({});

    expect(create).toThrow(
      forbiddenCiting(BIA_ID, 'create a token', 'the master role or the players-create-tokens'),
    );
  });

  it('Bia creating on the objects layer is refused citing the layer', () => {
    const create = () => authorshipOf(BIA_ID, 'player').requireCreate({ layer: 'objects' });

    expect(create).toThrow(forbiddenCiting(BIA_ID, 'objects layer'));
  });

  it.each([
    ['sight', { sight: { bright: 6, dim: 0 } }],
    ['light', { light: { bright: 4, dim: 4, color: null, angle: 360 } }],
    ['sightAngle', { sightAngle: 90 }],
  ] as const)('Bia creating a token with %s is refused citing the field', (field, create) => {
    expect(() => authorshipOf(BIA_ID, 'player').requireCreate(create)).toThrow(
      forbiddenCiting(BIA_ID, field),
    );
  });

  it('Bia sending the defaults (blind, no light, 360°) still creates', () => {
    expect(() => authorshipOf(BIA_ID, 'player').requireCreate(BLIND)).not.toThrow();
  });

  it('a spectator with both settings on is refused', () => {
    const create = () => authorshipOf(CAIO_ID, 'spectator').requireCreate({});

    expect(create).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });
});

describe('TokenAuthorshipBo.newControllersOf', () => {
  it('Bia not in the list gets in, first', () => {
    expect(authorshipOf(BIA_ID, 'player').newControllersOf([CAIO_ID])).toEqual([BIA_ID, CAIO_ID]);
  });

  it('Bia already in the list is not repeated', () => {
    const controllers = authorshipOf(BIA_ID, 'player').newControllersOf([CAIO_ID, BIA_ID]);

    expect(controllers).toEqual([BIA_ID, CAIO_ID]);
  });

  it('the master keeps the list as sent, without herself', () => {
    expect(authorshipOf(ANA_ID, 'master').newControllersOf([BIA_ID])).toEqual([BIA_ID]);
  });
});

describe('TokenAuthorshipBo.requireEdit', () => {
  it('Bia edits the token she created with the create setting on', () => {
    const edit = () => authorshipOf(BIA_ID, 'player').requireEdit(tokenBy(BIA_ID), editOf());

    expect(edit).not.toThrow();
  });

  it('Bia with only the delete setting on cannot edit her own token', () => {
    const bia = authorshipOf(BIA_ID, 'player', { create: false, delete: true });

    expect(() => bia.requireEdit(tokenBy(BIA_ID), editOf())).toThrow(
      forbiddenCiting(BIA_ID, `edit token ${LYRA_ID}`),
    );
  });

  it.each([
    ['created by Caio', tokenBy(CAIO_ID)],
    ['without an author', tokenBy(null)],
    ['linked to a character', tokenBy(BIA_ID, { characterId: LYRA_CHARACTER_ID })],
  ])('Bia editing a token %s is refused citing the token', (_case, token) => {
    expect(() => authorshipOf(BIA_ID, 'player').requireEdit(token, editOf())).toThrow(
      forbiddenCiting(BIA_ID, `edit token ${LYRA_ID}`),
    );
  });

  it.each([
    ['sight', { sight: { bright: 6, dim: 0 } }],
    ['light', { light: { bright: 4, dim: 4, color: 'torch', angle: 360 } }],
    ['sightAngle', { sightAngle: 90 }],
  ] as const)('Bia changing the %s of her token is refused citing the field', (field, change) => {
    const edit = () => authorshipOf(BIA_ID, 'player').requireEdit(tokenBy(BIA_ID), editOf(change));

    expect(edit).toThrow(forbiddenCiting(BIA_ID, field, LYRA_ID));
  });

  it('Bia sending back the sight and light her token already has passes', () => {
    const vision = {
      sight: { bright: 6, dim: 2 },
      light: { bright: 4, dim: 4, color: 'torch', angle: 60 },
      sightAngle: 90,
    } as const;
    const token = tokenBy(BIA_ID, { vision });

    expect(() => authorshipOf(BIA_ID, 'player').requireEdit(token, editOf(vision))).not.toThrow();
  });

  it('Bia taking herself out of the control is refused: the creator stays in the control', () => {
    const edit = () =>
      authorshipOf(BIA_ID, 'player').requireEdit(
        tokenBy(BIA_ID),
        editOf({ controllerIds: [CAIO_ID] }),
      );

    expect(edit).toThrow(forbiddenCiting(BIA_ID, LYRA_ID, 'the creator stays in the control'));
  });

  it('the master takes the creator out of the control and changes the sight', () => {
    const change = editOf({ controllerIds: [CAIO_ID], sight: { bright: 6, dim: 0 } });

    expect(() => authorshipOf(ANA_ID, 'master').requireEdit(tokenBy(BIA_ID), change)).not.toThrow();
  });
});

describe('TokenAuthorshipBo.requireDelete', () => {
  const lyra = tokenBy(BIA_ID);
  const bram = tokenBy(BIA_ID, { tokenId: BRAM_ID });

  it('Bia with the delete setting deletes a batch of her own tokens', () => {
    expect(() => authorshipOf(BIA_ID, 'player').requireDelete([lyra, bram])).not.toThrow();
  });

  it('one token of Caio in the batch refuses it, citing that token', () => {
    const lobo = tokenBy(CAIO_ID, { tokenId: LOBO_ID });

    expect(() => authorshipOf(BIA_ID, 'player').requireDelete([lyra, lobo])).toThrow(
      forbiddenCiting(BIA_ID, `delete token ${LOBO_ID}`),
    );
  });

  it('Bia with only the create setting on cannot delete her own token', () => {
    const bia = authorshipOf(BIA_ID, 'player', { create: true, delete: false });

    expect(() => bia.requireDelete([lyra])).toThrow(
      forbiddenCiting(BIA_ID, `delete token ${LYRA_ID}`, 'players-delete-tokens'),
    );
  });

  it('the master deletes anyone’s token with both settings off', () => {
    const lobo = tokenBy(CAIO_ID, { tokenId: LOBO_ID });

    expect(() => authorshipOf(ANA_ID, 'master', BOTH_OFF).requireDelete([lobo])).not.toThrow();
  });
});

describe('TokenAuthorshipBo.copyOf', () => {
  const copy = {
    layer: 'objects',
    hidden: true,
    combatantId: 'c-lyra',
    sight: { bright: 6, dim: 0 },
    light: null,
    sightAngle: 90,
    name: 'Lyra',
  } as const;

  it('a copy Bia pastes lands on Tokens, visible, blind and out of the combat, keeping the rest', () => {
    expect(authorshipOf(BIA_ID, 'player').copyOf(copy)).toEqual({
      layer: 'tokens',
      hidden: false,
      combatantId: undefined,
      sight: null,
      light: null,
      sightAngle: 360,
      name: 'Lyra',
    });
  });

  it('a copy the master pastes stays as copied', () => {
    expect(authorshipOf(ANA_ID, 'master').copyOf(copy)).toEqual(copy);
  });
});
