/** The sections of the settings page, in order: the id of each `section` and its title. */
export const SETTINGS_SECTIONS = {
  general: { id: 'settings-general', title: 'Geral' },
  content: { id: 'settings-content', title: 'Conteúdo' },
  access: { id: 'settings-access', title: 'Acesso' },
  danger: { id: 'settings-danger', title: 'Zona de perigo' },
} as const;
