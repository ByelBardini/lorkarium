import type { ConditionIconDto } from '@lorkarium/contracts';
import {
  AnchorIcon,
  AngryIcon,
  ArrowDownToLineIcon,
  BiohazardIcon,
  BrainIcon,
  CircleDotIcon,
  CrosshairIcon,
  DropletIcon,
  EarOffIcon,
  EyeOffIcon,
  FlameIcon,
  FlaskConicalIcon,
  FootprintsIcon,
  GhostIcon,
  HandIcon,
  HeartIcon,
  HourglassIcon,
  LinkIcon,
  LockIcon,
  MoonIcon,
  ShieldIcon,
  SkullIcon,
  SnowflakeIcon,
  SparklesIcon,
  SunIcon,
  SwordsIcon,
  WindIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { spacedPathData } from './svg-path-tokens';

type ConditionIconEntry = Readonly<{ glyph: LucideIcon; label: string }>;

/** Each contract icon key with its glyph and its name in pt-BR (the accessible name of a tile). */
export const CONDITION_ICON_ENTRIES: Readonly<Record<ConditionIconDto, ConditionIconEntry>> = {
  'circle-dot': { glyph: CircleDotIcon, label: 'Marca' },
  skull: { glyph: SkullIcon, label: 'Caveira' },
  'eye-off': { glyph: EyeOffIcon, label: 'Olho riscado' },
  'flask-conical': { glyph: FlaskConicalIcon, label: 'Frasco' },
  ghost: { glyph: GhostIcon, label: 'Fantasma' },
  shield: { glyph: ShieldIcon, label: 'Escudo' },
  sparkles: { glyph: SparklesIcon, label: 'Brilho' },
  link: { glyph: LinkIcon, label: 'Corrente' },
  zap: { glyph: ZapIcon, label: 'Raio' },
  flame: { glyph: FlameIcon, label: 'Chama' },
  snowflake: { glyph: SnowflakeIcon, label: 'Floco de neve' },
  moon: { glyph: MoonIcon, label: 'Lua' },
  crosshair: { glyph: CrosshairIcon, label: 'Mira' },
  'arrow-down-to-line': { glyph: ArrowDownToLineIcon, label: 'Seta ao chão' },
  hand: { glyph: HandIcon, label: 'Mão' },
  heart: { glyph: HeartIcon, label: 'Coração' },
  droplet: { glyph: DropletIcon, label: 'Gota' },
  brain: { glyph: BrainIcon, label: 'Cérebro' },
  footprints: { glyph: FootprintsIcon, label: 'Pegadas' },
  lock: { glyph: LockIcon, label: 'Cadeado' },
  'ear-off': { glyph: EarOffIcon, label: 'Ouvido riscado' },
  angry: { glyph: AngryIcon, label: 'Rosto bravo' },
  swords: { glyph: SwordsIcon, label: 'Espadas' },
  wind: { glyph: WindIcon, label: 'Vento' },
  sun: { glyph: SunIcon, label: 'Sol' },
  biohazard: { glyph: BiohazardIcon, label: 'Risco biológico' },
  hourglass: { glyph: HourglassIcon, label: 'Ampulheta' },
  anchor: { glyph: AnchorIcon, label: 'Âncora' },
};

const svgCache = new Map<string, string>();

/** The icon as SVG markup stroked in `color` (a CSS color), for the canvas: PixiJS draws SVG, not
 *  React. Cached per icon and color.
 *
 *  Example: `new GraphicsContext().svg(conditionIconSvg('skull', '#b5654f'))` */
export function conditionIconSvg(icon: ConditionIconDto, color: string): string {
  const key = `${icon}:${color}`;
  const cached = svgCache.get(key);
  if (cached) return cached;
  const glyph = CONDITION_ICON_ENTRIES[icon].glyph;
  const markup = renderToStaticMarkup(createElement(glyph, { color, strokeWidth: 2.5 })).replace(
    / d="([^"]*)"/g,
    (_, path: string) => ` d="${spacedPathData(path)}"`,
  );
  svgCache.set(key, markup);
  return markup;
}
