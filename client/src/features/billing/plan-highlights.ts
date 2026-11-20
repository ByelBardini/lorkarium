import {
  PERSONAL_SAVED_ROLL_LIMITS,
  PLAN_LIMITS,
  type BillingPlan,
  type PlanLimits,
  type SavedRollCeilings,
} from '@lorkarium/contracts';
import { byteSizeText } from '@/lib/byte-size-text';

export type OfferedPlan = 'free' | BillingPlan;

// The lines under each offer: the numbers come from PLAN_LIMITS, so they never drift from the
// limits the server applies; the full grid stays in "Limites por plano".
const EXTRA_LINES: Readonly<Record<OfferedPlan, readonly string[]>> = {
  free: ['Jogar nas mesas dos outros é sempre de graça'],
  apoiador: [],
  narrador: ['Mapas interativos, scripts na ficha e mesa privada', 'Tudo do Apoiador'],
  lenda: [
    'Janelas de Chat e Imagens, auras com efeito e arte animada',
    'Grids, mapas e fichas sem limite no uso normal',
    'Banner no seu perfil',
    'Tudo do Narrador',
  ],
};

const APOIADOR_LINES = [
  'Mesas com os limites do Grátis',
  'Cor própria no perfil, nos dados e nas cores salvas',
  'Textura própria para os seus dados',
  'Foto de perfil em GIF animado',
  savedRollsLine(PERSONAL_SAVED_ROLL_LIMITS.apoiador),
];

/** What an offer promises in a few lines.
 *
 *  Example: `planHighlightsOf('narrador')[0] // '3 mesas como dono e 1 GB de imagens'` */
export function planHighlightsOf(plan: OfferedPlan): readonly string[] {
  if (plan === 'apoiador') return APOIADOR_LINES;
  const limits = PLAN_LIMITS[plan];
  return [tablesLine(limits), seatsLine(limits), ...EXTRA_LINES[plan]];
}

function savedRollsLine(ceilings: SavedRollCeilings): string {
  return `${ceilings.maxSavedRolls} rolagens salvas e ${ceilings.maxSavedRollFolders} pastas em qualquer mesa`;
}

function tablesLine({ maxCampaigns, maxStorageBytes }: PlanLimits): string {
  const tables = maxCampaigns === 1 ? '1 mesa' : `${maxCampaigns ?? 'Mesas sem limite'} mesas`;
  const storage =
    maxStorageBytes === null ? 'imagens sem limite' : `${byteSizeText(maxStorageBytes)} de imagens`;
  return `${tables} como dono e ${storage}`;
}

function seatsLine({ maxPlayers, maxSpectators }: PlanLimits): string {
  return `${maxPlayers ?? 'Sem limite de'} jogadores e ${maxSpectators ?? 'sem limite de'} espectadores por mesa`;
}
