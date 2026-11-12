import {
  PLAN_COUNT_LIMIT_KEY,
  PLAN_FAIR_USE_RESOURCES,
  PLAN_LIMITS,
  USER_PLANS,
  type PlanCountResource,
  type PlanFeatureResource,
  type PlanLimitDto,
  type PlanLimitResource,
  type UserPlan,
} from '@lorkarium/contracts';
import { byteSizeText } from './byte-size-text';
import { PLAN_NAMES } from './plan-seal';

/** What a refusal for the plan reads where only its kind arrived (no ceiling to name). */
export const PLAN_LIMIT_FALLBACK = 'O plano desta mesa não permite isso.';

const PLAN_WITH_ARTICLE: Readonly<Record<UserPlan, string>> = {
  free: 'O Grátis',
  apoiador: 'O Apoiador',
  narrador: 'O Narrador',
  lenda: 'A Lenda',
  amigo_do_dono: 'O Amigo do Dono',
};

// Amigo do Dono is given, never bought, and the Apoiador keeps the tables on Grátis: the sentence
// only points at the master plans one can move to.
const PLANS_ON_OFFER: readonly UserPlan[] = ['narrador', 'lenda'];

/** How a counted resource is named: one, many, and the whole sentence when the plan has none.
 *  `account` reads as the person's own plan (mesas como dono); the rest is the table owner's. */
export type PlanCountLabel = Readonly<{
  one: string;
  many: string;
  absent: string;
  scope: 'account' | 'table';
}>;

/** The pt-BR words of every counted resource of the plans. */
export const PLAN_COUNT_LABEL: Readonly<Record<PlanCountResource, PlanCountLabel>> = {
  campaigns: countLabel('mesa como dono', 'mesas como dono', 'Criar mesa está', 'account'),
  storage: countLabel('de arquivos', 'de arquivos', 'Enviar arquivos está'),
  players: countLabel('jogador', 'jogadores', 'Jogador está'),
  masters: countLabel('co-mestre', 'co-mestres', 'Co-mestre está'),
  spectators: countLabel('espectador', 'espectadores', 'Espectador está'),
  scenes: countLabel('grid', 'grids', 'Grid está'),
  libraryMaps: countLabel('mapa interativo', 'mapas interativos', 'Mapa interativo está'),
  sheetTemplates: countLabel('modelo de ficha', 'modelos de ficha', 'Modelo de ficha está'),
  npcSheets: countLabel('ficha de NPC', 'fichas de NPC', 'Ficha de NPC está'),
  documentTabs: countLabel('aba por documento', 'abas por documento', 'Aba de documento está'),
  lights: countLabel('luz por cena', 'luzes por cena', 'Luz está'),
  tokenBars: countLabel('barra por token', 'barras por token', 'Barra de token está'),
  tokenForms: countLabel('forma por token', 'formas por token', 'Forma de token está'),
  patrols: countLabel('patrulha ligada por grid', 'patrulhas ligadas por grid', 'Patrulha está'),
  sightBlockers: countLabel(
    'token que bloqueia a visão por cena',
    'tokens que bloqueiam a visão por cena',
    'Token que bloqueia a visão está',
  ),
  savedRolls: countLabel(
    'rolagem salva por pessoa',
    'rolagens salvas por pessoa',
    'Rolagem salva está',
  ),
  savedRollFolders: countLabel(
    'pasta de rolagens por pessoa',
    'pastas de rolagens por pessoa',
    'Pasta de rolagens está',
  ),
};

/** The pt-BR name of every feature a plan may lack, as the subject of "está nos planos pagos". */
export const PLAN_FEATURE_LABEL: Readonly<Record<PlanFeatureResource, string>> = {
  sceneCopy: 'Duplicar grid está',
  conditionImage: 'Condição com imagem própria está',
  auraKind: 'Aura com efeito ou imagem está',
  desktopWindows: 'As janelas de Chat e Imagens estão',
  customColor: 'Cor personalizada está',
  diceTexture: 'Textura própria do dado está',
  animatedAvatar: 'Foto de perfil animada está',
};

function countLabel(
  one: string,
  many: string,
  absent: string,
  scope: PlanCountLabel['scope'] = 'table',
): PlanCountLabel {
  return { one, many, absent: `${absent} nos planos pagos.`, scope };
}

/** The pt-BR sentence of a refusal for passing the plan: the ceiling and the plan that frees
 *  more; a feature (or a ceiling of 0) the plan lacks; Lenda's fair use, with no plan above.
 *
 *  Example: `planLimitMessage({ resource: 'scenes', limit: 5, plan: 'free' }) // 'Esta mesa usa o plano Grátis, que permite até 5 grids. O Narrador libera 20.'` */
export function planLimitMessage(planLimit: PlanLimitDto): string {
  const { resource, limit, plan } = planLimit;
  if (!isCountResource(resource)) return `${PLAN_FEATURE_LABEL[resource]} nos planos pagos.`;
  if (limit === 0) return PLAN_COUNT_LABEL[resource].absent;
  if (PLAN_FAIR_USE_RESOURCES[plan].includes(resource)) {
    return `Esta mesa chegou ao limite de uso justo (${amountText(resource, limit)}).`;
  }
  const ceiling = ceilingText(resource, limit, plan);
  const next = nextPlanText(resource, limit, plan);
  return next === null ? ceiling : `${ceiling} ${next}`;
}

/** A counted amount of a resource as the sentences say it: "5 grids", "1 mesa como dono", "100 MB de arquivos".
 *
 *  Example: `amountText('scenes', 1) // '1 grid'` */
export function amountText(resource: PlanCountResource, amount: number): string {
  if (resource === 'storage') return `${byteSizeText(amount)} de arquivos`;
  const label = PLAN_COUNT_LABEL[resource];
  return `${amount} ${amount === 1 ? label.one : label.many}`;
}

function isCountResource(resource: PlanLimitResource): resource is PlanCountResource {
  return Object.hasOwn(PLAN_COUNT_LIMIT_KEY, resource);
}

function ceilingText(resource: PlanCountResource, limit: number, plan: UserPlan): string {
  const amount = amountText(resource, limit);
  if (PLAN_COUNT_LABEL[resource].scope === 'account') {
    return `Seu plano ${PLAN_NAMES[plan]} permite até ${amount}.`;
  }
  return `Esta mesa usa o plano ${PLAN_NAMES[plan]}, que permite até ${amount}.`;
}

function nextPlanText(resource: PlanCountResource, limit: number, plan: UserPlan): string | null {
  const above = PLANS_ON_OFFER.filter(
    (offer) => USER_PLANS.indexOf(offer) > USER_PLANS.indexOf(plan),
  );
  for (const candidate of above) {
    const ceiling = PLAN_LIMITS[candidate][PLAN_COUNT_LIMIT_KEY[resource]];
    if (ceiling === null) return `${PLAN_WITH_ARTICLE[candidate]} não tem limite.`;
    if (ceiling > limit)
      return `${PLAN_WITH_ARTICLE[candidate]} libera ${freedText(resource, ceiling)}.`;
  }
  return null;
}

function freedText(resource: PlanCountResource, ceiling: number): string {
  return resource === 'storage' ? byteSizeText(ceiling) : String(ceiling);
}
