import type { TokenFormDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { TokensService, type UpdateToken } from '../../../src/modules/tokens/tokens.service';
import { SceneWallsService } from '../../../src/modules/walls/scene-walls.service';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, VHARN_ID } from '../../support/campaigns-factories';
import {
  CharacterTableFake,
  ESTRADA_LYRA_ID,
  KAEL_ID,
  VHARN_TORRE_ID,
  kaelRow,
  linkedLyraRow,
} from '../../support/character-fakes';
import { DragGroupsFake, TableTokenRightsFake } from '../../support/tokens-fakes';
import {
  LYRA_ELF_FORM_ID,
  LYRA_ID,
  LYRA_WOLF_FORM_ID,
  WOLF_IMAGE_ID,
  elfForm,
  lyraForms,
} from '../../support/tokens-factories';

const KAEL_FORM_ID = '1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b';
const NEW_FORM_ID = '2f3a4b5c-6d7e-4f8a-9b0c-1d2e3f4a5b6c';

// The forms as the client sends them back (no image, so no asset is needed).
function sentForms(): TokenFormDto[] {
  return lyraForms().map(({ id, name, width, height, frame }) => ({
    id,
    name,
    imageAssetId: null,
    frame,
    width,
    height,
  }));
}

function lyraUpdate(overrides: Partial<UpdateToken> = {}): UpdateToken {
  const fields = { name: 'Lyra', initials: 'LY', side: 'ally', width: 1, height: 1 } as const;
  return { tokenId: LYRA_ID, ...fields, controllerIds: [BIA_ID], bars: [], ...overrides };
}

describe('token:update with the forms of a token', () => {
  let table: CharacterTableFake;
  let tokens: TokensService;

  beforeEach(() => {
    table = new CharacterTableFake();
    const { members, publisher, clock } = table;
    const transaction = table.transaction.run;
    tokens = new TokensService({
      members,
      transaction,
      dragGroups: new DragGroupsFake(table.scenes, table.tokens),
      sceneWalls: new SceneWallsService(),
      publisher,
      characterPublisher: table.characterPublisher,
      clock,
      barLimit: 99_999,
      tokenLimit: 500,
      tokenRights: new TableTokenRightsFake(),
    });
  });

  const lyra = () => table.tokens.rowOf(LYRA_ID);

  function lyraInWolf(): void {
    const forms = lyraForms().map((form) => ({ ...form, imageAssetId: null }));
    const look = { activeFormId: LYRA_WOLF_FORM_ID, width: 2, height: 2 };
    table.tokens.store(LYRA_ID, (row) => ({ ...row, token: { ...row.token, ...look }, forms }));
  }

  it('Ana saves three forms: kept in their order, the token shows none yet', async () => {
    await tokens.update(ANA_ID, VHARN_ID, lyraUpdate({ forms: sentForms() }));

    expect(lyra().forms.map(({ name, position }) => [name, position])).toEqual([
      ['Elfa', 0],
      ['Lobo atroz', 1],
      ['Corvo', 2],
    ]);
    expect(lyra().token.activeFormId).toBeNull();
    const [change] = table.publisher.tokenChanges;
    expect(change?.privileged.token.forms).toHaveLength(3);
    expect(change?.others.token.forms).toEqual([]);
  });

  it('a form with an image of another table is ASSET_NOT_FOUND before anything is saved', async () => {
    const forms = [{ ...sentForms()[1], imageAssetId: WOLF_IMAGE_ID } as TokenFormDto];

    const updating = tokens.update(ANA_ID, VHARN_ID, lyraUpdate({ forms }));

    await expect(updating).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' });
    expect(table.journal).not.toContain('save');
    expect(lyra().forms).toEqual([]);
  });

  it('an edit that keeps the size and the shown form keeps it, with the same id', async () => {
    lyraInWolf();

    await tokens.update(ANA_ID, VHARN_ID, lyraUpdate({ width: 2, height: 2, forms: sentForms() }));

    expect(lyra().token.activeFormId).toBe(LYRA_WOLF_FORM_ID);
    expect(lyra().forms[1]?.id).toBe(LYRA_WOLF_FORM_ID);
  });

  it('a new size by hand leaves Lyra without a form, the forms stay', async () => {
    lyraInWolf();

    await tokens.update(ANA_ID, VHARN_ID, lyraUpdate({ width: 3, height: 3 }));

    expect(lyra().token.activeFormId).toBeNull();
    expect(lyra().forms).toHaveLength(3);
  });

  it('a list without the shown form leaves Lyra without one', async () => {
    lyraInWolf();
    const [elf] = sentForms();

    await tokens.update(
      ANA_ID,
      VHARN_ID,
      lyraUpdate({ width: 2, height: 2, forms: elf ? [elf] : [] }),
    );

    expect(lyra().token.activeFormId).toBeNull();
    expect(lyra().forms.map(({ id }) => id)).toEqual([LYRA_ELF_FORM_ID]);
  });

  it('a sent id of a form of another token gets a new id: it neither collides nor is taken', async () => {
    const kaelForm = elfForm({ id: KAEL_FORM_ID, tokenId: KAEL_ID, name: 'Kael' });
    table.tokens.rows.push({ ...kaelRow(), forms: [kaelForm] });
    const stolen = {
      id: KAEL_FORM_ID,
      name: 'Roubada',
      imageAssetId: null,
      width: 1,
      height: 1,
      frame: 'square' as const,
    };
    const fresh = { ...stolen, id: NEW_FORM_ID, name: 'Nova' };

    await tokens.update(ANA_ID, VHARN_ID, lyraUpdate({ forms: [stolen, fresh] }));

    const ids = lyra().forms.map(({ id }) => id);
    expect(ids).not.toContain(KAEL_FORM_ID);
    expect(ids).not.toContain(NEW_FORM_ID);
    expect(table.tokens.rowOf(KAEL_ID).forms).toEqual([kaelForm]);
  });

  describe('a token linked to a character', () => {
    beforeEach(() => {
      table.tokens.rows.push(linkedLyraRow());
    });

    const torreUpdate = (overrides: Partial<UpdateToken>) =>
      lyraUpdate({ sceneId: VHARN_TORRE_ID, tokenId: ESTRADA_LYRA_ID, ...overrides });

    it('the forms stay on the token of the grid, never on the character', async () => {
      await tokens.update(ANA_ID, VHARN_ID, torreUpdate({ forms: sentForms() }));

      expect(table.tokens.rowOf(ESTRADA_LYRA_ID).forms).toHaveLength(3);
    });

    it('the same size keeps the shown form of the token; a new size drops it', async () => {
      const shown = { activeFormId: LYRA_WOLF_FORM_ID };
      table.tokens.store(ESTRADA_LYRA_ID, (row) => ({
        ...row,
        token: { ...row.token, ...shown },
        forms: lyraForms().map((form) => ({ ...form, tokenId: ESTRADA_LYRA_ID })),
      }));

      await tokens.update(ANA_ID, VHARN_ID, torreUpdate({ name: 'Lyra Vento' }));
      expect(table.tokens.rowOf(ESTRADA_LYRA_ID).token.activeFormId).toBe(LYRA_WOLF_FORM_ID);

      await tokens.update(ANA_ID, VHARN_ID, torreUpdate({ width: 2, height: 2 }));
      expect(table.tokens.rowOf(ESTRADA_LYRA_ID).token).toMatchObject({
        width: 2,
        height: 2,
        activeFormId: null,
      });
    });
  });
});
