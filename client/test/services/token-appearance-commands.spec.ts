import { setTokenFormCommandDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { BoardCommandSender } from '@/services/board-command-sender';
import { RealtimeTokenAppearanceCommands } from '@/services/token-appearance-commands';
import { RealtimeTransportFake } from '../support/realtime-transport-fake';
import { LYRA_ID, VHARN_GRID } from '../support/table-session-fixtures';
import { BASE_FORM_ID, WOLF_FORM_ID } from '../support/token-form-fixtures';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';

describe('RealtimeTokenAppearanceCommands.setTokenForm', () => {
  let transport: RealtimeTransportFake;
  let commands: RealtimeTokenAppearanceCommands;

  beforeEach(() => {
    transport = new RealtimeTransportFake();
    commands = new RealtimeTokenAppearanceCommands(
      new BoardCommandSender(transport, () => ACTION_ID),
    );
  });

  it('sends token:setForm with the token and the form, valid by the DTO, and answers the version', async () => {
    const result = commands.setTokenForm(VHARN_GRID, { tokenId: LYRA_ID, formId: WOLF_FORM_ID });

    const [sent] = transport.sent;
    expect(sent).toEqual({
      event: 'token:setForm',
      payload: { actionId: ACTION_ID, ...VHARN_GRID, tokenId: LYRA_ID, formId: WOLF_FORM_ID },
    });
    expect(setTokenFormCommandDto.safeParse(sent?.payload).success).toBe(true);
    await transport.answerAck({ ok: true, version: 9 }, 'token:setForm');
    expect(await result).toEqual({ ok: true, version: 9 });
  });

  it('an undo carries the form the token must still have, even none', async () => {
    void commands.setTokenForm(VHARN_GRID, {
      tokenId: LYRA_ID,
      formId: BASE_FORM_ID,
      expect: { activeFormId: null },
    });

    const payload = transport.sent[0]?.payload;
    expect(payload).toMatchObject({ formId: BASE_FORM_ID, expect: { activeFormId: null } });
    expect(setTokenFormCommandDto.safeParse(payload).success).toBe(true);
  });

  it.each([
    ['TOKEN_FORM_NOT_FOUND', 'token_not_found'],
    ['STALE_UNDO', 'stale_undo'],
    ['FORBIDDEN', 'forbidden'],
  ])('a refusal with %s is %s', async (code, failure) => {
    const result = commands.setTokenForm(VHARN_GRID, { tokenId: LYRA_ID, formId: WOLF_FORM_ID });
    await transport.answerAck({ ok: false, error: { code, message: 'x' } }, 'token:setForm');
    expect(await result).toEqual({ ok: false, failure });
  });

  it('token:setForm without an ack in 5 s is offline', async () => {
    const result = commands.setTokenForm(VHARN_GRID, { tokenId: LYRA_ID, formId: WOLF_FORM_ID });
    await transport.timeOutAck('token:setForm');
    expect(await result).toEqual({ ok: false, failure: 'offline' });
  });
});
