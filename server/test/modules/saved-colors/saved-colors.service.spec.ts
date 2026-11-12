import { describe, expect, it } from 'vitest';
import type { SavedColorPo } from '../../../src/modules/saved-colors/saved-colors.po';
import { SavedColorsService } from '../../../src/modules/saved-colors/saved-colors.service';
import { BIA_ID } from '../../support/campaigns-factories';
import {
  SavedColorsDaoFake,
  SavedColorsTransactionRunnerFake,
  savedColorPo,
} from '../../support/saved-colors-fakes';
import { planAccount } from '../../support/plan-account-fakes';

const MAX_SAVED = 2;

function serviceOver(rows: SavedColorPo[] = []): {
  service: SavedColorsService;
  colors: SavedColorsDaoFake;
} {
  const colors = new SavedColorsDaoFake(rows);
  const transaction = new SavedColorsTransactionRunnerFake(colors).run;
  return {
    colors,
    service: new SavedColorsService({ colors, transaction, maxSaved: MAX_SAVED }),
  };
}

describe('SavedColorsService.list', () => {
  it('answers the colors in the order the DAO gave', async () => {
    const { service } = serviceOver([savedColorPo('#336699'), savedColorPo('#aabbcc')]);

    expect(await service.list(BIA_ID)).toEqual({ colors: ['#336699', '#aabbcc'] });
  });
});

describe('SavedColorsService.save', () => {
  it('locks, lists and inserts inside the transaction, and commits last', async () => {
    const { service, colors } = serviceOver();

    await service.save(BIA_ID, '#336699');

    expect(colors.journal).toEqual(['lock', 'list', 'insert', 'commit']);
  });

  it('answers the whole list with the new color first', async () => {
    const { service } = serviceOver([savedColorPo('#aabbcc')]);

    expect(await service.save(BIA_ID, '#336699')).toEqual({ colors: ['#336699', '#aabbcc'] });
  });

  it('a color already kept is not inserted and the list stays the same', async () => {
    const kept = [savedColorPo('#336699'), savedColorPo('#aabbcc')];
    const { service, colors } = serviceOver(kept);

    const answer = await service.save(BIA_ID, '#aabbcc');

    expect(answer).toEqual({ colors: ['#336699', '#aabbcc'] });
    expect(colors.journal).toEqual(['lock', 'list', 'commit']);
  });

  it('at the limit a new color is refused without inserting', async () => {
    const { service, colors } = serviceOver([savedColorPo('#336699'), savedColorPo('#aabbcc')]);

    await expect(service.save(BIA_ID, '#ffffff')).rejects.toMatchObject({
      code: 'SAVED_COLORS_LIMIT',
    });
    expect(colors.journal).toEqual(['lock', 'list', 'rollback']);
    expect(colors.rows).toHaveLength(2);
  });

  it('Bia on free is refused a saved color, read under the lock, and nothing is inserted', async () => {
    const { service, colors } = serviceOver();
    colors.account = planAccount({ plan: 'free' });

    await expect(service.save(BIA_ID, '#336699')).rejects.toMatchObject({
      code: 'PLAN_LIMIT',
      resource: 'customColor',
      limit: 0,
      plan: 'free',
    });
    expect(colors.journal).toEqual(['lock', 'rollback']);
  });

  it('Bia on Apoiador saves a color', async () => {
    const { service, colors } = serviceOver();
    colors.account = planAccount({ plan: 'apoiador' });

    expect(await service.save(BIA_ID, '#336699')).toEqual({ colors: ['#336699'] });
  });
});

describe('SavedColorsService.remove', () => {
  it('answers the list without the color', async () => {
    const { service } = serviceOver([savedColorPo('#336699'), savedColorPo('#aabbcc')]);

    expect(await service.remove(BIA_ID, '#336699')).toEqual({ colors: ['#aabbcc'] });
  });

  it('removes before it reads the list it answers', async () => {
    const { service, colors } = serviceOver([savedColorPo('#336699')]);

    await service.remove(BIA_ID, '#336699');

    expect(colors.journal).toEqual(['remove', 'list']);
  });

  it('a color the account does not keep answers the same list', async () => {
    const { service } = serviceOver([savedColorPo('#aabbcc')]);

    expect(await service.remove(BIA_ID, '#336699')).toEqual({ colors: ['#aabbcc'] });
  });
});
