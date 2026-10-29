import { describe, expect, it } from 'vitest';
import { CHAT_TEXT_MAX } from '@lorkarium/contracts';
import { readChatInput, type ChatInputContext } from '@/lib/chat-input';
import { savedRollOf } from '../support/chat-fixtures';
import { BIA_AT_TABLE, CAIO_AT_TABLE } from '../support/table-session-fixtures';

const ATAQUE = savedRollOf(1, 'Ataque', '1d20+5');
const BOLA = savedRollOf(2, 'Bola de fogo', '8d6');
const ANA_CLARA = {
  userId: 'ac1a2b3c-4d5e-4f6a-8b7c-9d0e1f2a3b4c',
  name: 'Ana Clara',
  username: 'aninha',
};
const ANA_CLARA_SILVA = {
  ...ANA_CLARA,
  userId: 'ac1a2b3c-4d5e-4f6a-8b7c-000000000002',
  name: 'Ana Clara Silva',
  username: 'acs',
};

const PLAYER: ChatInputContext = {
  atTable: true,
  canRoll: true,
  savedRolls: [ATAQUE, BOLA],
  members: [BIA_AT_TABLE, CAIO_AT_TABLE, ANA_CLARA],
};

describe('readChatInput', () => {
  describe('text', () => {
    it('plain text is a message, trimmed', () => {
      expect(readChatInput('  Abram a porta. ', PLAYER)).toEqual({
        kind: 'message',
        text: 'Abram a porta.',
      });
    });

    it.each(['', '   ', '\n'])('blank input (%j) is empty', (raw) => {
      expect(readChatInput(raw, PLAYER)).toEqual({ kind: 'empty' });
    });

    it(`more than ${CHAT_TEXT_MAX} characters is refused as too long, citing the limit`, () => {
      expect(readChatInput('a'.repeat(CHAT_TEXT_MAX + 1), PLAYER)).toEqual({
        kind: 'refused',
        reason: { kind: 'too_long', max: 2000 },
      });
    });

    it('in a direct, plain text is still a message', () => {
      expect(readChatInput('oi', { ...PLAYER, atTable: false })).toEqual({
        kind: 'message',
        text: 'oi',
      });
    });
  });

  describe('rolls', () => {
    it('/r 1d20+5 rolls for everyone, unlabeled', () => {
      expect(readChatInput('/r 1d20+5', PLAYER)).toEqual({
        kind: 'roll',
        visibility: 'public',
        label: null,
        parts: [{ label: null, expression: '1d20+5' }],
      });
    });

    it('/gr 2d6 rolls for the masters only', () => {
      expect(readChatInput('/gr 2d6', PLAYER)).toMatchObject({
        kind: 'roll',
        visibility: 'masters',
        parts: [{ label: null, expression: '2d6' }],
      });
    });

    it('/R in capitals is the same command', () => {
      expect(readChatInput('/R 1d4', PLAYER)).toMatchObject({ kind: 'roll', visibility: 'public' });
    });

    it('/ataque rolls the saved "Ataque" for everyone, with its name on its parts', () => {
      expect(readChatInput('/ataque', PLAYER)).toEqual({
        kind: 'roll',
        visibility: 'public',
        label: 'Ataque',
        parts: [{ label: 'Ataque', expression: '1d20+5' }],
      });
    });

    it('/bola-de-fogo rolls the saved "Bola de fogo"', () => {
      expect(readChatInput('/bola-de-fogo', PLAYER)).toMatchObject({
        kind: 'roll',
        label: 'Bola de fogo',
        parts: [{ label: 'Bola de fogo', expression: '8d6' }],
      });
    });

    it('/gr ataque rolls the saved "Ataque" for the masters only', () => {
      expect(readChatInput('/gr ataque', PLAYER)).toEqual({
        kind: 'roll',
        visibility: 'masters',
        label: 'Ataque',
        parts: [{ label: 'Ataque', expression: '1d20+5' }],
      });
    });

    it('/r Bola de fogo (the name, not the slug) also finds the saved roll', () => {
      expect(readChatInput('/r Bola de fogo', PLAYER)).toMatchObject({ label: 'Bola de fogo' });
    });

    it('/r with nothing to roll is refused as missing_roll', () => {
      expect(readChatInput('/r', PLAYER)).toEqual({
        kind: 'refused',
        reason: { kind: 'missing_roll', command: 'r' },
      });
    });

    it('/r in a direct or a group is refused: rolls only at the table', () => {
      expect(readChatInput('/r 1d20', { ...PLAYER, atTable: false })).toEqual({
        kind: 'refused',
        reason: { kind: 'rolls_only_at_table' },
      });
    });

    it('/ataque in a direct is refused the same way', () => {
      expect(readChatInput('/ataque', { ...PLAYER, atTable: false })).toEqual({
        kind: 'refused',
        reason: { kind: 'rolls_only_at_table' },
      });
    });

    it.each(['/r 1d20', '/gr 1d20', '/ataque'])('a spectator typing %s is refused', (raw) => {
      expect(readChatInput(raw, { ...PLAYER, canRoll: false })).toEqual({
        kind: 'refused',
        reason: { kind: 'spectator_cannot_roll' },
      });
    });
  });

  describe('whispers', () => {
    it('/w Bia texto whispers the text to Bia', () => {
      expect(readChatInput('/w Bia cuidado com o baú', PLAYER)).toEqual({
        kind: 'whisper',
        userId: BIA_AT_TABLE.userId,
        text: 'cuidado com o baú',
      });
    });

    it('/w bia (any case) finds Bia', () => {
      expect(readChatInput('/w bia oi', PLAYER)).toMatchObject({ userId: BIA_AT_TABLE.userId });
    });

    it('/w aninha finds Ana Clara by her @', () => {
      expect(readChatInput('/w aninha oi', PLAYER)).toMatchObject({ userId: ANA_CLARA.userId });
    });

    it('/w "Ana Clara" texto takes the quoted name', () => {
      expect(readChatInput('/w "Ana Clara" vem aqui', PLAYER)).toEqual({
        kind: 'whisper',
        userId: ANA_CLARA.userId,
        text: 'vem aqui',
      });
    });

    it('/w Ana Clara texto without quotes takes the longest name that fits', () => {
      const context = { ...PLAYER, members: [ANA_CLARA, ANA_CLARA_SILVA] };

      expect(readChatInput('/w Ana Clara Silva oi', context)).toMatchObject({
        userId: ANA_CLARA_SILVA.userId,
        text: 'oi',
      });
      expect(readChatInput('/w Ana Clara oi', context)).toMatchObject({
        userId: ANA_CLARA.userId,
        text: 'oi',
      });
    });

    it('the longest name wins whatever the roster order', () => {
      const context = { ...PLAYER, members: [ANA_CLARA_SILVA, ANA_CLARA] };

      expect(readChatInput('/w Ana Clara Silva oi', context)).toMatchObject({
        userId: ANA_CLARA_SILVA.userId,
      });
    });

    it('/w Ninguém is refused naming who was not found', () => {
      expect(readChatInput('/w Ninguém oi', PLAYER)).toEqual({
        kind: 'refused',
        reason: { kind: 'unknown_member', name: 'Ninguém' },
      });
    });

    it('/w Bia with no text is refused as missing_text, naming Bia', () => {
      expect(readChatInput('/w Bia', PLAYER)).toEqual({
        kind: 'refused',
        reason: { kind: 'missing_text', name: 'Bia' },
      });
    });

    it('/w alone is refused as missing_member', () => {
      expect(readChatInput('/w', PLAYER)).toEqual({
        kind: 'refused',
        reason: { kind: 'missing_member' },
      });
    });

    it('/w in a direct is refused: whispers only at the table', () => {
      expect(readChatInput('/w Bia oi', { ...PLAYER, atTable: false })).toEqual({
        kind: 'refused',
        reason: { kind: 'whispers_only_at_table' },
      });
    });

    it('a spectator may whisper', () => {
      expect(readChatInput('/w Bia oi', { ...PLAYER, canRoll: false })).toMatchObject({
        kind: 'whisper',
      });
    });
  });

  describe('unknown commands', () => {
    it('/xyz is refused naming the command', () => {
      expect(readChatInput('/xyz 1', PLAYER)).toEqual({
        kind: 'refused',
        reason: { kind: 'unknown_command', command: 'xyz' },
      });
    });

    it('a / alone is refused as an unknown empty command', () => {
      expect(readChatInput('/', PLAYER)).toEqual({
        kind: 'refused',
        reason: { kind: 'unknown_command', command: '' },
      });
    });
  });
});
