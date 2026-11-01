import { describe, expect, it } from 'vitest';
import {
  publishCharactersChange,
  restyleCharacters,
  updateLinkedToken,
} from '../../../src/modules/tokens/character-writes';
import { ClockFake } from '../../support/auth-fakes';
import { CAIO_ID, QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';
import {
  CharacterTableFake,
  ESTRADA_LYRA_ID,
  NOW,
  linkedLyraRow,
  lyraCharacterRow,
} from '../../support/character-fakes';
import { CharacterPublisherFake } from '../../support/characters-fakes';
import { LYRA_CHARACTER_ID } from '../../support/characters-factories';
import { lyraForms } from '../../support/tokens-factories';

const VIGOR = {
  ...{ label: 'Vigor', current: 9, max: 9, color: 'moss' as const },
  ...{ visibility: 'everyone' as const, display: 'number' as const },
};

// The daos of one run of the table's transaction, as a service gets them.
async function daosOf(table: CharacterTableFake) {
  return table.transaction.run(async (daos) => daos);
}

describe('updateLinkedToken', () => {
  it('writes the identity, bars and controllers on the character and the rest on the token', async () => {
    const table = new CharacterTableFake();
    table.tokens.rows.push(linkedLyraRow());
    const fields = {
      name: 'Lyra Vento',
      initials: 'LV',
      side: 'ally',
      width: 2,
      height: 2,
    } as const;
    const forms = lyraForms().map(({ id, name, imageAssetId, width, height, frame }) => ({
      ...{ id, name, imageAssetId, width, height, frame },
    }));
    const update = {
      fields: { ...fields, flipX: true },
      bars: [VIGOR],
      controllerIds: [CAIO_ID],
      forms,
    };

    await updateLinkedToken(await daosOf(table), linkedLyraRow(), lyraCharacterRow(), update);

    const [lyra] = table.characters.rows;
    expect(lyra?.character).toMatchObject({ name: 'Lyra Vento', initials: 'LV', width: 1 });
    expect(lyra?.bars.map(({ label }) => label)).toEqual(['Vigor']);
    expect(lyra?.controllerIds).toEqual([CAIO_ID]);
    const own = table.tokens.rowOf(ESTRADA_LYRA_ID);
    expect(own.token).toMatchObject({ name: 'Lyra', width: 2, height: 2, flipX: true });
    expect(own.forms).toHaveLength(3);
  });
});

describe('restyleCharacters', () => {
  it('writes the look on each listed character once and returns them as saved', async () => {
    const table = new CharacterTableFake();

    const changed = await restyleCharacters(
      await daosOf(table),
      VHARN_ID,
      [LYRA_CHARACTER_ID, LYRA_CHARACTER_ID],
      { defeated: true },
    );

    expect(changed.map(({ character }) => character.defeated)).toEqual([true]);
    expect(table.journal.filter((entry) => entry === 'update')).toHaveLength(1);
  });

  it('nothing listed writes and reads nothing', async () => {
    const table = new CharacterTableFake();

    expect(await restyleCharacters(await daosOf(table), VHARN_ID, [], { defeated: true })).toEqual(
      [],
    );
    expect(table.journal).toEqual(['commit']);
  });

  it('a character of Vharn is not returned to a restyle addressed to Quelm', async () => {
    const table = new CharacterTableFake();

    const changed = await restyleCharacters(await daosOf(table), QUELM_ID, [LYRA_CHARACTER_ID], {
      frame: 'round',
    });

    expect(changed).toEqual([]);
  });
});

describe('publishCharactersChange', () => {
  const outlet = () => ({ publisher: new CharacterPublisherFake(), clock: new ClockFake(NOW) });

  it('sends one character:changed with every character, in the saved version', () => {
    const { publisher, clock } = outlet();

    publishCharactersChange({ publisher, clock }, VHARN_ID, 6, [lyraCharacterRow()]);

    expect(publisher.changes).toEqual([
      expect.objectContaining({ campaignId: VHARN_ID, version: 6, at: NOW.toISOString() }),
    ]);
    expect(publisher.changes[0]?.characters.map(({ characterId }) => characterId)).toEqual([
      LYRA_CHARACTER_ID,
    ]);
  });

  it('no version saved, or no character, publishes nothing', () => {
    const { publisher, clock } = outlet();

    publishCharactersChange({ publisher, clock }, VHARN_ID, null, [lyraCharacterRow()]);
    publishCharactersChange({ publisher, clock }, VHARN_ID, 6, []);

    expect(publisher.changes).toEqual([]);
  });
});
