import type { PlanCountResource } from '@lorkarium/contracts';

/** The row label of each counted resource in the "Seu plano" grid, worded as the refusals
 *  name it (`PLAN_COUNT_LABEL` of `lib/plan-limit-message.ts`).
 *
 *  Example: `PLAN_COUNT_LABELS.scenes // 'Grids por mesa'` */
export const PLAN_COUNT_LABELS: Readonly<Record<PlanCountResource, string>> = {
  campaigns: 'Mesas como dono',
  storage: 'Armazenamento',
  players: 'Jogadores por mesa',
  masters: 'Co-mestres por mesa',
  spectators: 'Espectadores por mesa',
  scenes: 'Grids por mesa',
  libraryMaps: 'Mapas interativos por mesa',
  sheetTemplates: 'Modelos de ficha por mesa',
  npcSheets: 'Fichas de NPC por mesa',
  documentTabs: 'Abas por documento',
  lights: 'Luzes por cena',
  tokenBars: 'Barras por token',
  tokenForms: 'Formas por token',
  patrols: 'Patrulhas ligadas por grid',
  sightBlockers: 'Tokens que bloqueiam a visão por cena',
  savedRolls: 'Rolagens salvas por pessoa',
  savedRollFolders: 'Pastas de rolagens por pessoa',
};
