import { CAMPAIGN_STATUS_LABEL } from '@/lib/campaign-status';
import type { SettingsSectionKey } from './settings-sections';
import type { SettingsValues } from './use-campaign-settings-draft';

const SUMMARY: Readonly<Record<SettingsSectionKey, (values: SettingsValues) => string>> = {
  general: (values) =>
    `${CAMPAIGN_STATUS_LABEL[values.status]} · ${values.system.trim() || 'sem sistema'}`,
  images: (values) => `${sentImageCount(values)} de 3 enviadas`,
  content: (values) =>
    `${countOf(values.contentWarnings.length, 'aviso', 'Sem avisos')} · ${countOf(values.tags.length, 'tag', 'sem tags')}`,
  access: (values) =>
    `${values.visibility === 'public' ? 'Pública' : 'Privada'} · ${values.requirePassword ? 'com senha' : 'sem senha'}`,
  players: playersSummary,
  danger: () => 'Excluir a mesa',
};

/** The line under each item of the settings menu: the state of that section, from the draft.
 *
 *  Example: `sectionSummaryOf('access', draft.values) // "Pública · sem senha"` */
export function sectionSummaryOf(section: SettingsSectionKey, values: SettingsValues): string {
  return SUMMARY[section](values);
}

function sentImageCount(values: SettingsValues): number {
  const sent = [
    values.photoAssetId !== null,
    values.cover.kind === 'image',
    values.bannerAssetId !== null,
  ];
  return sent.filter(Boolean).length;
}

function countOf(count: number, noun: string, none: string): string {
  if (count === 0) return none;
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function playersSummary(values: SettingsValues): string {
  if (!values.playersCreateTokens) return 'Só o mestre cria tokens';
  return values.playersDeleteTokens ? 'Jogadores criam e excluem tokens' : 'Jogadores criam tokens';
}
