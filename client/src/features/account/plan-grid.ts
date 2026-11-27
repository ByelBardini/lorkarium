import {
  AURA_KINDS,
  PERSONAL_SAVED_ROLL_LIMITS,
  PERSONAL_SAVED_TOKEN_LIMITS,
  PLAN_COUNT_LIMIT_KEY,
  PLAN_COUNT_RESOURCES,
  PLAN_FAIR_USE_RESOURCES,
  type PlanCountResource,
  type PlanLimits,
} from '@lorkarium/contracts';
import { byteSizeText } from '@/lib/byte-size-text';
import { PLAN_COUNT_LABELS } from './plan-section-labels';

/** One line of the "Seu plano" grid: its label, the text of the cell of each plan and, on the
 *  numeric lines, the amount the plans are compared by (`null`: nothing to compare). */
export type PlanGridRow = Readonly<{
  label: string;
  cellOf: (limits: PlanLimits) => string;
  amountOf?: (limits: PlanLimits) => number | null;
}>;

const NUMBER = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

const AURA_KIND_NAMES: Readonly<Record<(typeof AURA_KINDS)[number], string>> = {
  color: 'cor',
  effect: 'efeito',
  image: 'imagem',
};

/** The tables owned against the plan ceiling; with no ceiling, the count alone.
 *
 *  Example: `campaignsUsageLabel(1, 1) // '1 de 1 mesa'` */
export function campaignsUsageLabel(used: number, limit: number | null): string {
  const noun = (count: number): string => (count === 1 ? 'mesa' : 'mesas');
  if (limit === null) return `${NUMBER.format(used)} ${noun(used)}`;
  return `${NUMBER.format(used)} de ${NUMBER.format(limit)} ${noun(limit)}`;
}

/** The bytes spent against the plan ceiling; with no ceiling, the size alone.
 *
 *  Example: `storageUsageLabel(40 * 1024 ** 2, 100 * 1024 ** 2) // '40 MB de 100 MB'` */
export function storageUsageLabel(used: number, limit: number | null): string {
  if (limit === null) return byteSizeText(used);
  return `${byteSizeText(used)} de ${byteSizeText(limit)}`;
}

// The saved rolls and tokens are the person's: each plan shows what its holder keeps at any table.
const PERSONAL_CEILING: Readonly<
  Partial<Record<PlanCountResource, (limits: PlanLimits) => number>>
> = {
  savedRolls: (limits) => PERSONAL_SAVED_ROLL_LIMITS[limits.plan].maxSavedRolls,
  savedRollFolders: (limits) => PERSONAL_SAVED_ROLL_LIMITS[limits.plan].maxSavedRollFolders,
  savedTokens: (limits) => PERSONAL_SAVED_TOKEN_LIMITS[limits.plan].maxSavedTokens,
  savedTokenFolders: (limits) => PERSONAL_SAVED_TOKEN_LIMITS[limits.plan].maxSavedTokenFolders,
};

function ceilingOf(resource: PlanCountResource, limits: PlanLimits): number | null {
  const personal = PERSONAL_CEILING[resource];
  if (personal !== undefined) return personal(limits);
  return limits[PLAN_COUNT_LIMIT_KEY[resource]];
}

/** The cell of a counted resource: "ilimitado" on a fair-use ceiling, "sem limite" without one;
 *  the saved rolls and tokens by the plan's own ceilings (the Apoiador keeps its own).
 *
 *  Example: `countCell('scenes', PLAN_LIMITS.lenda) // 'ilimitado'` */
export function countCell(resource: PlanCountResource, limits: PlanLimits): string {
  if (PLAN_FAIR_USE_RESOURCES[limits.plan].includes(resource)) return 'ilimitado';
  const limit = ceilingOf(resource, limits);
  if (limit === null) return 'sem limite';
  return resource === 'storage' ? byteSizeText(limit) : NUMBER.format(limit);
}

/** The aura kinds a plan offers, in words.
 *
 *  Example: `auraCell(PLAN_LIMITS.free) // 'só cor'` */
export function auraCell(limits: PlanLimits): string {
  const names = limits.auraKinds.map((kind) => AURA_KIND_NAMES[kind]);
  if (names.length === 1) return `só ${names[0]}`;
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}

const yesNo = (allowed: boolean): string => (allowed ? 'sim' : 'não');

/** The lines that say whether a plan has a feature, the marks on top of the grid.
 *
 *  Example: `PLAN_FEATURE_ROWS[0]?.cellOf(PLAN_LIMITS.free) // 'não'` */
export const PLAN_FEATURE_ROWS: readonly PlanGridRow[] = [
  { label: 'Condição com imagem própria', cellOf: (l) => yesNo(l.conditionImage) },
  { label: 'Duplicar grid', cellOf: (l) => yesNo(l.sceneCopy) },
  { label: 'Janelas Chat e Imagens', cellOf: (l) => yesNo(l.desktopWindows) },
  { label: 'Scripts na ficha', cellOf: (l) => yesNo(l.sheetScripts) },
  { label: 'Arte animada da mesa', cellOf: (l) => yesNo(l.animatedCampaignArt) },
  { label: 'Cor personalizada no conteúdo da mesa', cellOf: (l) => yesNo(l.customColor) },
  // Of the account, not of the tables: what sets the Apoiador apart from Grátis.
  {
    label: 'Personalizações da conta (cor própria, textura do dado, foto animada)',
    cellOf: (l) => yesNo(l.plan !== 'free'),
  },
  { label: 'Banner de perfil', cellOf: (l) => yesNo(l.profileBanner) },
  { label: 'Emoji personalizado animado (GIF)', cellOf: (l) => yesNo(l.animatedCustomEmojis) },
  { label: 'Aura', cellOf: auraCell },
];

// A fair-use or missing ceiling is not a number to compare.
function countAmount(resource: PlanCountResource, limits: PlanLimits): number | null {
  if (PLAN_FAIR_USE_RESOURCES[limits.plan].includes(resource)) return null;
  return ceilingOf(resource, limits);
}

/** The numeric lines, below the marks: the counted resources in the order of the contracts.
 *
 *  Example: `PLAN_AMOUNT_ROWS[0]?.amountOf?.(PLAN_LIMITS.narrador) // 3` */
export const PLAN_AMOUNT_ROWS: readonly PlanGridRow[] = [
  ...PLAN_COUNT_RESOURCES.map((resource) => ({
    label: PLAN_COUNT_LABELS[resource],
    cellOf: (limits: PlanLimits) => countCell(resource, limits),
    amountOf: (limits: PlanLimits) => countAmount(resource, limits),
  })),
  {
    label: 'Dados com física por rolagem',
    cellOf: (l) => NUMBER.format(l.maxDiceModelsPerRoll),
    amountOf: (l) => l.maxDiceModelsPerRoll,
  },
  {
    label: 'Lado máximo do mapa / fundo de grid',
    cellOf: (l) => `${l.maxMapSide} / ${l.maxBackgroundSide} px`,
    amountOf: (l) => l.maxMapSide,
  },
];

/** Every line of the grid: the marks first, then the numbers.
 *
 *  Example: `PLAN_GRID_ROWS.map((row) => row.cellOf(PLAN_LIMITS.free))` */
export const PLAN_GRID_ROWS: readonly PlanGridRow[] = [...PLAN_FEATURE_ROWS, ...PLAN_AMOUNT_ROWS];
