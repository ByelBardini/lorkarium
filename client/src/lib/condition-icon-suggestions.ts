import { CONDITION_ICONS, type ConditionIconDto } from '@lorkarium/contracts';
import { conditionKey } from './condition-names';

type IconSuggestion = Readonly<{ name: string; keys: readonly string[] }>;

const CURATED: readonly (readonly [string, string])[] = [
  [
    'Imobilizado',
    'game-icons:manacles game-icons:imprisoned game-icons:wolf-trap game-icons:nailed-foot game-icons:handcuffed game-icons:crossed-chains game-icons:spider-web game-icons:root-tip tabler:lock-square-rounded ph:lock-key mdi:handcuffs lucide:lock-keyhole',
  ],
  [
    'Agarrado',
    'game-icons:grab game-icons:hand-grip game-icons:grapple game-icons:tentacle-strike game-icons:grasping-claws game-icons:arm-bandage game-icons:fist lucide:hand-grab tabler:hand-grab ph:hand-grabbing ph:hand-fist mdi:hand-back-left',
  ],
  [
    'Caído',
    'game-icons:falling game-icons:fall-down game-icons:heavy-fall game-icons:knockout game-icons:foot-trip tabler:fall ph:person-simple-tai-chi lucide:arrow-big-down-dash arrow-down-to-line tabler:arrow-bar-to-down mdi:human-handsdown',
  ],
  [
    'Cambaleante',
    'game-icons:knocked-out-stars game-icons:magic-swirl game-icons:star-swirl game-icons:sensuousness game-icons:stoned-skull game-icons:spiral-arrow tabler:mood-sad-dizzy tabler:spiral ph:spiral lucide:orbit lucide:loader-pinwheel mdi:head-dots-horizontal',
  ],
  [
    'Desestabilizado',
    'game-icons:unbalanced game-icons:body-balance game-icons:tripwire game-icons:foot-trip mdi:scale-unbalanced tabler:scale ph:scales lucide:scale lucide:triangle-dashed lucide:waves mdi:human-handsup',
  ],
  [
    'Exposto',
    'game-icons:human-target game-icons:targeted game-icons:broken-shield game-icons:cracked-shield game-icons:achilles-heel game-icons:armor-downgrade game-icons:bullseye lucide:shield-off lucide:target tabler:shield-off tabler:target-arrow ph:crosshair mdi:shield-off-outline',
  ],
  [
    'Sangrando',
    'game-icons:bleeding-wound game-icons:drop game-icons:blood game-icons:dripping-blade game-icons:bleeding-heart lucide:droplets tabler:droplet-half-2 ph:drop mdi:water-alert',
  ],
  [
    'Queimando',
    'game-icons:burning-embers game-icons:flame game-icons:fire game-icons:burning-dot lucide:flame-kindling tabler:flame ph:fire mdi:fire-alert',
  ],
  [
    'Congelado',
    'game-icons:frozen-body game-icons:frozen-block game-icons:ice-cube game-icons:snowflake-2 game-icons:frozen-orb snowflake lucide:thermometer-snowflake tabler:snowflake ph:snowflake mdi:snowflake-alert',
  ],
  [
    'Eletrificado',
    'game-icons:electric game-icons:lightning-trio game-icons:focused-lightning game-icons:bolt-eye zap lucide:cable tabler:bolt ph:lightning mdi:flash-alert',
  ],
  [
    'Corroído',
    'game-icons:acid game-icons:acid-blob game-icons:dripping-goo game-icons:slime lucide:test-tube-diagonal tabler:flask-2 ph:drop-half mdi:flask-outline',
  ],
  [
    'Envenenado',
    'game-icons:poison-bottle game-icons:poison-gas game-icons:poison game-icons:snake-bite game-icons:death-juice flask-conical skull tabler:skull ph:skull mdi:bottle-tonic-skull',
  ],
  [
    'Doente',
    'game-icons:vomiting game-icons:virus game-icons:medical-thermometer lucide:thermometer lucide:bug tabler:virus tabler:mood-sick ph:virus mdi:emoticon-sick-outline',
  ],
  [
    'Sufocando',
    'game-icons:drowning game-icons:bubbles game-icons:hanging-sign game-icons:poison-cloud wind lucide:circle-gauge tabler:lungs ph:wind mdi:weather-hazy',
  ],
  [
    'Lento',
    'game-icons:snail game-icons:turtle game-icons:slow-blob game-icons:sands-of-time lucide:snail lucide:turtle tabler:hourglass-low ph:hourglass-medium mdi:speedometer-slow',
  ],
  [
    'Acelerado',
    'game-icons:run game-icons:sprint game-icons:fast-arrow game-icons:winged-leg lucide:fast-forward lucide:rabbit tabler:run tabler:run-sprint ph:person-simple-run mdi:run-fast',
  ],
  [
    'Enredado',
    'game-icons:spider-web game-icons:cobweb game-icons:fishing-net game-icons:vine-whip game-icons:root-tip game-icons:wavy-chains lucide:sprout tabler:plant-2 ph:plant mdi:spider-web',
  ],
  [
    'Voando',
    'game-icons:feathered-wing game-icons:angel-wings game-icons:fluffy-wing game-icons:wing-cloak lucide:feather lucide:bird tabler:feather ph:feather mdi:feather',
  ],
  [
    'Levitando',
    'game-icons:floating-platforms game-icons:floating-crystal game-icons:ascending-block lucide:cloud-upload lucide:arrow-up-from-dot tabler:arrow-bar-up ph:cloud mdi:balloon',
  ],
  [
    'Confuso',
    'game-icons:brain-tentacle game-icons:ink-swirl game-icons:spiral-bloom lucide:circle-question-mark lucide:shuffle tabler:mood-confused tabler:question-mark ph:question mdi:head-question-outline',
  ],
  [
    'Enfeitiçado',
    'game-icons:charm game-icons:heart-wings game-icons:love-mystery game-icons:magic-swirl lucide:heart-handshake lucide:wand-sparkles tabler:heart-spark ph:heart mdi:heart-flash',
  ],
  [
    'Dominado',
    'game-icons:puppet game-icons:overmind game-icons:hive-mind game-icons:voodoo-doll game-icons:crowned-skull lucide:brain-circuit lucide:crown ph:brain mdi:account-cog',
  ],
  [
    'Amedrontado',
    'game-icons:screaming game-icons:terror game-icons:shouting angry ghost tabler:mood-wrrr ph:smiley-x-eyes mdi:emoticon-cry-outline',
  ],
  [
    'Enfurecido',
    'game-icons:enrage game-icons:screaming game-icons:bull-horns game-icons:angry-eyes angry tabler:mood-angry ph:smiley-angry mdi:emoticon-angry-outline',
  ],
  [
    'Inspirado',
    'game-icons:inspiration game-icons:musical-notes game-icons:music-spell game-icons:sun-priest lucide:music lucide:lightbulb tabler:music tabler:bulb ph:music-notes mdi:lightbulb-on-outline',
  ],
  [
    'Provocado',
    'game-icons:shouting game-icons:pointing game-icons:targeted game-icons:eye-target lucide:megaphone crosshair tabler:speakerphone ph:megaphone mdi:bullhorn-outline',
  ],
  [
    'Concentrando',
    'game-icons:meditation game-icons:concentration-orb game-icons:third-eye lucide:focus brain tabler:focus-2 ph:user-focus mdi:meditation',
  ],
  [
    'Cego',
    'game-icons:blindfold game-icons:eyelashes game-icons:bleeding-eye game-icons:eye-of-horus eye-off lucide:eye-closed tabler:eye-off ph:eye-slash mdi:eye-off-outline',
  ],
  [
    'Surdo',
    'game-icons:hearing-disabled ear-off tabler:ear-off tabler:deaf ph:ear-slash mdi:ear-hearing-off',
  ],
  [
    'Silenciado',
    'game-icons:silenced game-icons:silence game-icons:mute game-icons:lips lucide:mic-off lucide:message-square-off tabler:message-off ph:speaker-simple-slash mdi:microphone-off',
  ],
  [
    'Oculto',
    'game-icons:hood game-icons:hooded-assassin game-icons:hidden game-icons:invisible game-icons:domino-mask lucide:venetian-mask eye-off tabler:spy ph:detective mdi:incognito',
  ],
  [
    'Exausto',
    'game-icons:tired-eye game-icons:sleepy game-icons:battery-25 game-icons:back-pain lucide:battery-low lucide:battery-warning tabler:battery-1 ph:battery-low mdi:battery-alert-variant-outline',
  ],
  [
    'Enfraquecido',
    'game-icons:biceps game-icons:broken-bone game-icons:health-decrease game-icons:half-heart lucide:biceps-flexed lucide:heart-crack tabler:heart-broken ph:heart-break mdi:arm-flex-outline',
  ],
  [
    'Dormindo',
    'game-icons:night-sleep game-icons:sleepy game-icons:sleeping-bag moon lucide:bed tabler:zzz ph:moon-stars mdi:sleep',
  ],
  [
    'Inconsciente',
    'game-icons:knockout game-icons:knocked-out-stars game-icons:dead-head lucide:moon-star lucide:circle-off tabler:zzz-off ph:smiley-x-eyes mdi:emoticon-dead-outline',
  ],
  [
    'Petrificado',
    'game-icons:stone-bust game-icons:stoned-skull game-icons:stone-block game-icons:medusa-head lucide:mountain lucide:gem tabler:mountain ph:cube',
  ],
  [
    'Morrendo',
    'game-icons:heart-beats game-icons:dead-head game-icons:death-skull game-icons:grave-flowers lucide:heart-pulse skull tabler:heartbeat ph:heartbeat mdi:heart-pulse',
  ],
  [
    'Estabilizado',
    'game-icons:health-normal game-icons:heart-plus game-icons:medical-pack lucide:heart-plus lucide:shield-plus tabler:heart-plus ph:first-aid-kit mdi:medical-bag',
  ],
  [
    'Regenerando',
    'game-icons:regeneration game-icons:healing game-icons:health-increase game-icons:sprout lucide:refresh-ccw-dot lucide:sprout tabler:heart-rate-monitor ph:plant mdi:heart-plus-outline',
  ],
  [
    'Aumentado',
    'game-icons:growth game-icons:giant lucide:maximize-2 lucide:arrow-up-wide-narrow tabler:arrows-maximize ph:arrows-out mdi:arrow-expand-all',
  ],
  ['Encolhido', 'lucide:minimize-2 tabler:arrows-minimize ph:arrows-in mdi:arrow-collapse-all'],
  [
    'Abençoado',
    'game-icons:angel-outfit game-icons:spiked-halo game-icons:holy-symbol game-icons:prayer game-icons:sun-priest sparkles sun tabler:sparkles ph:hands-praying mdi:hands-pray',
  ],
  [
    'Amaldiçoado',
    'game-icons:cursed-star game-icons:voodoo-doll game-icons:evil-moon game-icons:death-zone skull moon tabler:pentagram ph:star-of-david mdi:emoticon-devil-outline',
  ],
  [
    'Protegido',
    'game-icons:shield-reflect game-icons:magic-shield game-icons:bordered-shield game-icons:aura lucide:shield-check lucide:shield-plus tabler:shield-check ph:shield-check mdi:shield-check-outline',
  ],
  [
    'Resistente',
    'game-icons:armor-upgrade game-icons:shield-echoes game-icons:bolt-shield game-icons:fire-shield lucide:shield-half lucide:shield-ellipsis tabler:shield-half ph:shield-chevron mdi:shield-half-full',
  ],
  [
    'Vulnerável',
    'game-icons:broken-shield game-icons:cracked-shield game-icons:achilles-heel game-icons:armor-downgrade lucide:shield-alert lucide:shield-x tabler:shield-x ph:shield-warning mdi:shield-alert-outline',
  ],
  [
    'Marcado',
    'game-icons:targeted game-icons:on-target game-icons:position-marker game-icons:eye-target lucide:bookmark lucide:map-pin tabler:target ph:target mdi:target-account',
  ],
  [
    'Etéreo',
    'game-icons:ghost game-icons:spectre game-icons:floating-ghost game-icons:ghost-ally ghost tabler:ghost-2 ph:ghost mdi:ghost-outline',
  ],
  [
    'Transformado',
    'game-icons:werewolf game-icons:frog game-icons:transform game-icons:wolf-howl lucide:paw-print lucide:rabbit tabler:paw ph:paw-print mdi:paw',
  ],
  [
    'Paralisado',
    'game-icons:mantrap game-icons:frozen-body game-icons:static game-icons:electric lucide:circle-pause lucide:octagon-pause tabler:player-pause ph:pause-circle mdi:pause-octagon-outline',
  ],
  [
    'Atordoado',
    'game-icons:knocked-out-stars game-icons:stun-grenade game-icons:star-swirl sparkles zap tabler:stars ph:shooting-star mdi:star-shooting-outline',
  ],
];

