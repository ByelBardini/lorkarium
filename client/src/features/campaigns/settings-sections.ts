/** The sections of the settings page, in order: the id of each `section`, its title and, when
 *  the title is too long for the side menu, the shorter `menuTitle` the menu shows. */
export const SETTINGS_SECTIONS = {
  general: { id: 'settings-general', title: 'Geral' },
  images: { id: 'settings-images', title: 'Imagens' },
  content: { id: 'settings-content', title: 'Conteúdo' },
  access: { id: 'settings-access', title: 'Acesso' },
  players: { id: 'settings-players', title: 'Permissões dos jogadores', menuTitle: 'Permissões' },
  danger: { id: 'settings-danger', title: 'Zona de perigo' },
} as const;

export type SettingsSectionKey = keyof typeof SETTINGS_SECTIONS;
