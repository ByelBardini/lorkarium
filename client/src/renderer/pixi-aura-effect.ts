import type { AuraEffectDto } from '@lorkarium/contracts';
import { Container, GlProgram, Mesh, MeshGeometry, Shader, UniformGroup } from 'pixi.js';
import { AURA_EFFECT_LOOKS, auraQuadPositions, type AuraUniforms } from './aura-effect-looks';
import { AuraProgramCache } from './aura-program-cache';
import { AURA_FRAGMENTS, AURA_VERTEX } from './aura-shaders/aura-fragments';
import {
  auraUniformStructuresOf,
  newAuraUniformValues,
  writeAuraUniformValues,
  type AuraUniformStructures,
} from './aura-uniform-values';

// GLSL only: the board renderer runs on WebGL (`preference: 'webgl'`); WebGPU would need WGSL.
// highp because the noise hashes world px: mediump turns it into visible blocks.
const AURA_PROGRAMS = new AuraProgramCache((effect: AuraEffectDto) =>
  GlProgram.from({
    vertex: AURA_VERTEX,
    fragment: AURA_FRAGMENTS[effect],
    name: `aura-${effect}`,
    preferredFragmentPrecision: 'highp',
  }),
);

const QUAD_UVS = [0, 0, 1, 0, 1, 1, 0, 1];
const QUAD_INDICES = [0, 1, 2, 0, 2, 3];

/** One ready-made aura effect on the board: a quad over the token grown by the radius, drawn by
 *  the effect's shared program with its own uniforms. Sits under the tokens of its layer.
 *
 *  Example: `const fire = new PixiAuraEffect('fire'); floor.addChild(fire.display); fire.update(uniforms)` */
export class PixiAuraEffect {
  readonly display = new Container({ eventMode: 'none' });
  private readonly uniforms: UniformGroup<AuraUniformStructures>;
  private readonly geometry: MeshGeometry;
  private readonly shader: Shader;

  constructor(readonly effect: AuraEffectDto) {
    this.uniforms = new UniformGroup(auraUniformStructuresOf(newAuraUniformValues()));
    this.shader = new Shader({
      glProgram: AURA_PROGRAMS.programOf(effect),
      resources: { auraUniforms: this.uniforms },
    });
    this.geometry = new MeshGeometry({
      positions: new Float32Array(QUAD_UVS.length),
      uvs: new Float32Array(QUAD_UVS),
      indices: new Uint32Array(QUAD_INDICES),
      topology: 'triangle-list',
    });
    const mesh = new Mesh({ geometry: this.geometry, shader: this.shader });
    mesh.blendMode = AURA_EFFECT_LOOKS[effect].blend;
    this.display.addChild(mesh);
  }

  /** Moves, resizes and recolors the aura in place (no new GPU objects).
   *
   *  Example: `aura.update(auraUniformsOf({ box, radiusCells, cellSize, opacity, color, tokenId }))` */
  update(uniforms: AuraUniforms): void {
    this.display.position.set(uniforms.center.x, uniforms.center.y);
    this.geometry.positions.set(auraQuadPositions(uniforms));
    this.geometry.getBuffer('aPosition').update();
    writeAuraUniformValues(this.uniforms.uniforms, uniforms);
  }

  /** Sets the animation clock, in seconds; the shader adds the token's own offset.
   *
   *  Example: `aura.tick(elapsedMs / 1000)` */
  tick(seconds: number): void {
    this.uniforms.uniforms.uTime = seconds;
  }

  /** Frees the quad and this aura's shader; the effect's program stays for the other auras.
   *
   *  Example: `aura.destroy()` */
  destroy(): void {
    this.display.destroy({ children: true });
    this.shader.destroy(false);
    this.geometry.destroy(true);
  }
}
