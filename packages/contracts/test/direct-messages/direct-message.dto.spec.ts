import { describe, expect, it } from 'vitest';
import { DIRECT_MESSAGE_MAX_LENGTH } from '../../src/realtime-limits';
import {
  dmSendAckDto,
  dmSendCommandDto,
  dmSentDto,
  dmTypingCommandDto,
  dmTypingFromDto,
} from '../../src/direct-messages/direct-message.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const MESSAGE_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const ANA_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const BIA_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const AT = '2026-11-12T12:00:00.000Z';

function send(text: string): Record<string, unknown> {
  return { actionId: ACTION_ID, toUserId: BIA_ID, text };
}

describe('dmSendCommandDto', () => {
  it('apara o texto', () => {
    expect(dmSendCommandDto.parse(send('  oi ')).text).toBe('oi');
  });

  it('aceita 2000 caracteres e recusa 2001', () => {
    expect(DIRECT_MESSAGE_MAX_LENGTH).toBe(2000);
    expect(dmSendCommandDto.safeParse(send('a'.repeat(2000))).success).toBe(true);
    expect(dmSendCommandDto.safeParse(send('a'.repeat(2001))).success).toBe(false);
  });

  it('recusa texto só de espaços', () => {
    expect(dmSendCommandDto.safeParse(send('   ')).success).toBe(false);
  });

  it('recusa o remetente forjado no payload', () => {
    expect(dmSendCommandDto.safeParse({ ...send('oi'), fromUserId: ANA_ID }).success).toBe(false);
  });
});

describe('dmSendAckDto', () => {
  it('lê o id da mensagem ou o erro', () => {
    expect(dmSendAckDto.parse({ ok: true, messageId: MESSAGE_ID }).ok).toBe(true);
    const failure = { ok: false, error: { code: 'DM_RECIPIENT_OFFLINE', message: 'offline' } };
    expect(dmSendAckDto.parse(failure).ok).toBe(false);
  });
});

describe('dmSentDto e digitando', () => {
  it('o evento leva as duas contas', () => {
    const event = {
      messageId: MESSAGE_ID,
      fromUserId: ANA_ID,
      toUserId: BIA_ID,
      text: 'oi',
      at: AT,
    };
    expect(dmSentDto.parse(event)).toEqual(event);
  });

  it('o digitando só leva o destino, e a volta só a origem', () => {
    const forged = { toUserId: BIA_ID, fromUserId: ANA_ID };
    expect(dmTypingCommandDto.safeParse(forged).success).toBe(false);
    expect(dmTypingFromDto.parse({ fromUserId: ANA_ID, at: AT }).fromUserId).toBe(ANA_ID);
  });
});
