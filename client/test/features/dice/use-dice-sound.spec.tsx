import { act, render } from '@testing-library/react';
import { encodeDiceFrames, IDENTITY_QUATERNION, type DicePose } from '@lorkarium/game-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { DICE_PLAIN_ROLL_CUE } from '@/dice-audio/dice-roll-cues';
import { useDiceSound } from '@/features/dice/use-dice-sound';
import { ANA } from '../../support/auth-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { biaRolled, biaRolledSecretly, rollIdOf } from '../../support/dice-fixtures';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

function Sound({ deps }: Readonly<{ deps: TestDependencies }>): null {
  useDiceSound({
    campaignId: VHARN.id,
    openTables: deps.openTables,
    dicePreferences: deps.dicePreferences,
    createDiceSound: deps.createDiceSound,
  });
  return null;
}

function openVharn(deps: TestDependencies): void {
  act(() => {
    deps.openTables.getState().restore(ANA.id);
    deps.openTables.getState().open({
      campaignId: VHARN.id,
      name: 'Vharn',
      cover: VHARN.cover,
    });
  });
}

function poseAtHeight(y: number): DicePose {
  return { position: { x: 0, y, z: 0 }, quaternion: IDENTITY_QUATERNION };
}

/** A d20 falling at 30 units/s that hits the floor on the 3rd frame and stops dead. */
const BOUNCING_D20 = encodeDiceFrames([3, 2, 1, 1, 1].map(poseAtHeight));

describe('useDiceSound', () => {
  let deps: TestDependencies;

  beforeEach(() => {
    deps = testDependencies();
    openVharn(deps);
  });

  it('a roll with a throw plays one roll, timed to its d20 hitting the floor', () => {
    render(<Sound deps={deps} />);
    const event = biaRolled({
      throw: {
        aspect: 1.78,
        frameMs: 1000 / 30,
        models: [{ kind: 'd20', startMs: 0, settleMs: 2400, frames: BOUNCING_D20 }],
      },
    });

    deps.tableSessionApi.emitTo(VHARN.id, { kind: 'diceRolled', event });

    expect(deps.diceSounds.latest().played).toEqual([
      [{ atMs: 2000 / 30, strength: 30 / 40, dice: 1 }],
    ]);
  });

  it('a secret notice plays the plain roll, the same for any result', () => {
    render(<Sound deps={deps} />);

    deps.tableSessionApi.emitTo(VHARN.id, {
      kind: 'diceRolledSecretly',
      event: biaRolledSecretly(),
    });

    expect(deps.diceSounds.latest().played).toEqual([[DICE_PLAIN_ROLL_CUE]]);
  });

  it('a roll of only d7 (throw: null) plays the plain roll too', () => {
    render(<Sound deps={deps} />);

    deps.tableSessionApi.emitTo(VHARN.id, {
      kind: 'diceRolled',
      event: biaRolled({ throw: null }),
    });

    expect(deps.diceSounds.latest().played).toEqual([[DICE_PLAIN_ROLL_CUE]]);
  });

  it('sounds with 3D off: the switches are apart', () => {
    deps.dicePreferences.getState().setThreeD(false);
    render(<Sound deps={deps} />);

    deps.tableSessionApi.emitTo(VHARN.id, { kind: 'diceRolled', event: biaRolled() });

    expect(deps.diceSounds.latest().played).toHaveLength(1);
  });

  it('muted, nothing plays; unmuted, the next roll does', () => {
    deps.dicePreferences.getState().setSound(false);
    render(<Sound deps={deps} />);
    deps.tableSessionApi.emitTo(VHARN.id, { kind: 'diceRolled', event: biaRolled() });
    expect(deps.diceSounds.latest().played).toEqual([]);

    act(() => deps.dicePreferences.getState().setSound(true));
    deps.tableSessionApi.emitTo(VHARN.id, {
      kind: 'diceRolled',
      event: biaRolled({ rollId: rollIdOf(1) }),
    });

    expect(deps.diceSounds.latest().played).toHaveLength(1);
  });

  it('entering the room prepares the sound before any roll', () => {
    render(<Sound deps={deps} />);

    expect(deps.diceSounds.latest().prepares).toBe(1);
  });

  it('muted, the sound is not prepared until it is turned on', () => {
    deps.dicePreferences.getState().setSound(false);
    render(<Sound deps={deps} />);
    expect(deps.diceSounds.latest().prepares).toBe(0);

    act(() => deps.dicePreferences.getState().setSound(true));

    expect(deps.diceSounds.latest().prepares).toBe(1);
  });

  it('muting stops what is still sounding', () => {
    render(<Sound deps={deps} />);

    act(() => deps.dicePreferences.getState().setSound(false));

    expect(deps.diceSounds.latest().stops).toBe(1);
  });

  it('leaving the room destroys the sound', () => {
    const { unmount } = render(<Sound deps={deps} />);

    unmount();

    expect(deps.diceSounds.latest().destroyed).toBe(true);
  });
});
