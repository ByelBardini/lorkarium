import { beforeEach, describe, expect, it } from 'vitest';
import { TokenFormService } from '../../../src/modules/tokens/token-form.service';
import type { TokenRow } from '../../../src/modules/tokens/tokens.dao';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID, CAIO_ID, VHARN_ID } from '../../support/campaigns-factories';
import {
  CharacterTableFake,
  ESTRADA_LYRA_ID,
  KAEL_ID,
  LYRA_ANCHOR_ID,
  QUELM_TOKEN_ID,
  VHARN_CAST_ID,
  VHARN_SCENE_ID,
  VHARN_TORRE_ID,
  kaelRow,
  linkedLyraRow,
} from '../../support/character-fakes';
import {
  LYRA_ID,
  LYRA_WOLF_FORM_ID,
  WOLF_IMAGE_ID,
  elfForm,
  lyraForms,
} from '../../support/tokens-factories';

const TO_WOLF = { tokenId: LYRA_ID, formId: LYRA_WOLF_FORM_ID };
const LOCK_TORRE = `lockInCampaign:${VHARN_TORRE_ID}`;
const KAEL_FORM_ID = '1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b';

describe('TokenFormService.setForm', () => {
  let table: CharacterTableFake;
  let service: TokenFormService;

  beforeEach(() => {
    table = new CharacterTableFake();
    table.tokens.store(LYRA_ID, (row) => ({ ...row, forms: lyraForms() }));
    const { members, publisher, clock } = table;
    service = new TokenFormService({
      members,
      transaction: table.transaction.run,
      publisher,
      clock,
    });
  });

  const lyra = () => table.tokens.rowOf(LYRA_ID).token;
  const withLyra = (change: (row: TokenRow) => TokenRow) => table.tokens.store(LYRA_ID, change);

  it('Bia turns Lyra into the dire wolf: its image, a 2×2 box from her corner and the form', async () => {
    const version = await service.setForm(BIA_ID, VHARN_ID, TO_WOLF);

    expect(version).toBe(5);
    expect(lyra()).toMatchObject({ imageAssetId: WOLF_IMAGE_ID, activeFormId: LYRA_WOLF_FORM_ID });
    expect(lyra()).toMatchObject({ col: 3, row: 4, width: 2, height: 2, frame: 'round' });
    expect(table.journal).toEqual(['lock', 'save', 'save', 'bump', 'commit', 'publish']);
    expect(table.publisher.tokenFormChanges).toEqual([
      {
        campaignId: VHARN_ID,
        sceneId: VHARN_SCENE_ID,
        version: 5,
        at: table.clock.now().toISOString(),
        tokenId: LYRA_ID,
        activeFormId: LYRA_WOLF_FORM_ID,
        imageAssetId: WOLF_IMAGE_ID,
        frame: 'round',
        box: { col: 3, row: 4, width: 2, height: 2 },
      },
    ]);
  });

  it('near the corner of the 20×12 scene the wolf steps back to fit', async () => {
    withLyra((row) => ({ ...row, token: { ...row.token, col: 19, row: 11 } }));

    await service.setForm(BIA_ID, VHARN_ID, TO_WOLF);

    expect(lyra()).toMatchObject({ col: 18, row: 10, width: 2, height: 2 });
  });

  it('the form already shown again changes nothing: same version, no bump, no event', async () => {
    await service.setForm(BIA_ID, VHARN_ID, TO_WOLF);
    table.journal.length = 0;

    const version = await service.setForm(BIA_ID, VHARN_ID, TO_WOLF);

    expect(version).toBe(5);
    expect(table.journal).toEqual(['lock', 'commit']);
    expect(table.publisher.tokenFormChanges).toHaveLength(1);
  });

  it('the base form brings the initials and the 1×1 back', async () => {
    await service.setForm(BIA_ID, VHARN_ID, TO_WOLF);

    await service.setForm(BIA_ID, VHARN_ID, { tokenId: LYRA_ID, formId: elfForm().id });

    expect(lyra()).toMatchObject({ imageAssetId: null, width: 1, height: 1, col: 3, row: 4 });
    expect(lyra().frame).toBe('square');
    expect(lyra().activeFormId).toBe(elfForm().id);
  });

  it('a form of another token is TOKEN_FORM_NOT_FOUND citing the token and the id', async () => {
    const kaelForm = elfForm({ id: KAEL_FORM_ID, tokenId: KAEL_ID });
    table.tokens.rows.push({ ...kaelRow(), forms: [kaelForm] });

    const setting = service.setForm(ANA_ID, VHARN_ID, { tokenId: LYRA_ID, formId: KAEL_FORM_ID });

    await expect(setting).rejects.toMatchObject({
      code: 'TOKEN_FORM_NOT_FOUND',
      message: `token ${LYRA_ID} has no form ${KAEL_FORM_ID}; expected the id of one of its forms`,
    });
    expect(table.journal).toEqual(['lock']);
  });

  it('Caio, who does not control Lyra, is FORBIDDEN and nothing is saved', async () => {
    await expect(service.setForm(CAIO_ID, VHARN_ID, TO_WOLF)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(table.journal).toEqual(['lock']);
    expect(lyra().activeFormId).toBeNull();
  });

  it('an undo that expected no form, once the wolf is shown, is STALE_UNDO', async () => {
    await service.setForm(BIA_ID, VHARN_ID, TO_WOLF);
    const undo = { tokenId: LYRA_ID, formId: elfForm().id, expect: { activeFormId: null } };

    await expect(service.setForm(BIA_ID, VHARN_ID, undo)).rejects.toMatchObject({
      code: 'STALE_UNDO',
    });
    expect(lyra().activeFormId).toBe(LYRA_WOLF_FORM_ID);
  });

  it('Bia switches a token of hers on the objects layer (the look ignores the layer)', async () => {
    withLyra((row) => ({ ...row, token: { ...row.token, layer: 'objects' } }));

    await service.setForm(BIA_ID, VHARN_ID, TO_WOLF);

    expect(lyra().activeFormId).toBe(LYRA_WOLF_FORM_ID);
  });

  it('a token of Quelm is TOKEN_NOT_FOUND and nothing is saved', async () => {
    const setting = service.setForm(ANA_ID, VHARN_ID, { ...TO_WOLF, tokenId: QUELM_TOKEN_ID });

    await expect(setting).rejects.toMatchObject({ code: 'TOKEN_NOT_FOUND' });
    expect(table.journal).toEqual(['lock']);
  });

  describe('a token linked to a character', () => {
    beforeEach(() => {
      table.withLyraAnchor();
      const forms = lyraForms().map((form) => ({ ...form, tokenId: LYRA_ANCHOR_ID }));
      table.tokens.store(LYRA_ANCHOR_ID, (row) => ({ ...row, forms }));
      table.tokens.rows.push(linkedLyraRow());
    });

    const toWolfOnTorre = {
      sceneId: VHARN_TORRE_ID,
      tokenId: ESTRADA_LYRA_ID,
      formId: LYRA_WOLF_FORM_ID,
    };

    it('the image and the form go to the anchor, the box to the token of the grid', async () => {
      const version = await service.setForm(BIA_ID, VHARN_ID, toWolfOnTorre);

      expect(version).toBe(8);
      const anchor = table.tokens.rowOf(LYRA_ANCHOR_ID).token;
      expect(anchor).toMatchObject({
        imageAssetId: WOLF_IMAGE_ID,
        activeFormId: LYRA_WOLF_FORM_ID,
        frame: 'round',
      });
      expect(anchor).toMatchObject({ width: 1, height: 1 });
      const own = table.tokens.rowOf(ESTRADA_LYRA_ID).token;
      expect(own).toMatchObject({ col: 8, row: 2, width: 2, height: 2, activeFormId: null });
    });

    it('locks the cast before the grid and publishes one event per scene, each in its version', async () => {
      await service.setForm(BIA_ID, VHARN_ID, toWolfOnTorre);

      expect(table.journal).toEqual([
        LOCK_TORRE,
        'lock cast',
        LOCK_TORRE,
        'save',
        'save',
        'bump cast',
        'bump',
        'commit',
        'publish',
        'publish',
      ]);
      const [cast, grid] = table.publisher.tokenFormChanges;
      expect(cast).toMatchObject({ sceneId: VHARN_CAST_ID, version: 3, tokenId: LYRA_ANCHOR_ID });
      expect(cast).not.toHaveProperty('box');
      expect(cast).toMatchObject({ frame: 'round' });
      expect(grid).toMatchObject({
        sceneId: VHARN_TORRE_ID,
        version: 8,
        tokenId: ESTRADA_LYRA_ID,
        imageAssetId: WOLF_IMAGE_ID,
        box: { col: 8, row: 2, width: 2, height: 2 },
      });
    });
  });
});
