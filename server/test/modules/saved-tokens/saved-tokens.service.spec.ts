import { savedTokenBodyDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { SavedTokenFoldersService } from '../../../src/modules/saved-tokens/saved-token-folders.service';
import { SavedTokensService } from '../../../src/modules/saved-tokens/saved-tokens.service';
import { lyraPortraitPo } from '../../support/assets-factories';
import { AssetsDaoFake } from '../../support/assets-fakes';
import {
  BIA_ID,
  CAIO_ID,
  DUDA_ID,
  QUELM_ID,
  VHARN_ID,
  campaignMemberPo,
} from '../../support/campaigns-factories';
import { MembershipReadsFake } from '../../support/campaigns-fakes';
import { planAccount } from '../../support/plan-account-fakes';
import {
  MORTOS_ID,
  MemberPlansDaoFake,
  SavedTokenFoldersDaoFake,
  SavedTokensDaoFake,
  SavedTokensTransactionRunnerFake,
  ZOMBIE_ID,
  savedTokenFolderPo,
  savedTokenRowPo,
} from '../../support/saved-tokens-fakes';

const BIA = { campaignId: VHARN_ID, userId: BIA_ID };
const CAIO = { campaignId: VHARN_ID, userId: CAIO_ID };
const DUDA = { campaignId: VHARN_ID, userId: DUDA_ID };
const VHARN_IMAGE = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const QUELM_IMAGE = '7b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e';

function zombieBody(overrides: Record<string, unknown> = {}) {
  return savedTokenBodyDto.parse({
    name: 'Zumbi',
    initials: 'ZB',
    side: 'enemy',
    width: 1,
    height: 1,
    bars: [{ label: 'PV', current: 12, max: 12, color: '#cc2222', visibility: 'everyone' }],
    ...overrides,
  });
}

function tokensOfBia(count: number) {
  return Array.from({ length: count }, (_, index) =>
    savedTokenRowPo({ id: `saved-of-bia-${index}`, name: `Z${index}` }),
  );
}

function setup(rows = [savedTokenRowPo()]) {
  const journal: string[] = [];
  const members = new MembershipReadsFake([
    campaignMemberPo({ userId: BIA_ID, role: 'player' }),
    campaignMemberPo({ userId: CAIO_ID, role: 'player' }),
    campaignMemberPo({ userId: DUDA_ID, role: 'spectator' }),
  ]);
  const plans = new MemberPlansDaoFake(journal);
  plans.owners.add(`${VHARN_ID}:${CAIO_ID}`);
  const tokens = new SavedTokensDaoFake(journal, rows);
  const folders = new SavedTokenFoldersDaoFake(journal, [savedTokenFolderPo()]);
  const assets = new AssetsDaoFake(
    [],
    [
      lyraPortraitPo({ id: VHARN_IMAGE }),
      lyraPortraitPo({ id: QUELM_IMAGE, campaignId: QUELM_ID }),
    ],
  );
  const transaction = new SavedTokensTransactionRunnerFake(journal, { plans, tokens, folders }).run;
  const maximums = { tokens: 50, folders: 20 };
  const service = new SavedTokensService({ members, plans, tokens, assets, transaction, maximums });
  const folderService = new SavedTokenFoldersService({ members, folders, transaction, maximums });
  return { service, folderService, journal, plans, tokens, folders };
}

describe('SavedTokensService.create', () => {
  it('Bia on Narrador saves the Zumbi: lock → count → insert → commit', async () => {
    const { service, journal } = setup([]);

    const saved = await service.create(BIA, { name: 'Zumbi', token: zombieBody() });

    expect(journal).toEqual(['lock', 'count', 'insert:Zumbi', 'commit']);
    expect(saved).toMatchObject({ name: 'Zumbi', folderId: null, planLocked: false });
    expect(saved.token.bars[0]).toMatchObject({ label: 'PV', current: 12 });
  });

  it('Bia on Grátis at a Grátis table is PLAN_LIMIT savedTokens 0 and nothing is inserted', async () => {
    const { service, journal, plans } = setup([]);
    plans.tablePlans.set(VHARN_ID, planAccount({ plan: 'free' }));

    const save = service.create(BIA, { name: 'Zumbi', token: zombieBody() });

    await expect(save).rejects.toMatchObject({
      code: 'PLAN_LIMIT',
      resource: 'savedTokens',
      limit: 0,
    });
    expect(journal).toEqual(['lock', 'count']);
  });

  it('Bia on Apoiador at a Grátis table saves a 5th and the 6th names her account', async () => {
    const { service, plans } = setup(tokensOfBia(4));
    plans.tablePlans.set(VHARN_ID, planAccount({ plan: 'free' }));
    plans.memberPlans.set(BIA_ID, planAccount({ plan: 'apoiador' }));

    await service.create(BIA, { name: 'Z5', token: zombieBody() });
    const sixth = service.create(BIA, { name: 'Z6', token: zombieBody() });

    await expect(sixth).rejects.toMatchObject({
      resource: 'savedTokens',
      limit: 5,
      holder: 'account',
    });
  });

  it('a portrait of another table is ASSET_NOT_FOUND before any lock', async () => {
    const { service, journal } = setup([]);

    const save = service.create(BIA, {
      name: 'Zumbi',
      token: zombieBody({ imageAssetId: QUELM_IMAGE }),
    });

    await expect(save).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND', assetId: QUELM_IMAGE });
    expect(journal).toEqual([]);
  });

  it('an image of the table in a form passes and lands in the forms', async () => {
    const { service } = setup([]);
    const forms = [
      { name: 'Podre', imageAssetId: VHARN_IMAGE, width: 2, height: 2, frame: 'round' },
    ];

    const saved = await service.create(BIA, { name: 'Zumbi', token: zombieBody({ forms }) });

    expect(saved.token.forms.map((form) => form.imageAssetId)).toEqual([VHARN_IMAGE]);
  });

  it('a folder of Caio is SAVED_TOKEN_FOLDER_NOT_FOUND and nothing is inserted', async () => {
    const { service, journal, folders } = setup([]);
    folders.rows.push(savedTokenFolderPo({ id: 'folder-of-caio', userId: CAIO_ID }));

    const save = service.create(BIA, {
      name: 'Z',
      folderId: 'folder-of-caio',
      token: zombieBody(),
    });

    await expect(save).rejects.toMatchObject({ code: 'SAVED_TOKEN_FOLDER_NOT_FOUND' });
    expect(journal).not.toContain('insert:Z');
  });

  it('the spectator Duda is FORBIDDEN before any read', async () => {
    const { service, journal } = setup([]);

    await expect(service.create(DUDA, { name: 'Z', token: zombieBody() })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(service.list(DUDA)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(journal).toEqual([]);
  });

  it('someone outside the table is CAMPAIGN_NOT_FOUND', async () => {
    const { service } = setup([]);

    const save = service.create(
      { campaignId: QUELM_ID, userId: BIA_ID },
      {
        name: 'Z',
        token: zombieBody(),
      },
    );

    await expect(save).rejects.toMatchObject({ code: 'CAMPAIGN_NOT_FOUND' });
  });
});

describe('SavedTokensService.list', () => {
  it('lists only Bia’s, marking planLocked from the 6th on for an Apoiador at a Grátis table', async () => {
    const { service, plans, tokens } = setup(tokensOfBia(7));
    tokens.rows.push(savedTokenRowPo({ id: 'of-caio', userId: CAIO_ID }));
    plans.tablePlans.set(VHARN_ID, planAccount({ plan: 'free' }));
    plans.memberPlans.set(BIA_ID, planAccount({ plan: 'apoiador' }));

    const { savedTokens } = await service.list(BIA);

    expect(savedTokens.map((saved) => saved.planLocked)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
  });
});

describe('SavedTokensService.update', () => {
  it('renaming the Zumbi: lock → rank → update → commit, the forms untouched', async () => {
    const { service, journal, tokens } = setup();

    const saved = await service.update(BIA, ZOMBIE_ID, { name: 'Zumbi velho' });

    expect(journal).toEqual(['lock', 'rank', `update:${ZOMBIE_ID}`, 'commit']);
    expect(saved.name).toBe('Zumbi velho');
    expect(tokens.lastReplacedForms).toBeUndefined();
  });

  it('replacing the token writes the new body and replaces the forms', async () => {
    const { service, tokens } = setup();
    const forms = [{ name: 'Lobo', imageAssetId: null, width: 2, height: 2, frame: 'square' }];

    const saved = await service.update(BIA, ZOMBIE_ID, {
      token: zombieBody({ width: 2, height: 2, forms, activeForm: 0 }),
    });

    expect(saved.token).toMatchObject({ width: 2, activeForm: 0 });
    expect(tokens.lastReplacedForms?.map((form) => form.name)).toEqual(['Lobo']);
  });

  it('past the plan the 6th is read only: rename and new token refused, moving passes', async () => {
    const { service, plans, journal } = setup(tokensOfBia(6));
    plans.tablePlans.set(VHARN_ID, planAccount({ plan: 'free' }));
    plans.memberPlans.set(BIA_ID, planAccount({ plan: 'apoiador' }));
    const sixth = 'saved-of-bia-5';

    await expect(service.update(BIA, sixth, { name: 'Novo' })).rejects.toMatchObject({
      reason: 'readOnly',
    });
    await expect(service.update(BIA, sixth, { token: zombieBody() })).rejects.toMatchObject({
      reason: 'readOnly',
    });
    const moved = await service.update(BIA, sixth, { folderId: MORTOS_ID });

    expect(moved).toMatchObject({ folderId: MORTOS_ID, planLocked: true });
    expect(journal.filter((entry) => entry.startsWith('update:'))).toEqual([`update:${sixth}`]);
  });

  it('the Zumbi of Bia updated by Caio is SAVED_TOKEN_NOT_FOUND', async () => {
    const { service } = setup();

    await expect(service.update(CAIO, ZOMBIE_ID, { name: 'Meu' })).rejects.toMatchObject({
      code: 'SAVED_TOKEN_NOT_FOUND',
      savedTokenId: ZOMBIE_ID,
    });
  });
});

describe('SavedTokensService.remove', () => {
  it('Bia deletes her Zumbi; Caio deleting it is SAVED_TOKEN_NOT_FOUND', async () => {
    const { service, tokens } = setup();

    await expect(service.remove(CAIO, ZOMBIE_ID)).rejects.toMatchObject({
      code: 'SAVED_TOKEN_NOT_FOUND',
    });
    await service.remove(BIA, ZOMBIE_ID);

    expect(tokens.rows).toEqual([]);
  });
});

describe('SavedTokenFoldersService', () => {
  it('at a Grátis table the first folder is PLAN_LIMIT savedTokenFolders and nothing is inserted', async () => {
    const { folderService, plans, journal } = setup();
    plans.tablePlans.set(VHARN_ID, planAccount({ plan: 'free' }));

    await expect(folderService.create(CAIO, 'Pets')).rejects.toMatchObject({
      resource: 'savedTokenFolders',
      limit: 0,
    });
    expect(journal).toEqual(['lock', 'folder:count']);
  });

  it('a repeated name without accent or case is SAVED_TOKEN_FOLDER_NAME_TAKEN', async () => {
    const { folderService } = setup();

    await expect(folderService.create(BIA, ' MORTOS-VIVOS ')).rejects.toMatchObject({
      code: 'SAVED_TOKEN_FOLDER_NAME_TAKEN',
    });
  });

  it('Bia creates, renames and removes; Caio touching her folder is not found', async () => {
    const { folderService } = setup();

    const pets = await folderService.create(BIA, 'Pets');
    const renamed = await folderService.rename(BIA, pets.id, 'Familiares');
    await expect(folderService.remove(CAIO, MORTOS_ID)).rejects.toMatchObject({
      code: 'SAVED_TOKEN_FOLDER_NOT_FOUND',
    });
    await folderService.remove(BIA, MORTOS_ID);

    expect(renamed.name).toBe('Familiares');
    expect((await folderService.list(BIA)).map((folder) => folder.name)).toEqual(['Familiares']);
  });
});
