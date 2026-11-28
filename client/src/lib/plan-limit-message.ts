import {
  PLAN_COUNT_LIMIT_KEY,
  PLAN_FAIR_USE_RESOURCES,
  PLAN_LIMITS,
  USER_PLANS,
  type PlanCountResource,
  type PlanFeatureResource,
  type PlanLimitDto,
  type PlanLimitHolder,
  type PlanLimits,
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
const PLANS_ON_OFFER = ['narrador', 'lenda'] as const satisfies readonly UserPlan[];

const IN_PLAN: Readonly<Record<(typeof PLANS_ON_OFFER)[number], string>> = {
  narrador: 'no plano Narrador',
  lenda: 'no plano Lenda',
};

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
  savedTokens: countLabel(
    'token salvo por pessoa',
    'tokens salvos por pessoa',
    'Salvar token está',
  ),
  savedTokenFolders: countLabel(
    'pasta de tokens salvos por pessoa',
    'pastas de tokens salvos por pessoa',
    'Pasta de tokens salvos está',
  ),
  roundCycles: countLabel('ciclo de rodada', 'ciclos de rodada', 'Ciclo de rodada está'),
  roundCyclePhases: countLabel('fase por ciclo', 'fases por ciclo', 'Ciclo de rodada está'),
  customEmojis: countLabel(
    'emoji personalizado',
    'emojis personalizados',
    'Emoji personalizado está',
    'account',
  ),
};

/** The pt-BR name of every feature a plan may lack, as the subject of "está no plano Narrador". */
export const PLAN_FEATURE_LABEL: Readonly<Record<PlanFeatureResource, string>> = {
  sceneCopy: 'Duplicar grid está',
  conditionImage: 'Condição com imagem própria está',
  auraKind: 'Aura com efeito ou imagem está',
  desktopWindows: 'As janelas de Chat e Imagens estão',
  customColor: 'Cor personalizada está',
  diceTexture: 'Textura própria do dado está',
  animatedAvatar: 'Foto de perfil animada está',
  profileBanner: 'Banner de perfil está',
  campaignArt: 'Capa e banner próprios da mesa estão',
  animatedCampaignArt: 'Imagens animadas da mesa estão',
  privateCampaign: 'Mesa privada está',
  sheetScripts: 'Scripts no modelo de ficha estão',
  magicSight: 'Visão mágica está',
  roundCyclePhaseImage: 'Imagem própria na fase do ciclo está',
};

// The features, by what frees them in the grid. The other account customizations (texture,
// animated photo; custom color, also of the account) are freed by the Apoiador, outside this grid;
// the banner of the profile is in it, Lenda only.
const FEATURE_IN_GRID: Readonly<
  Partial<Record<PlanFeatureResource, (limits: PlanLimits) => boolean>>
> = {
  sceneCopy: (limits) => limits.sceneCopy,
  conditionImage: (limits) => limits.conditionImage,
  auraKind: (limits) => limits.auraKinds.includes('effect'),
  desktopWindows: (limits) => limits.desktopWindows,
  campaignArt: (limits) => limits.campaignArt,
  animatedCampaignArt: (limits) => limits.animatedCampaignArt,
  privateCampaign: (limits) => limits.privateCampaign,
  sheetScripts: (limits) => limits.sheetScripts,
  profileBanner: (limits) => limits.profileBanner,
  magicSight: (limits) => limits.magicSight,
  roundCyclePhaseImage: (limits) => limits.roundCyclePhaseImage,
};

/** How an item kept past the ceiling is named: `item` opens the sentence, `free` says what stays
 *  free on it (none: only deleting), `release` how to unlock it. */
type ReadOnlyLabel = Readonly<{ item: string; free: string | null; release: string }>;

/** What the server locks as read only past the ceiling (`requireEditable`); the members, the
 *  storage, the folders of rolls and the NPC sheets only stop the creation. */
export type PlanReadOnlyResource = Extract<
  PlanCountResource,
  | 'scenes'
  | 'libraryMaps'
  | 'sheetTemplates'
  | 'documentTabs'
  | 'savedRolls'
  | 'savedTokens'
  | 'roundCycles'
  | 'tokenBars'
  | 'tokenForms'
  | 'lights'
  | 'patrols'
  | 'sightBlockers'
>;

