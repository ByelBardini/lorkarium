import type { AuraEffectDto } from '@lorkarium/contracts';

/** One compiled program per effect, shared by every aura of that effect: 30 fires on the table
 *  compile the fire shader once. `Program` stays generic so the cache runs without WebGL.
 *
 *  Example: `new AuraProgramCache((effect) => GlProgram.from({ vertex, fragment: AURA_FRAGMENTS[effect] }))` */
export class AuraProgramCache<Program> {
  private readonly programs = new Map<AuraEffectDto, Program>();

  constructor(private readonly compile: (effect: AuraEffectDto) => Program) {}

  /** The program of an effect, compiled on first use.
   *
   *  Example: `new Shader({ glProgram: cache.programOf('fire'), resources })` */
  programOf(effect: AuraEffectDto): Program {
    const known = this.programs.get(effect);
    if (known !== undefined) return known;
    const program = this.compile(effect);
    this.programs.set(effect, program);
    return program;
  }
}
