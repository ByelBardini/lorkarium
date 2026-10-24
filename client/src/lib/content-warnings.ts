import { contentWarningDto, type ContentWarningDto } from '@lorkarium/contracts';

/** The warnings in the order a form offers them (the contract's order). */
export const CONTENT_WARNINGS: readonly ContentWarningDto[] = contentWarningDto.options;

export const CONTENT_WARNING_LABEL: Readonly<Record<ContentWarningDto, string>> = {
  adult: '+18',
  violence: 'Violência',
  horror: 'Terror',
  gore: 'Gore',
  'strong-language': 'Linguagem forte',
  'sensitive-themes': 'Temas sensíveis',
};

/** Tags offered under the tag field; free tags are still allowed. */
export const TAG_SUGGESTIONS: readonly string[] = [
  'Investigação',
  'Masmorra',
  'Exploração',
  'Roleplay',
  'Combate tático',
  'Iniciantes bem-vindos',
  'Campanha longa',
  'One-shot',
  'Sandbox',
];

/** The warnings in the form's order, whatever order they were chosen in.
 *
 *  Example: `sortedContentWarnings(['gore', 'adult']) // ['adult', 'gore']` */
export function sortedContentWarnings(warnings: readonly ContentWarningDto[]): ContentWarningDto[] {
  return CONTENT_WARNINGS.filter((warning) => warnings.includes(warning));
}

/** Turns one warning on or off, keeping the form's order.
 *
 *  Example: `toggleContentWarning(['gore'], 'adult') // ['adult', 'gore']` */
export function toggleContentWarning(
  warnings: readonly ContentWarningDto[],
  warning: ContentWarningDto,
): ContentWarningDto[] {
  const next = warnings.includes(warning)
    ? warnings.filter((chosen) => chosen !== warning)
    : [...warnings, warning];
  return sortedContentWarnings(next);
}
