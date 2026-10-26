import type * as Three from 'three';
import type { DieKind } from '@lorkarium/game-core';
import type { DiceAppearanceDto } from '@lorkarium/contracts';
import { dieGeometryOf, type DieLabel } from '@/dice-renderer/die-geometry';
import { labelRightOf } from '@/dice-renderer/dice-stage';
import { diceNumberColorOf } from '@/lib/dice-number-color';
import { diceTextureUrlOf } from '@/lib/dice-texture-url';
import { MEMBER_COLOR_HEX } from '@/lib/member-color';

export type ThreeModule = typeof Three;

const LABEL_CANVAS_PX = 128;
const LABEL_FONT_PX = 92;
// The label's `size` is the text height; the square plane leaves room for two digits.
const LABEL_PLANE_PER_SIZE = LABEL_CANVAS_PX / (LABEL_FONT_PX * 0.72);
// Off the face just enough to win the depth test without floating visibly.
const LABEL_LIFT = 0.004;

/** The 3D objects of one roll: a group per die (moved by its pose) and the materials whose
 *  opacity follows the fade. Nothing here is shared, so `dispose` frees only this roll. */
export interface DiceRollObjects {
  readonly root: Three.Group;
  readonly dice: readonly Three.Group[];
  setOpacity(opacity: number): void;
  dispose(): void;
}

function outlineOf(numberColor: string): string {
  return numberColor.toLowerCase() === '#1a1a1a' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.6)';
}

/** The meshes of the dice over three.js: geometry per kind, a canvas texture per number and
 *  color, and the uploaded texture per id, each built once and freed by `dispose`. */
export class ThreeDiceMeshes {
  private readonly geometries = new Map<DieKind, Three.BufferGeometry>();
  private readonly labelTextures = new Map<string, Three.CanvasTexture>();
  private readonly baseTextures = new Map<string, Promise<Three.Texture | null>>();
  private readonly labelPlane: Three.PlaneGeometry;

  constructor(
    private readonly three: ThreeModule,
    private readonly ownerDocument: Document,
  ) {
    this.labelPlane = new three.PlaneGeometry(1, 1);
  }

  /** The objects of one roll, `kinds` in the order of `throw.models`.
   *
   *  Example: `meshes.rollObjects(['d20'], event.appearance).dice[0].position.set(0, 1, 0)` */
  rollObjects(kinds: readonly DieKind[], appearance: DiceAppearanceDto): DiceRollObjects {
    const base = this.baseMaterialOf(appearance);
    const labels = new Map<string, Three.MeshLambertMaterial>();
    const numberColor = diceNumberColorOf(appearance);
    const labelMaterialOf = (text: string): Three.MeshLambertMaterial =>
      this.labelMaterialIn(labels, text, numberColor);
    const root = new this.three.Group();
    const dice = kinds.map((kind) => this.dieObject(kind, base, labelMaterialOf));
    dice.forEach((die) => root.add(die));
    const materials = (): Three.Material[] => [base, ...labels.values()];
    return {
      root,
      dice,
      setOpacity: (opacity) => materials().forEach((material) => (material.opacity = opacity)),
      dispose: () => materials().forEach((material) => material.dispose()),
    };
  }

  /** Frees every geometry and texture; the meshes are unusable afterwards. */
  dispose(): void {
    this.geometries.forEach((geometry) => geometry.dispose());
    this.labelTextures.forEach((texture) => texture.dispose());
    this.baseTextures.forEach((loading) => void loading.then((texture) => texture?.dispose()));
    this.labelPlane.dispose();
    this.geometries.clear();
    this.labelTextures.clear();
    this.baseTextures.clear();
  }

  private dieObject(
    kind: DieKind,
    base: Three.Material,
    labelMaterialOf: (text: string) => Three.Material,
  ): Three.Group {
    const die = new this.three.Group();
    die.add(new this.three.Mesh(this.geometryOf(kind), base));
    for (const label of dieGeometryOf(kind).labels) {
      die.add(this.labelMesh(label, labelMaterialOf(label.text)));
    }
    return die;
  }