const READ_ONLY_LABEL: Readonly<Record<PlanReadOnlyResource, ReadOnlyLabel>> = {
  scenes: readOnlyLabel('Este grid', null, 'Apague um grid mais antigo'),
  libraryMaps: readOnlyLabel(
    'Este mapa interativo',
    'mostrar, Principal e apagar seguem livres',
    'Apague um mapa mais antigo',
  ),
  sheetTemplates: readOnlyLabel(
    'Este modelo de ficha',
    'criar fichas com ele segue livre',
    'Apague um modelo mais antigo',
  ),
  documentTabs: readOnlyLabel(
    'Esta aba',
    'ocultar, reordenar e excluir seguem livres',
    'Apague uma aba mais antiga deste documento',
  ),
  savedRolls: readOnlyLabel(
    'Esta rolagem salva',
    'rolar, mover para pasta e excluir seguem livres',
    'Apague uma rolagem mais antiga',
  ),
  savedTokens: readOnlyLabel(
    'Este token salvo',
    'pôr no mapa, mover para pasta e excluir seguem livres',
    'Apague um token salvo mais antigo',
  ),
  roundCycles: readOnlyLabel(
    'Este ciclo',
    'virar no combate, escolher a próxima fase e apagar seguem livres',
    'Apague um ciclo mais antigo',
  ),
  // Bars and forms rank by their place on the token, not by age.
  tokenBars: readOnlyLabel(
    'Esta barra',
    'o valor muda; nome, máximo e cor não',
    'Apague uma barra acima dela',
  ),
  tokenForms: readOnlyLabel(
    'Esta forma',
    'trocar para ela segue livre; nome e imagem não',
    'Apague uma forma antes dela',
  ),
  // "Apagar" is turning a light off: removing one is "excluir".
  lights: readOnlyLabel('Esta luz', 'acender e apagar seguem livres', 'Exclua uma luz mais antiga'),
  patrols: readOnlyLabel(
    'Esta patrulha',
    'pause a patrulha para mudar a rota',
    'Pause uma patrulha mais antiga',
  ),
  sightBlockers: readOnlyLabel(
    'Este token que bloqueia a visão',
    'desligar o bloqueio segue livre',
    'Desligue um bloqueio mais antigo',
  ),
};

function readOnlyLabel(item: string, free: string | null, release: string): ReadOnlyLabel {
  return { item, free, release };
}

/** Where a table feature is, for the end of a sentence: "no Narrador", "na Lenda", or "nos planos
 *  pagos" when no plan on offer has it.
 *
 *  Example: `inPlanText((limits) => limits.desktopWindows) // 'no plano Lenda'` */
export function inPlanText(has: (limits: PlanLimits) => boolean): string {
  const plan = PLANS_ON_OFFER.find((offer) => has(PLAN_LIMITS[offer]));
  return plan === undefined ? 'nos planos pagos' : IN_PLAN[plan];
}

function countLabel(
  one: string,
  many: string,
  absent: string,
  scope: PlanCountLabel['scope'] = 'table',
): PlanCountLabel {
  return { one, many, absent: `${absent} nos planos pagos.`, scope };
}

/** The pt-BR sentence of a refusal for passing the plan: the ceiling and the plan that frees
 *  more (of the person's own plan when `holder` is `account`); a feature (the cheapest plan that has it) or a ceiling of 0 the plan lacks; Lenda's fair
 *  use, with no plan above; an item kept past the ceiling (`reason: 'readOnly'`) is read only.
 *
 *  Example: `planLimitMessage({ resource: 'scenes', limit: 3, plan: 'free' }) // 'Esta mesa usa o plano Grátis, que permite até 3 grids. O Narrador libera 15.'` */
export function planLimitMessage(planLimit: PlanLimitDto): string {
  const { resource, limit, plan } = planLimit;
  if (!isCountResource(resource)) return featureRefusalText(resource);
  if (planLimit.reason === 'readOnly' && isReadOnlyResource(resource)) {
    return readOnlyText(READ_ONLY_LABEL[resource], limit, plan);
  }
  if (limit === 0) return PLAN_COUNT_LABEL[resource].absent;
  if (PLAN_FAIR_USE_RESOURCES[plan].includes(resource)) {
    return `Esta mesa chegou ao limite de uso justo (${amountText(resource, limit)}).`;
  }
  const ceiling = ceilingText(resource, limit, plan, planLimit.holder);
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

/** The refusal of a feature the plan lacks: "Duplicar grid está no plano Narrador.", "Textura
 *  própria do dado está nos planos pagos." (an account customization the Apoiador frees).
 *
 *  Example: `featureRefusalText('desktopWindows') // 'As janelas de Chat e Imagens estão no plano Lenda.'` */
export function featureRefusalText(resource: PlanFeatureResource): string {
  const has = FEATURE_IN_GRID[resource];
  const where = has === undefined ? 'nos planos pagos' : inPlanText(has);
  return `${PLAN_FEATURE_LABEL[resource]} ${where}.`;
}

function readOnlyText(label: ReadOnlyLabel, limit: number, plan: UserPlan): string {
  const state = label.free === null ? 'está só leitura' : `está só leitura: ${label.free}`;
  return `${label.item} passou do limite do plano ${PLAN_NAMES[plan]} (${limit}) e ${state}. ${label.release} ou suba de plano.`;
}

function isReadOnlyResource(resource: PlanCountResource): resource is PlanReadOnlyResource {
  return Object.hasOwn(READ_ONLY_LABEL, resource);
}

function isCountResource(resource: PlanLimitResource): resource is PlanCountResource {
  return Object.hasOwn(PLAN_COUNT_LIMIT_KEY, resource);
}

function ceilingText(
  resource: PlanCountResource,
  limit: number,
  plan: UserPlan,
  holder: PlanLimitHolder | undefined,
): string {
  const amount = amountText(resource, limit);
  if (holder === 'account' || PLAN_COUNT_LABEL[resource].scope === 'account') {
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
