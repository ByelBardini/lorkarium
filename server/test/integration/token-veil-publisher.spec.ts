import { describe, expect, it } from 'vitest';
import { tokenControllers } from '../../src/modules/tokens/tokens.po';
import { expectNoTrace, hiddenTable, namesOf } from '../support/hidden-tokens';
import { envelope, eventPayload, send, silence } from '../support/live-table';
import { useTokenTable } from '../support/token-table';

describe('the board publisher with a veil (a hidden token)', () => {
  const live = useTokenTable();

  it('Ana moving the hidden Lobo: Ana and Bia get token:moved, Caio only board:advanced of the same version', async () => {
    const table = await hiddenTable(live);
    const move = { ...envelope(live.vharn.id), tokenId: table.loboId, col: 10, row: 6 };

    const ack = await send(table.ana.client, 'token:move', move);

    expect(ack).toEqual({ ok: true, version: 3 });
    for (const seer of [table.ana, table.bia]) {
      expect(await eventPayload(seer, 'token:moved')).toMatchObject({
        version: 3,
        tokenId: table.loboId,
      });
    }
    expect(await eventPayload(table.caio, 'board:advanced')).toEqual({
      campaignId: live.vharn.id,
      sceneId: expect.any(String),
      version: 3,
      at: expect.any(String),
    });
    await silence();
    expect(namesOf(table.caio)).not.toContain('token:moved');
    expectNoTrace(table.caio, table.loboId);
  });

  it('moving the lit Lobo gives Caio its torch from the new center, and nothing to Ana or Bia', async () => {
    const table = await hiddenTable(live);
    const move = { ...envelope(live.vharn.id), tokenId: table.loboId, col: 10, row: 6 };

    await send(table.ana.client, 'token:move', move);

    expect(await eventPayload(table.caio, 'token:veiledLightsChanged')).toMatchObject({
      lights: [{ x: 11, y: 7, bright: 4, dim: 4, color: 'torch', facing: 0, angle: 360 }],
    });
    await silence();
    for (const seer of [table.ana, table.bia])
      expect(namesOf(seer)).not.toContain('token:veiledLightsChanged');
    expectNoTrace(table.caio, table.loboId);
  });

  it('token:moveMany of the Lobo and the Kael reaches Caio with only the Kael', async () => {
    const table = await hiddenTable(live);
    const moves = [
      { tokenId: table.loboId, col: 10, row: 6 },
      { tokenId: table.kaelId, col: 7, row: 8 },
    ];

    await send(table.ana.client, 'token:moveMany', { ...envelope(live.vharn.id), moves });

    expect(await eventPayload(table.caio, 'token:movedMany')).toMatchObject({
      version: 3,
      moves: [{ tokenId: table.kaelId, col: 7, row: 8 }],
    });
    expect(await eventPayload(table.bia, 'token:movedMany')).toMatchObject({ moves });
    expect(await eventPayload(table.ana, 'token:movedMany')).toMatchObject({ moves });
    expectNoTrace(table.caio, table.loboId);
  });

  it('a master who also controls the hidden Lobo hears its move once', async () => {
    const table = await hiddenTable(live);
    const ana = table.ana;
    const control = { tokenId: table.loboId, userId: live.ana.id };
    await live.connection.db.insert(tokenControllers).values(control);
    const move = { ...envelope(live.vharn.id), tokenId: table.loboId, col: 10, row: 6 };

    await send(ana.client, 'token:move', move);

    await silence();
    expect(namesOf(ana).filter((name) => name === 'token:moved')).toHaveLength(1);
  });

  it('without a hidden token the move goes to everyone as before', async () => {
    const table = await hiddenTable(live, false);
    const move = { ...envelope(live.vharn.id), tokenId: table.loboId, col: 10, row: 6 };

    await send(table.ana.client, 'token:move', move);

    for (const each of [table.ana, table.bia, table.caio]) {
      expect(await eventPayload(each, 'token:moved')).toMatchObject({ tokenId: table.loboId });
    }
    await silence();
    expect(namesOf(table.caio)).toEqual(['token:moved']);
  });
});
