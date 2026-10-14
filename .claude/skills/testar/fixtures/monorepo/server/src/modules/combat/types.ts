export type CombatStatus = 'active' | 'ended';
export interface CombatSummary {
  id: string;
  status: CombatStatus;
}