/** The curated icons of common conditions, the most legible first. A Lucide icon among the 28 of
 *  before keeps its unprefixed key (`skull`, not `lucide:skull`): one key per drawing.
 *
 *  Example: `CONDITION_ICON_SUGGESTIONS[0].keys[0] // 'game-icons:manacles'` */
export const CONDITION_ICON_SUGGESTIONS: readonly IconSuggestion[] = CURATED.map(
  ([name, keys]) => ({
    name,
    keys: keys.split(' '),
  }),
);

const NOTHING: readonly ConditionIconDto[] = [];
const ACCEPTED: ReadonlySet<string> = new Set(CONDITION_ICONS);
// The generator reads the raw keys to build the contract list; the picker only gets accepted ones
// (the spec proves none is left out).
const isAccepted = (key: string): key is ConditionIconDto => ACCEPTED.has(key);
const KEYED = CONDITION_ICON_SUGGESTIONS.map((suggestion) => ({
  key: conditionKey(suggestion.name),
  keys: suggestion.keys.filter(isAccepted),
}));

/** The curated icons for a condition name, typed any way: the exact name first, else the first
 *  condition it begins; nothing when blank or unknown.
 *
 *  Example: `suggestedIconsFor('caido')[0] // 'game-icons:falling'` */
export function suggestedIconsFor(name: string): readonly ConditionIconDto[] {
  const wanted = conditionKey(name);
  if (wanted === '') return NOTHING;
  const exact = KEYED.find((entry) => entry.key === wanted);
  if (exact) return exact.keys;
  return KEYED.find((entry) => entry.key.startsWith(wanted))?.keys ?? NOTHING;
}
