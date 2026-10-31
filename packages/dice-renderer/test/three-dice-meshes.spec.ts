import * as three from 'three';
import { describe, expect, it } from 'vitest';
import { dieGeometryOf } from '../src/die-geometry';
import { ThreeDiceMeshes } from '../src/three-dice-meshes';
import { EMBER_HEX, TEST_DICE_LOOK } from './support/dice-roll-fixtures';

const COLORED = { color: 'ember', textureId: null, numberColor: null } as const;

function meshesOf(group: three.Group): three.Mesh[] {
  return group.children.filter((child): child is three.Mesh => child instanceof three.Mesh);
}

function materialOf(mesh: three.Mesh): three.MeshLambertMaterial {
  const material = mesh.material;
  if (!(material instanceof three.MeshLambertMaterial)) {
    throw new Error(`Mesh material is ${String(material)}: expected one MeshLambertMaterial.`);
  }
  return material;
}

describe('ThreeDiceMeshes.rollObjects', () => {
  it('one group per die in throw order, under the roll root', () => {
    const roll = new ThreeDiceMeshes(three, document, TEST_DICE_LOOK).rollObjects(
      ['d20', 'd6'],
      COLORED,
    );

    expect(roll.dice).toHaveLength(2);
    expect(roll.root.children).toEqual(roll.dice);
  });

  it('a d20 is its body plus one number per face; a d4 has three per face', () => {
    const roll = new ThreeDiceMeshes(three, document, TEST_DICE_LOOK).rollObjects(
      ['d20', 'd4'],
      COLORED,
    );
    const [d20, d4] = roll.dice;

    expect(meshesOf(d20!)).toHaveLength(1 + 20);
    expect(meshesOf(d4!)).toHaveLength(1 + 12);
  });

  it('the body is the die-geometry mesh in the profile color', () => {
    const [die] = new ThreeDiceMeshes(three, document, TEST_DICE_LOOK).rollObjects(
      ['d6'],
      COLORED,
    ).dice;
    const [body] = meshesOf(die!);

    const position = body!.geometry.getAttribute('position');
    expect(position.array).toBe(dieGeometryOf('d6').positions);
    expect(materialOf(body!).color.getHex()).toBe(EMBER_HEX);
  });

  it('each number faces out of its face: the plane +z is the label normal', () => {
    const [die] = new ThreeDiceMeshes(three, document, TEST_DICE_LOOK).rollObjects(
      ['d8'],
      COLORED,
    ).dice;
    const [, firstLabel] = meshesOf(die!);
    const expected = dieGeometryOf('d8').labels[0]!.normal;

    const facing = new three.Vector3(0, 0, 1).applyQuaternion(firstLabel!.quaternion);
    expect(facing.x).toBeCloseTo(expected.x, 5);
    expect(facing.y).toBeCloseTo(expected.y, 5);
    expect(facing.z).toBeCloseTo(expected.z, 5);
  });

  it('the same number on two dice of a roll shares one material', () => {
    const roll = new ThreeDiceMeshes(three, document, TEST_DICE_LOOK).rollObjects(
      ['d6', 'd6'],
      COLORED,
    );
    const [first, second] = roll.dice.map((die) => meshesOf(die)[1]!);

    expect(first!.material).toBe(second!.material);
  });

  it('setOpacity fades the body and every number of the roll', () => {
    const roll = new ThreeDiceMeshes(three, document, TEST_DICE_LOOK).rollObjects(['d6'], COLORED);

    roll.setOpacity(0.5);

    const opacities = meshesOf(roll.dice[0]!).map((mesh) => materialOf(mesh).opacity);
    expect(new Set(opacities)).toEqual(new Set([0.5]));
  });

  it('two rolls never share a material, so one fading leaves the other alone', () => {
    const meshes = new ThreeDiceMeshes(three, document, TEST_DICE_LOOK);
    const fading = meshes.rollObjects(['d6'], COLORED);
    const steady = meshes.rollObjects(['d6'], COLORED);

    fading.setOpacity(0.2);

    expect(materialOf(meshesOf(steady.dice[0]!)[0]!).opacity).toBe(1);
  });

  it('dispose frees the materials of that roll', () => {
    const roll = new ThreeDiceMeshes(three, document, TEST_DICE_LOOK).rollObjects(['d6'], COLORED);
    const body = materialOf(meshesOf(roll.dice[0]!)[0]!);
    let disposed = 0;
    body.addEventListener('dispose', () => (disposed += 1));

    roll.dispose();

    expect(disposed).toBe(1);
  });
});
