export interface CombatantReader {
  findNames(combatId: string): Promise<string[]>;
}

export class CombatService {
  constructor(private readonly combatants: CombatantReader) {}

  listNames(combatId: string): Promise<string[]> {
    return this.combatants.findNames(combatId);
  }
}