  private labelMesh(label: DieLabel, material: Three.Material): Three.Mesh {
    const { Matrix4, Mesh, Vector3 } = this.three;
    const mesh = new Mesh(this.labelPlane, material);
    const right = labelRightOf(label.up, label.normal);
    const basis = new Matrix4().makeBasis(
      new Vector3(right.x, right.y, right.z),
      new Vector3(label.up.x, label.up.y, label.up.z),
      new Vector3(label.normal.x, label.normal.y, label.normal.z),
    );
    mesh.quaternion.setFromRotationMatrix(basis);
    const { position: at, normal } = label;
    mesh.position.set(
      at.x + normal.x * LABEL_LIFT,
      at.y + normal.y * LABEL_LIFT,
      at.z + normal.z * LABEL_LIFT,
    );
    mesh.scale.setScalar(label.size * LABEL_PLANE_PER_SIZE);
    mesh.renderOrder = 1;
    return mesh;
  }

  private geometryOf(kind: DieKind): Three.BufferGeometry {
    const known = this.geometries.get(kind);
    if (known !== undefined) return known;
    const { BufferAttribute, BufferGeometry } = this.three;
    const mesh = dieGeometryOf(kind);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
    geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
    geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
    this.geometries.set(kind, geometry);
    return geometry;
  }

  private baseMaterialOf(appearance: DiceAppearanceDto): Three.MeshLambertMaterial {
    const material = new this.three.MeshLambertMaterial({
      color: MEMBER_COLOR_HEX[appearance.color],
      transparent: true,
    });
    if (appearance.textureId === null) return material;
    void this.baseTextureOf(appearance.textureId).then((texture) => {
      if (texture === null) return;
      material.map = texture;
      material.color.set(0xffffff);
      material.needsUpdate = true;
    });
    return material;
  }

  // A texture that fails to load leaves the die in the profile color.
  private baseTextureOf(textureId: string): Promise<Three.Texture | null> {
    const known = this.baseTextures.get(textureId);
    if (known !== undefined) return known;
    const loading = new Promise<Three.Texture | null>((resolve) => {
      new this.three.TextureLoader().load(
        diceTextureUrlOf(textureId),
        (texture) => {
          texture.colorSpace = this.three.SRGBColorSpace;
          resolve(texture);
        },
        undefined,
        () => resolve(null),
      );
    });
    this.baseTextures.set(textureId, loading);
    return loading;
  }

  private labelMaterialIn(
    materials: Map<string, Three.MeshLambertMaterial>,
    text: string,
    numberColor: string,
  ): Three.MeshLambertMaterial {
    const known = materials.get(text);
    if (known !== undefined) return known;
    const material = new this.three.MeshLambertMaterial({
      map: this.labelTextureOf(text, numberColor),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    materials.set(text, material);
    return material;
  }

  private labelTextureOf(text: string, numberColor: string): Three.CanvasTexture {
    const key = `${numberColor}|${text}`;
    const known = this.labelTextures.get(key);
    if (known !== undefined) return known;
    const texture = new this.three.CanvasTexture(this.labelCanvas(text, numberColor));
    texture.colorSpace = this.three.SRGBColorSpace;
    texture.anisotropy = 4;
    this.labelTextures.set(key, texture);
    return texture;
  }

  private labelCanvas(text: string, numberColor: string): HTMLCanvasElement {
    const canvas = this.ownerDocument.createElement('canvas');
    canvas.width = LABEL_CANVAS_PX;
    canvas.height = LABEL_CANVAS_PX;
    const context = canvas.getContext('2d');
    if (context === null) return canvas;
    const center = LABEL_CANVAS_PX / 2;
    context.font = `700 ${LABEL_FONT_PX}px "Hanken Grotesk Variable", system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 6;
    context.strokeStyle = outlineOf(numberColor);
    context.strokeText(text, center, center, LABEL_CANVAS_PX - 8);
    context.fillStyle = numberColor;
    context.fillText(text, center, center, LABEL_CANVAS_PX - 8);
    return canvas;
  }
}
