import { describe, expect, it } from 'vitest';
import {
  chatCommandCatalogOf,
  savedRollCommandsOf,
  savedRollSlugOf,
  suggestChatCommands,
  type ChatCommandEntry,
} from '@/lib/chat-commands-catalog';
import { savedRollOf } from '../support/chat-fixtures';

const ATAQUE = savedRollOf(1, 'Ataque', '1d20+5');
const BOLA = savedRollOf(2, 'Bola de fogo', '8d6');
const AT_TABLE = { canRoll: true, atTable: true };

function commandsOf(entries: readonly ChatCommandEntry[]): string[] {
  return entries.map((entry) => entry.command);
}

describe('savedRollSlugOf', () => {
  it.each([
    ['Ataque', 'ataque'],
    ['Bola de fogo', 'bola-de-fogo'],
    ['Bênção', 'bencao'],
    ['  Golpe   Duplo! ', 'golpe-duplo'],
    ['Cura (2º nível)', 'cura-2o-nivel'],
  ])('"%s" is the command /%s', (name, slug) => {
    expect(savedRollSlugOf(name)).toBe(slug);
  });

  it('a name with no letter or digit has no command', () => {
    expect(savedRollSlugOf('!!!')).toBe('');
  });
});

describe('savedRollCommandsOf', () => {
  it('each saved roll answers by its slug', () => {
    const commands = savedRollCommandsOf([ATAQUE, BOLA]);

    expect(commands.get('ataque')).toBe(ATAQUE);
    expect(commands.get('bola-de-fogo')).toBe(BOLA);
  });

  it.each(['r', 'gr', 'w', 'R'])('a saved roll named "%s" loses to the fixed command', (name) => {
    expect(savedRollCommandsOf([savedRollOf(3, name)]).size).toBe(0);
  });

  it('two saved rolls with the same slug: the oldest (first) keeps it', () => {
    const newer = savedRollOf(4, 'ATAQUE');

    expect(savedRollCommandsOf([ATAQUE, newer]).get('ataque')).toBe(ATAQUE);
  });

  it('a saved roll with no slug is left out', () => {
    expect(savedRollCommandsOf([savedRollOf(5, '???')]).size).toBe(0);
  });
});

describe('chatCommandCatalogOf', () => {
  it('at the table, a player sees /r, /gr, /w and then each saved roll', () => {
    expect(commandsOf(chatCommandCatalogOf([ATAQUE, BOLA], AT_TABLE))).toEqual([
      'r',
      'gr',
      'w',
      'ataque',
      'bola-de-fogo',
    ]);
  });

  it('a spectator at the table only whispers', () => {
    const catalog = chatCommandCatalogOf([ATAQUE], { canRoll: false, atTable: true });

    expect(commandsOf(catalog)).toEqual(['w']);
  });

  it('in a direct or a group there is no command', () => {
    expect(chatCommandCatalogOf([ATAQUE], { canRoll: true, atTable: false })).toEqual([]);
  });

  it('a fixed command carries how to use it, in pt-BR', () => {
    const [roll] = chatCommandCatalogOf([], AT_TABLE);

    expect(roll).toEqual({
      kind: 'fixed',
      command: 'r',
      usage: '/r 1d20+5',
      description: 'Rolar para a mesa',
    });
  });
});

describe('suggestChatCommands', () => {
  const catalog = chatCommandCatalogOf([ATAQUE, BOLA], AT_TABLE);

  it('nothing typed after the / lists every command', () => {
    expect(commandsOf(suggestChatCommands(catalog, ''))).toHaveLength(5);
  });

  it('a prefix keeps the commands that start with it', () => {
    expect(commandsOf(suggestChatCommands(catalog, 'g'))).toEqual(['gr']);
  });

  it('a saved roll is found by a word of its name, without accent or case', () => {
    expect(commandsOf(suggestChatCommands(catalog, 'FOGO'))).toEqual(['bola-de-fogo']);
  });

  it('a prefix no command has gives an empty list', () => {
    expect(suggestChatCommands(catalog, 'xyz')).toEqual([]);
  });
});
