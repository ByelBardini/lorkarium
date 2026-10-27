import { tokenUpdatedDto, type TokenDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { ScenesDao } from '../../src/modules/scenes/scenes.dao';
import { TokensDao } from '../../src/modules/tokens/tokens.dao';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

type Settings = Readonly<{ playersCreateTokens?: boolean; playersDeleteTokens?: boolean }>;

describe('a player creates, edits and deletes their own tokens by the table settings', () => {
  const live = useTokenTable();

  async function turn(settings: Settings, table: Table = live.vharn): Promise<void> {
    const url = `/api/campaigns/${table.id}`;
    const response = await live.http(table.master, { method: 'PATCH', url, payload: settings });
    expect(response.statusCode).toBe(200);
  }

  function update(tokenId: string, controllerIds: string[], table: Table = live.vharn): object {
    const fields = { name: 'Kael', initials: 'KA', side: 'ally', width: 1, height: 1 };
    return { ...envelope(table.id), tokenId, ...fields, controllerIds, bars: [] };
  }

  function remove(tokenId: string, table: Table = live.vharn): object {
    return { ...envelope(table.id), tokenId };
  }

  // Ana opens the table first: the settings only change with the master at the table.
  async function biaCreates(controllerIds: string[] = []): Promise<TokenDto> {
    const bia = recordEventsOf(await live.atTable(live.bia, live.vharn));
    const command = tokenCommandFor(live.vharn, live.bia.id, { controllerIds });
    expect(await send(bia.client, 'token:create', command)).toMatchObject({ ok: true });
    return createdTokenOf(bia);
  }

  async function at(user: SignedInUser, table: Table = live.vharn): Promise<RealtimeClient> {
    return live.atTable(user, table);
  }

  function refusal(code: string) {
    return { ok: false, error: expect.objectContaining({ code }) };
  }

  it('without the create setting, the token:create of Bia is FORBIDDEN', async () => {
    await at(live.ana);
    const bia = await at(live.bia);

    const ack = await send(bia, 'token:create', tokenCommandFor(live.vharn, live.bia.id));

    expect(ack).toEqual(refusal('FORBIDDEN'));
  });

  it('with the setting on, Bia creates and each audience gets the token with her as the author', async () => {
    const ana = recordEventsOf(await at(live.ana));
    const caio = recordEventsOf(await at(live.caio));
    await turn({ playersCreateTokens: true });

    const forBia = await biaCreates();

    const [forAna, forCaio] = [await createdTokenOf(ana), await createdTokenOf(caio)];
    expect(forBia).toMatchObject({ createdBy: live.bia.id, canControl: true, sight: null });
    expect(forBia.controllerIds).toEqual([live.bia.id]);
    expect(forAna).toMatchObject({ createdBy: live.bia.id, canControl: true });
    expect(forCaio).toMatchObject({ createdBy: live.bia.id, canControl: false });
  });

  it('Bia gives Caio control of her token but cannot take herself out of it', async () => {
    await at(live.ana);
    await turn({ playersCreateTokens: true });
    const kael = await biaCreates();
    const bia = await at(live.bia);

    const shared = await send(bia, 'token:update', update(kael.id, [live.bia.id, live.caio.id]));
    const left = await send(bia, 'token:update', update(kael.id, [live.caio.id]));

    expect(shared).toMatchObject({ ok: true });
    expect(left).toEqual(refusal('FORBIDDEN'));
    const saved = (await synced(bia, live.vharn)).tokens.find(({ id }) => id === kael.id);
    // The DAO reads the control without an order: compare it as a set.
    expect([...(saved?.controllerIds ?? [])].sort()).toEqual([live.bia.id, live.caio.id].sort());
  });

  it('the master takes Bia out of her token and the event reaches her redacted', async () => {
    const ana = await at(live.ana);
    await turn({ playersCreateTokens: true });
    const kael = await biaCreates();
    const bia = recordEventsOf(await at(live.bia));

    expect(await send(ana, 'token:update', update(kael.id, [live.caio.id]))).toMatchObject({
      ok: true,
    });

    const updated = tokenUpdatedDto.parse(await eventPayload(bia, 'token:updated')).token;
    expect(updated).toMatchObject({ createdBy: live.bia.id, canControl: false });
  });

  it('Bia neither edits nor deletes a token of the master, with both settings on', async () => {
    const ana = recordEventsOf(await at(live.ana));
    await turn({ playersCreateTokens: true, playersDeleteTokens: true });
    await send(ana.client, 'token:create', tokenCommandFor(live.vharn, live.bia.id));
    const lyra = await createdTokenOf(ana);
    const bia = await at(live.bia);

    expect(await send(bia, 'token:update', update(lyra.id, [live.bia.id]))).toEqual(
      refusal('FORBIDDEN'),
    );
    expect(await send(bia, 'token:delete', remove(lyra.id))).toEqual(refusal('FORBIDDEN'));
  });

  it('with the delete setting turned off, the token:delete of Bia is refused and the token stays', async () => {
    await at(live.ana);
    await turn({ playersCreateTokens: true, playersDeleteTokens: true });
    const kael = await biaCreates();
    await turn({ playersDeleteTokens: false });
    const bia = await at(live.bia);

    expect(await send(bia, 'token:delete', remove(kael.id))).toEqual(refusal('FORBIDDEN'));
    expect((await synced(bia, live.vharn)).tokens.map(({ id }) => id)).toEqual([kael.id]);
  });

  it('with the delete setting on, Bia deletes her token and the others hear it', async () => {
    const ana = recordEventsOf(await at(live.ana));
    await turn({ playersCreateTokens: true, playersDeleteTokens: true });
    const kael = await biaCreates();
    const bia = await at(live.bia);

    expect(await send(bia, 'token:delete', remove(kael.id))).toMatchObject({ ok: true });
    expect(await eventPayload(ana, 'token:deleted')).toMatchObject({ tokenId: kael.id });
  });

  it('a spectator, with both settings on, is FORBIDDEN to create', async () => {
    await at(live.ana);
    await turn({ playersCreateTokens: true, playersDeleteTokens: true });
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);
    const dudaClient = await at(duda);

    const ack = await send(dudaClient, 'token:create', tokenCommandFor(live.vharn, duda.id));

    expect(ack).toEqual(refusal('FORBIDDEN'));
  });

  it('the id of a token of another table is TOKEN_NOT_FOUND for Bia (isolation)', async () => {
    const quelmMaster = recordEventsOf(await at(live.caio, live.quelm));
    await send(quelmMaster.client, 'token:create', tokenCommandFor(live.quelm, live.caio.id));
    const quelmToken = await createdTokenOf(quelmMaster);
    await at(live.ana);
    await turn({ playersCreateTokens: true, playersDeleteTokens: true });
    const bia = await at(live.bia);

    expect(await send(bia, 'token:update', update(quelmToken.id, [live.bia.id]))).toEqual(
      refusal('TOKEN_NOT_FOUND'),
    );
    expect(await send(bia, 'token:delete', remove(quelmToken.id))).toEqual(
      refusal('TOKEN_NOT_FOUND'),
    );
  });

  it('the 501st token is TOKEN_LIMIT for Bia too', async () => {
    await fillVharn(500);
    await at(live.ana);
    await turn({ playersCreateTokens: true });
    const bia = await at(live.bia);

    const ack = await send(bia, 'token:create', tokenCommandFor(live.vharn, live.bia.id));

    expect(ack).toEqual(refusal('TOKEN_LIMIT'));
  });

  async function fillVharn(total: number): Promise<void> {
    const scene = await new ScenesDao(live.connection.db).findActiveOf(live.vharn.id);
    if (!scene) throw new Error(`table ${live.vharn.id} has no scene`);
    const token = { sceneId: scene.id, name: 'Goblin', initials: 'GO', side: 'enemy' } as const;
    const rows = Array.from({ length: total }, (_, index) => ({
      token: { ...token, width: 1, height: 1, col: index % 20, row: Math.floor(index / 20) % 12 },
      bars: [],
      controllerIds: [],
    }));
    await new TokensDao(live.connection.db).insertMany(rows);
  }
});
