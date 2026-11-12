import { describe, expect, it } from 'vitest';
import { NOT_MEMBER_MESSAGE, OFFLINE_MESSAGE } from '@/features/campaigns/campaign-messages';
import {
  chatAnnouncement,
  chatInputRefusalMessage,
  chatLineOf,
  chatSendFailureMessage,
  chatUnreadText,
  namesText,
  offlineRecipientsText,
  unreadLabel,
  whisperMark,
} from '@/features/chat/chat-messages';
import { ANA } from '../../support/auth-api-fake';
import { chatSent, directBetween, trioGroup } from '../../support/chat-fixtures';
import { BIA_AT_TABLE, VHARN_GRID } from '../../support/table-session-fixtures';

describe('chat messages', () => {
  it.each([
    [
      { kind: 'rate_limited', retryAfterSeconds: 3 } as const,
      'Muitas mensagens seguidas. Espere 3 s.',
    ],
    [{ kind: 'not_found' } as const, NOT_MEMBER_MESSAGE],
    [{ kind: 'offline' } as const, OFFLINE_MESSAGE],
    [{ kind: 'forbidden' } as const, 'Você não pode falar como esse personagem.'],
    [
      { kind: 'speaker_not_found' } as const,
      'Esse personagem não está mais no grid. Você voltou a falar como você.',
    ],
  ])('the send refusal %o reads "%s"', (failure, expected) => {
    expect(chatSendFailureMessage(failure)).toBe(expected);
  });

  it.each([
    [{ kind: 'unknown_command', command: 'xyz' } as const, 'Não existe o comando /xyz.'],
    [{ kind: 'unknown_member', name: 'Zé' } as const, 'Ninguém na mesa se chama Zé.'],
    [{ kind: 'missing_text', name: 'Bia' } as const, 'Escreva o que sussurrar para Bia.'],
    [{ kind: 'missing_roll', command: 'gr' } as const, 'Escreva a rolagem depois do /gr.'],
    [{ kind: 'too_long', max: 2000 } as const, 'A mensagem passa de 2000 caracteres.'],
    [{ kind: 'rolls_only_at_table' } as const, 'Rolagens só na Mesa.'],
    [{ kind: 'spectator_cannot_roll' } as const, 'Quem assiste à mesa não rola dados.'],
  ])('the field refusal %o reads "%s"', (reason, expected) => {
    expect(chatInputRefusalMessage(reason)).toBe(expected);
  });

  it.each([
    [['Bia'], true, 'Bia está offline: a mensagem não chegaria.'],
    [['Bia', 'Caio'], true, 'Bia e Caio estão offline: a mensagem não chegaria.'],
    [['Caio'], false, 'Caio está offline e não vai receber.'],
  ])('offline %o (blocked: %s) reads "%s"', (names, blocked, expected) => {
    expect(offlineRecipientsText(names, blocked)).toBe(expected);
  });

  it.each([
    [[], ''],
    [['Ana'], 'Ana'],
    [['Ana', 'Bia', 'Caio'], 'Ana, Bia e Caio'],
  ])('names %o join as "%s"', (names, expected) => {
    expect(namesText(names)).toBe(expected);
  });

  it.each([
    ['Bia', 0, 'Bia'],
    ['Bia', 1, 'Bia, 1 não lida'],
    ['Mesa', 4, 'Mesa, 4 não lidas'],
  ])('the strip label of %s with %i unread is "%s"', (name, unread, expected) => {
    expect(unreadLabel(name, unread)).toBe(expected);
  });

  it.each([
    [1, '1 mensagem não lida'],
    [3, '3 mensagens não lidas'],
  ])('the counter of %i reads "%s"', (count, expected) => {
    expect(chatUnreadText(count)).toBe(expected);
  });

  it.each([
    [null, 'sussurro pra você'],
    ['Bia', 'sussurro pra Bia'],
  ])('the whisper mark to %s is "%s"', (toName, expected) => {
    expect(whisperMark(toName)).toBe(expected);
  });

  it.each([
    [{ kind: 'table' } as const, 'Bia: Oi.'],
    [{ kind: 'whisper' } as const, 'Bia sussurrou para você: Oi.'],
    [{ kind: 'direct' } as const, 'Bia, no privado: Oi.'],
    [{ kind: 'group', name: 'Os Três' } as const, 'Bia, em Os Três: Oi.'],
  ])('the announcement at %o is "%s"', (place, expected) => {
    expect(chatAnnouncement('Bia', place, 'Oi.')).toBe(expected);
  });

  const nameOf = (userId: string): string => (userId === BIA_AT_TABLE.userId ? 'Bia' : 'Alguém');

  it.each([
    [chatSent(), 'Bia: Oi, mesa.'],
    [
      chatSent({ channel: { kind: 'table', whisperTo: ANA.id } }),
      'Bia sussurrou para você: Oi, mesa.',
    ],
    [
      chatSent({ channel: directBetween(ANA.id, BIA_AT_TABLE.userId) }),
      'Bia, no privado: Oi, mesa.',
    ],
    [chatSent({ channel: trioGroup() }), 'Bia, em Os Três: Oi, mesa.'],
    [
      chatSent({
        speaker: { kind: 'token', sceneId: VHARN_GRID.sceneId, tokenId: 'kael', name: 'Kael' },
      }),
      'Kael: Oi, mesa.',
    ],
  ])('the line of %o is "%s"', (event, expected) => {
    expect(chatLineOf({ event, receivedAtMs: 0 }, nameOf)).toBe(expected);
  });
});
