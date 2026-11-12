import {
  drawingsCreatedDto,
  effectAreasCreatedDto,
  lightsCreatedDto,
  type BoardStateDto,
  type UserPlan,
} from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { setAccountPlan } from '../support/account-plans';
import { envelope, eventPayload, send, synced } from '../support/live-table';
import { recordEventsOf, type RealtimeClient } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import { createdTokenOf, tokenCommandFor, useTokenTable } from '../support/token-table';

const live = useTokenTable();

const HEX = '#336699';
const OTHER_HEX = '#ffaa00';
const CIRCLE = {
  kind: 'ellipse',
  x: 4,
  y: 4,
  width: 2,
  height: 2,
  fill: null,
  stroke: 'gold',
  strokeWidth: 'medium',
};
const CONE = { kind: 'diagonal_cone', x: 6, y: 6, reach: 3, facing: 45, color: 'ember' };
const TORCH = { x: 5.5, y: 3, bright: 4, dim: 4 };
const HEX_AURA = { kind: 'color', radius: 2, color: HEX, opacity: 60 };

const REFUSED = {
  ok: false,
  error: expect.objectContaining({
    code: 'PLAN_LIMIT',
    planLimit: { resource: 'customColor', limit: 0, plan: 'free' },
  }),
};

function barOf(color: string): object {
  return { label: 'PV', current: 1, max: 1, color, visibility: 'everyone' };
}

async function planOf(user: SignedInUser, plan: UserPlan): Promise<void> {
  await setAccountPlan(live.connection.db, user.id, plan);
}

function onVharn(fields: object): object {
  return { ...envelope(live.vharn.id), ...fields };
}

async function anaAtVharn(): Promise<RealtimeClient> {
  return live.atTable(live.ana, live.vharn);
}

async function tokenBy(ana: RealtimeClient, overrides: Record<string, unknown>): Promise<string> {
  const events = recordEventsOf(ana);
  const ack = await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id, overrides));
  if (!ack.ok) throw new Error(`token:create refused with ${ack.error.code}`);
  return (await createdTokenOf(events)).id;
}

function tokenUpdate(tokenId: string, overrides: object): object {
  const fields = { name: 'Lyra', initials: 'LY', side: 'ally', width: 1, height: 1 };
  return onVharn({ tokenId, ...fields, controllerIds: [], bars: [], ...overrides });
}

async function drawingBy(ana: RealtimeClient, drawing: object): Promise<string> {
  const events = recordEventsOf(ana);
  await send(ana, 'drawing:createMany', onVharn({ drawings: [drawing] }));
  const created = drawingsCreatedDto.parse(await eventPayload(events, 'drawing:createdMany'));
  return created.drawings[0]?.id ?? '';
}

async function areaBy(ana: RealtimeClient, area: object): Promise<string> {
  const events = recordEventsOf(ana);
  await send(ana, 'effectArea:createMany', onVharn({ effectAreas: [area] }));
  const created = effectAreasCreatedDto.parse(await eventPayload(events, 'effectArea:createdMany'));
  return created.effectAreas[0]?.id ?? '';
}

async function lightBy(ana: RealtimeClient): Promise<string> {
  const events = recordEventsOf(ana);
  await send(ana, 'light:createMany', onVharn({ lights: [TORCH] }));
  const created = lightsCreatedDto.parse(await eventPayload(events, 'light:createdMany'));
  return created.lights[0]?.id ?? '';
}

function conditionIdOf(state: BoardStateDto, name: string): string {
  const found = state.conditionDefinitions.find((definition) => definition.name === name);
  if (!found) throw new Error(`no condition named ${name} in the snapshot`);
  return found.id;
}

function envenenadoEdit(conditionId: string, color: string | null): object {
  const fields = { name: 'Envenenado', tone: 'harm', icon: 'flask-conical', look: null, color };
  return onVharn({ conditionId, ...fields, description: '', maxStacks: null, imageAssetId: null });
}

