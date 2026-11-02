import { describe, expect, it } from 'vitest';
import { SHEET_NAME_MAX_LENGTH } from '@lorkarium/contracts';
import {
  defaultSheetName,
  sheetCommandFailureMessage,
  sheetHolderLabel,
  type SheetHolderNames,
} from '@/features/sheets/sheet-messages';

const NAMES: SheetHolderNames = {
  memberName: (userId) => (userId === 'bia' ? 'Bia' : null),
  characterName: (userId) => (userId === 'bia' ? 'Lyra' : null),
  tokenName: (tokenId) => (tokenId === 'goblin' ? 'Goblin' : null),
};

describe('sheet messages', () => {
  it('names a sheet made from a menu "<template> · <holder>"', () => {
    expect(defaultSheetName('Ficha Tormenta', 'Goblin')).toBe('Ficha Tormenta · Goblin');
  });

  it('cuts a default name at the sheet name limit, with "…"', () => {
    const name = defaultSheetName('M'.repeat(50), 'Personagem comprido');
    expect(name).toHaveLength(SHEET_NAME_MAX_LENGTH);
    expect(name.endsWith('…')).toBe(true);
    expect(defaultSheetName('M'.repeat(51), 'Goblin')).toBe(`${'M'.repeat(51)} · Goblin`);
  });

  it.each([
    [{ tokenId: null, memberId: null }, 'Ficha · sem dono, só mestres'],
    [{ tokenId: null, memberId: 'bia' }, 'Ficha · de Bia (Lyra)'],
    [{ tokenId: null, memberId: 'caio' }, 'Ficha · de um jogador'],
    [{ tokenId: 'goblin', memberId: null }, 'Ficha · token Goblin'],
    [{ tokenId: 'lost', memberId: null }, 'Ficha · num token'],
  ])('says who holds %o: %s', (sheet, label) => {
    expect(sheetHolderLabel(sheet, NAMES)).toBe(label);
  });

  it('a member without a character name is said by the nick alone', () => {
    const names = { ...NAMES, characterName: () => null };
    expect(sheetHolderLabel({ tokenId: null, memberId: 'bia' }, names)).toBe('Ficha · de Bia');
  });

  it('words a refusal by its kind, else by the action', () => {
    expect(sheetCommandFailureMessage('Dar', { kind: 'member_not_found' })).toBe(
      'Esse jogador não está mais na mesa.',
    );
    expect(sheetCommandFailureMessage('Dar', { kind: 'unexpected' })).toBe(
      'Dar a ficha não deu certo. Tente de novo.',
    );
  });
});
