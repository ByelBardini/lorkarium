import { memberCardChangedDto, tokenCreatedDto, tokenUpdatedDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import {
  castIdOf,
  gridState,
  linkToCard,
  lyraPoisonedAtVharn,
  tokenIn,
} from '../support/characters';
import { gridAck, newGrid } from '../support/grids';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

const labelsOf = (bars: readonly { label: string }[]): string[] => bars.map(({ label }) => label);

describe('linking a token to a card (token:linkToCard)', () => {
  it('Ana links Lyra to Bia: the anchor is born in the cast with her bars and Envenenado, and all three hear it', async () => {
    const castId = await castIdOf(live, live.ana, live.vharn);
    const { ana, lyra, recorders } = await lyraPoisonedAtVharn(live);

    const ack = await linkToCard(ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });
    expect(ack).toMatchObject({ ok: true });

    const [anaCreated, biaCreated, caioCreated] = await Promise.all(
      recorders.map(async (recorder) =>
        tokenCreatedDto.parse(await eventPayload(recorder, 'token:created')),
      ),
    );
    expect(anaCreated).toMatchObject({ sceneId: castId, token: { name: 'Lyra' } });
    expect(labelsOf(anaCreated!.token.bars)).toEqual(['PV', 'Inspiração']);
    expect(anaCreated!.token.conditions.map(({ name }) => name)).toEqual(['Envenenado']);
    expect(labelsOf(biaCreated!.token.bars)).toEqual(['PV', 'Inspiração']);
    expect(labelsOf(caioCreated!.token.bars)).toEqual(['Inspiração']);
    const updates = await Promise.all(
      recorders.map(async (r) => tokenUpdatedDto.parse(await eventPayload(r, 'token:updated'))),
    );
    for (const updated of updates) {
      expect(updated.token).toMatchObject({ id: lyra.id, anchorTokenId: anaCreated!.token.id });
    }
    const card = memberCardChangedDto.parse(await eventPayload(recorders[2], 'member:cardChanged'));
    expect(card).toMatchObject({ sceneId: castId, card: { anchorTokenId: anaCreated!.token.id } });
  });

  it('the snapshots read the link: Lyra composed on the group grid, the anchor in the cast, the card pointing at it', async () => {
    const castId = await castIdOf(live, live.ana, live.vharn);
    const { ana, bia, lyra } = await lyraPoisonedAtVharn(live);
    await linkToCard(ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });

    const cast = await gridState(bia, live.vharn, castId);
    const [anchor] = cast.tokens;
    const salao = await synced(bia, live.vharn);
    expect(tokenIn(salao, lyra.id)).toMatchObject({
      anchorTokenId: anchor?.id,
      canControl: true,
      conditions: [expect.objectContaining({ name: 'Envenenado' })],
    });
    expect(tokenIn(salao, lyra.id).bars.map(({ current }) => current)).toEqual([32, 1]);
    expect(salao.memberCards).toEqual([
      expect.objectContaining({ userId: live.bia.id, anchorTokenId: anchor?.id }),
    ]);
  });

  it('Kael on the Estrada linked to the same card adopts the anchor: his own bars are gone', async () => {
    const { ana, lyra } = await lyraPoisonedAtVharn(live);
    await linkToCard(ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });
    const estrada = await newGrid(live, live.ana, live.vharn, 'Estrada');
    await gridAck(ana, 'scene:watch', live.vharn, estrada);
    const anaEvents = recordEventsOf(ana);
    const kael = { ...tokenCommandFor(live.vharn, live.caio.id), name: 'Kael', sceneId: estrada };
    await send(ana, 'token:create', {
      ...kael,
      bars: [{ label: 'Vigor', current: 5, max: 5, color: 'moss', visibility: 'everyone' }],
    });
    const created = await createdTokenOf(anaEvents);

    const ack = await linkToCard(ana, live.vharn, {
      sceneId: estrada,
      tokenId: created.id,
      memberId: live.bia.id,
    });
    expect(ack).toMatchObject({ ok: true });

    const linked = tokenIn(await gridState(ana, live.vharn, estrada), created.id);
    expect(linked).toMatchObject({ name: 'Lyra', controllerIds: [live.bia.id] });
    expect(labelsOf(linked.bars)).toEqual(['PV', 'Inspiração']);
    expect(linked.conditions.map(({ name }) => name)).toEqual(['Envenenado']);
  });

  it('a second token in the group grid for the card of Bia is CHARACTER_ALREADY_PLACED', async () => {
    const { ana, lyra } = await lyraPoisonedAtVharn(live);
    await linkToCard(ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });
    const anaEvents = recordEventsOf(ana);
    await send(ana, 'token:create', { ...tokenCommandFor(live.vharn, live.bia.id), name: 'Eco' });
    const echo = await createdTokenOf(anaEvents);

    const again = await linkToCard(ana, live.vharn, { tokenId: echo.id, memberId: live.bia.id });

    expect(again).toMatchObject({ ok: false, error: { code: 'CHARACTER_ALREADY_PLACED' } });
    expect(tokenIn(await synced(ana, live.vharn), echo.id).anchorTokenId).toBeNull();
  });

  it('unlinking Lyra leaves her a copy of the bars and Envenenado; the anchor stays in the cast', async () => {
    const castId = await castIdOf(live, live.ana, live.vharn);
    const { ana, lyra } = await lyraPoisonedAtVharn(live);
    await linkToCard(ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });

    const unlink = { ...envelope(live.vharn.id), tokenId: lyra.id };
    expect(await send(ana, 'token:unlinkFromCard', unlink)).toMatchObject({ ok: true });

    const free = tokenIn(await synced(ana, live.vharn), lyra.id);
    expect(free).toMatchObject({ anchorTokenId: null, name: 'Lyra', controllerIds: [live.bia.id] });
    expect(labelsOf(free.bars)).toEqual(['PV', 'Inspiração']);
    expect(free.conditions.map(({ name }) => name)).toEqual(['Envenenado']);
    const cast = await gridState(ana, live.vharn, castId);
    expect(cast.tokens).toHaveLength(1);
    expect(cast.tokens[0]?.conditions.map(({ name }) => name)).toEqual(['Envenenado']);
  });

  it('Bia linking is FORBIDDEN; a token of Quelm is TOKEN_NOT_FOUND; a forged userId is INVALID_BODY', async () => {
    const { ana, bia, lyra } = await lyraPoisonedAtVharn(live);
    const caioAtQuelm = await live.atTable(live.caio, live.quelm);
    const quelmEvents = recordEventsOf(caioAtQuelm);
    await send(caioAtQuelm, 'token:create', tokenCommandFor(live.quelm, live.caio.id));
    const quelmToken = await createdTokenOf(quelmEvents);

    const byBia = await linkToCard(bia, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });
    expect(byBia).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    const stranger = await linkToCard(ana, live.vharn, {
      tokenId: quelmToken.id,
      memberId: live.bia.id,
    });
    expect(stranger).toMatchObject({ ok: false, error: { code: 'TOKEN_NOT_FOUND' } });
    const forged = await send(ana, 'token:linkToCard', {
      ...envelope(live.vharn.id),
      tokenId: lyra.id,
      memberId: live.bia.id,
      userId: live.ana.id,
    });
    expect(forged).toMatchObject({ ok: false, error: { code: 'INVALID_BODY' } });
  });

  it('the link survives a restart of the app', async () => {
    const { ana, lyra } = await lyraPoisonedAtVharn(live);
    await linkToCard(ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });

    await live.restart();

    const bia = await live.atTable(live.bia, live.vharn);
    const after = tokenIn(await synced(bia, live.vharn), lyra.id);
    expect(after.anchorTokenId).toEqual(expect.any(String));
    expect(after.conditions.map(({ name }) => name)).toEqual(['Envenenado']);
  });

  it('pasting a linked Lyra in the same grid makes an unlinked copy of what she shows', async () => {
    const { ana, lyra } = await lyraPoisonedAtVharn(live);
    await linkToCard(ana, live.vharn, { tokenId: lyra.id, memberId: live.bia.id });
    const shown = tokenIn(await synced(ana, live.vharn), lyra.id);
    const { name, initials, side, width, height, row, layer, controllerIds } = shown;
    const bars = shown.bars.map(({ label, current, max, color, visibility, display }) => ({
      ...{ label, current, max, color, visibility, display },
    }));
    const copied = { name, initials, side, width, height, col: 9, row, layer, controllerIds, bars };

    const ack = await send(ana, 'token:createMany', {
      ...envelope(live.vharn.id),
      tokens: [copied],
    });

    const copyId = ack.ok ? (ack.createdIds?.[0] ?? '') : '';
    const copy = tokenIn(await synced(ana, live.vharn), copyId);
    expect(copy).toMatchObject({ anchorTokenId: null, name: 'Lyra', controllerIds: [live.bia.id] });
    expect(labelsOf(copy.bars)).toEqual(['PV', 'Inspiração']);
  });
});