describe('a custom color on the table content follows the plan of its owner', () => {
  beforeEach(() => planOf(live.ana, 'free'));

  it('drawing:createMany with a hex stroke on a free table is PLAN_LIMIT customColor; the palette passes', async () => {
    const ana = await anaAtVharn();

    const hexed = await send(
      ana,
      'drawing:createMany',
      onVharn({ drawings: [{ ...CIRCLE, stroke: HEX }] }),
    );
    const filled = await send(
      ana,
      'drawing:createMany',
      onVharn({ drawings: [{ ...CIRCLE, fill: HEX }] }),
    );
    const palette = await send(ana, 'drawing:createMany', onVharn({ drawings: [CIRCLE] }));

    expect([hexed, filled]).toEqual([REFUSED, REFUSED]);
    expect(palette).toMatchObject({ ok: true });
    expect((await synced(ana, live.vharn)).drawings.map(({ stroke }) => stroke)).toEqual(['gold']);
  });

  it('effectArea:createMany with a hex color is refused the same way', async () => {
    const ana = await anaAtVharn();

    const ack = await send(
      ana,
      'effectArea:createMany',
      onVharn({ effectAreas: [{ ...CONE, color: HEX }] }),
    );

    expect(ack).toEqual(REFUSED);
    expect((await synced(ana, live.vharn)).effectAreas).toEqual([]);
  });

  it('effectArea:reshapeMany to a new hex is refused; the hex of before stretches on free', async () => {
    const ana = await anaAtVharn();
    await planOf(live.ana, 'narrador');
    const areaId = await areaBy(ana, { ...CONE, color: HEX });
    await planOf(live.ana, 'free');
    const reshape = (color: string) =>
      onVharn({ reshapes: [{ effectAreaId: areaId, shape: { ...CONE, reach: 4, color } }] });

    expect(await send(ana, 'effectArea:reshapeMany', reshape(OTHER_HEX))).toEqual(REFUSED);
    expect(await send(ana, 'effectArea:reshapeMany', reshape(HEX))).toMatchObject({ ok: true });
  });

  it('token:create with a hex aura is PLAN_LIMIT customColor', async () => {
    const ana = await anaAtVharn();
    const command = tokenCommandFor(live.vharn, live.bia.id, { aura: HEX_AURA });

    expect(await send(ana, 'token:create', command)).toEqual(REFUSED);
    expect((await synced(ana, live.vharn)).tokens).toEqual([]);
  });

  it('token:create with a hex bar or a hex light is refused', async () => {
    const ana = await anaAtVharn();
    const withBar = tokenCommandFor(live.vharn, live.bia.id, { bars: [barOf(HEX)] });
    const withLight = tokenCommandFor(live.vharn, live.bia.id, {
      bars: [],
      light: { ...{ bright: 4, dim: 4 }, color: HEX },
    });

    expect(await send(ana, 'token:create', withBar)).toEqual(REFUSED);
    expect(await send(ana, 'token:create', withLight)).toEqual(REFUSED);
  });

  it('token:update to a new hex bar is refused; keeping the hex bar of before passes', async () => {
    const ana = await anaAtVharn();
    await planOf(live.ana, 'narrador');
    const lyraId = await tokenBy(ana, { bars: [barOf(HEX)] });
    await planOf(live.ana, 'free');

    const recolored = tokenUpdate(lyraId, { bars: [barOf(OTHER_HEX)] });
    const renamed = tokenUpdate(lyraId, { name: 'Lyra velha', bars: [barOf(HEX)] });
    expect(await send(ana, 'token:update', recolored)).toEqual(REFUSED);
    expect(await send(ana, 'token:update', renamed)).toMatchObject({ ok: true });
  });

  it('token:restyleMany with a hex aura is refused', async () => {
    const ana = await anaAtVharn();
    const lyraId = await tokenBy(ana, { bars: [] });

    const ack = await send(
      ana,
      'token:restyleMany',
      onVharn({ tokenIds: [lyraId], style: { aura: HEX_AURA } }),
    );

    expect(ack).toEqual(REFUSED);
  });

  it('token:createMany pasting a copy with a hex bar is refused whole', async () => {
    const ana = await anaAtVharn();
    const copy = tokenCommandFor(live.vharn, live.bia.id, { bars: [barOf(HEX)] }) as Record<
      string,
      unknown
    >;
    delete copy.actionId;
    delete copy.campaignId;

    expect(await send(ana, 'token:createMany', onVharn({ tokens: [copy] }))).toEqual(REFUSED);
  });

  it('light:createMany with a hex color is refused', async () => {
    const ana = await anaAtVharn();

    const ack = await send(
      ana,
      'light:createMany',
      onVharn({ lights: [{ ...TORCH, color: HEX }] }),
    );

    expect(ack).toEqual(REFUSED);
    expect((await synced(ana, live.vharn)).lights).toEqual([]);
  });

  it('light:setColorMany to a hex is refused; to a palette name it passes', async () => {
    const ana = await anaAtVharn();
    const lightId = await lightBy(ana);
    const paint = (color: string) => onVharn({ changes: [{ lightId, color }] });

    expect(await send(ana, 'light:setColorMany', paint(HEX))).toEqual(REFUSED);
    expect(await send(ana, 'light:setColorMany', paint('fire'))).toMatchObject({ ok: true });
  });

  it('condition:define with a hex color is refused', async () => {
    const ana = await anaAtVharn();
    const define = { name: 'Sangrando', tone: 'harm', icon: 'droplet', color: HEX };

    expect(await send(ana, 'condition:define', onVharn(define))).toEqual(REFUSED);
    const names = (await synced(ana, live.vharn)).conditionDefinitions.map(({ name }) => name);
    expect(names).not.toContain('Sangrando');
  });

  it('condition:updateDefinition to a hex is refused; the hex of before is kept on free', async () => {
    const ana = await anaAtVharn();
    const envenenado = conditionIdOf(await synced(ana, live.vharn), 'Envenenado');
    await planOf(live.ana, 'narrador');
    await send(ana, 'condition:updateDefinition', envenenadoEdit(envenenado, HEX));
    await planOf(live.ana, 'free');

    const recolored = envenenadoEdit(envenenado, OTHER_HEX);
    expect(await send(ana, 'condition:updateDefinition', recolored)).toEqual(REFUSED);
    const kept = envenenadoEdit(envenenado, HEX);
    expect(await send(ana, 'condition:updateDefinition', kept)).toMatchObject({ ok: true });
  });

  it('a drawing with the hex of before moves on a free table', async () => {
    const ana = await anaAtVharn();
    await planOf(live.ana, 'narrador');
    const drawingId = await drawingBy(ana, { ...CIRCLE, stroke: HEX });
    await planOf(live.ana, 'free');

    const ack = await send(
      ana,
      'drawing:moveMany',
      onVharn({ moves: [{ drawingId, x: 6, y: 6 }] }),
    );

    expect(ack).toMatchObject({ ok: true });
  });

  it('a narrador table takes a hex on every command', async () => {
    await planOf(live.ana, 'narrador');
    const ana = await anaAtVharn();
    const token = { bars: [barOf(HEX)], aura: HEX_AURA, light: { bright: 4, dim: 4, color: HEX } };
    const define = { name: 'Sangrando', tone: 'harm', icon: 'droplet', color: HEX };

    const acks = [
      await send(ana, 'drawing:createMany', onVharn({ drawings: [{ ...CIRCLE, stroke: HEX }] })),
      await send(ana, 'effectArea:createMany', onVharn({ effectAreas: [{ ...CONE, color: HEX }] })),
      await send(ana, 'token:create', tokenCommandFor(live.vharn, live.bia.id, token)),
      await send(ana, 'light:createMany', onVharn({ lights: [{ ...TORCH, color: HEX }] })),
      await send(ana, 'condition:define', onVharn(define)),
    ];

    for (const ack of acks) expect(ack).toMatchObject({ ok: true });
  });

  it("a command on Quelm reads Caio's plan, not Ana's", async () => {
    await planOf(live.caio, 'narrador');
    const caio = await live.atTable(live.caio, live.quelm);
    const onQuelm = { ...envelope(live.quelm.id), drawings: [{ ...CIRCLE, stroke: HEX }] };

    expect(await send(caio, 'drawing:createMany', onQuelm)).toMatchObject({ ok: true });
  });
});
