import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDiceOverlay } from '@/features/dice/use-dice-overlay';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { VHARN_CAST_ID } from '../../support/cast-fixtures';
import { BIA_ROLL_ID, biaRolled, biaRolledSecretly, rollIdOf } from '../../support/dice-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

const TEXTURE_ID = '3f2a1b0c-9d8e-4f7a-8b6c-5d4e3f2a1b0c';

function Overlay({ deps }: Readonly<{ deps: TestDependencies }>): null {
  useDiceOverlay({
    campaignId: VHARN.id,
    openTables: deps.openTables,
    dicePreferences: deps.dicePreferences,
    createDiceRenderer: deps.createDiceRenderer,
  });
  return null;
}

function openVharn(deps: TestDependencies): void {
  act(() => {
    deps.openTables.getState().restore(ANA.id);
    deps.openTables.getState().open({
      campaignId: VHARN.id,
      name: 'Vharn',
      castSceneId: VHARN_CAST_ID,
      cover: VHARN.cover,
    });
  });
}

function historyOf(deps: TestDependencies) {
  const table = deps.openTables.getState().tables.find((t) => t.campaignId === VHARN.id);
  if (table === undefined) throw new Error(`Table ${VHARN.id} is not open: expected it open.`);
  return table.dice.getState().entries;
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useDiceOverlay', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    openVharn(deps);
  });

  it('a public roll with a throw shows its models, Bia’s look and the roller’s aspect', async () => {
    render(<Overlay deps={deps} />);
    const event = biaRolled({
      appearance: { color: 'ember', textureId: TEXTURE_ID, numberColor: '#ffcc00' },
    });

    deps.tableSessionApi.emitTo(VHARN.id, { kind: 'diceRolled', event });
    await settle();

    expect(deps.diceRenderers.latest().shown).toEqual([
      { rollId: BIA_ROLL_ID, throw: event.throw, appearance: event.appearance },
    ]);
    expect(deps.diceRenderers.latest().shown[0]?.throw.aspect).toBe(1.78);
  });

  it('with 3D off the factory is never called and the history reveals at the same time', async () => {
    deps.dicePreferences.getState().setThreeD(false);
    render(<Overlay deps={deps} />);

    deps.tableSessionApi.emitTo(VHARN.id, { kind: 'diceRolled', event: biaRolled() });
    await settle();

    expect(deps.diceRenderers.calls).toBe(0);
    const [entry] = historyOf(deps);
    expect(entry?.revealAtMs).toBe((entry?.receivedAtMs ?? Number.NaN) + 2400);
  });

  it('turning 3D back on shows the next roll', async () => {
    deps.dicePreferences.getState().setThreeD(false);
    render(<Overlay deps={deps} />);
    deps.tableSessionApi.emitTo(VHARN.id, { kind: 'diceRolled', event: biaRolled() });

    act(() => deps.dicePreferences.getState().setThreeD(true));
    deps.tableSessionApi.emitTo(VHARN.id, {
      kind: 'diceRolled',
      event: biaRolled({ rollId: rollIdOf(1) }),
    });
    await settle();

    expect(deps.diceRenderers.calls).toBe(1);
    expect(deps.diceRenderers.latest().shown.map((roll) => roll.rollId)).toEqual([rollIdOf(1)]);
  });

  it('turning 3D off drops the dice on screen', async () => {
    render(<Overlay deps={deps} />);
    deps.tableSessionApi.emitTo(VHARN.id, { kind: 'diceRolled', event: biaRolled() });
    await settle();

    act(() => deps.dicePreferences.getState().setThreeD(false));

    expect(deps.diceRenderers.latest().clears).toBe(1);
  });

  it('a secret notice reaches no renderer', async () => {
    render(<Overlay deps={deps} />);

    deps.tableSessionApi.emitTo(VHARN.id, {
      kind: 'diceRolledSecretly',
      event: biaRolledSecretly(),
    });
    await settle();

    expect(deps.diceRenderers.calls).toBe(0);
    expect(historyOf(deps)).toHaveLength(1);
  });

  it('a roll of only d7 (throw: null) reaches no renderer', async () => {
    render(<Overlay deps={deps} />);

    deps.tableSessionApi.emitTo(VHARN.id, {
      kind: 'diceRolled',
      event: biaRolled({ throw: null, parts: [{ ...biaRolled().parts[0]!, dice: [] }] }),
    });
    await settle();

    expect(deps.diceRenderers.calls).toBe(0);
  });

  it('the renderer is born on the first roll, not when the room opens', async () => {
    render(<Overlay deps={deps} />);
    expect(deps.diceRenderers.calls).toBe(0);

    deps.tableSessionApi.emitTo(VHARN.id, { kind: 'diceRolled', event: biaRolled() });
    deps.tableSessionApi.emitTo(VHARN.id, {
      kind: 'diceRolled',
      event: biaRolled({ rollId: rollIdOf(2) }),
    });
    await settle();

    expect(deps.diceRenderers.calls).toBe(1);
    expect(deps.diceRenderers.latest().shown).toHaveLength(2);
  });

  it('rolls that arrive while three.js loads are shown once it is ready', async () => {
    deps.diceRenderers.hold();
    render(<Overlay deps={deps} />);
    deps.tableSessionApi.emitTo(VHARN.id, { kind: 'diceRolled', event: biaRolled() });
    deps.tableSessionApi.emitTo(VHARN.id, {
      kind: 'diceRolled',
      event: biaRolled({ rollId: rollIdOf(3) }),
    });

    await deps.diceRenderers.finishLoad();

    expect(deps.diceRenderers.calls).toBe(1);
    expect(deps.diceRenderers.latest().shown.map((roll) => roll.rollId)).toEqual([
      BIA_ROLL_ID,
      rollIdOf(3),
    ]);
  });

  it('leaving the room destroys the renderer', async () => {
    const { unmount } = render(<Overlay deps={deps} />);
    deps.tableSessionApi.emitTo(VHARN.id, { kind: 'diceRolled', event: biaRolled() });
    await settle();

    unmount();

    expect(deps.diceRenderers.latest().destroyed).toBe(true);
  });

  it('leaving while three.js still loads destroys the renderer as soon as it arrives', async () => {
    deps.diceRenderers.hold();
    const { unmount } = render(<Overlay deps={deps} />);
    deps.tableSessionApi.emitTo(VHARN.id, { kind: 'diceRolled', event: biaRolled() });

    unmount();
    await deps.diceRenderers.finishLoad();

    expect(deps.diceRenderers.latest().destroyed).toBe(true);
    expect(deps.diceRenderers.latest().shown).toEqual([]);
  });
});
