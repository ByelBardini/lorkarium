import { SETTINGS_SECTIONS, type SettingsSectionKey } from './settings-sections';

/** Room above a section once jumped to, so its title does not touch the top edge. */
export const SECTION_TOP_GAP = 16;

/** Scrolls the settings page to a section and moves the focus there. Buttons call it, not
 *  `#hash` links: one form with one save, so the URL stays the page's and the router never sees a
 *  hash-only navigation.
 *
 *  Example: `<button onClick={() => jumpToSettingsSection('images')}>Capa com imagem</button>` */
export function jumpToSettingsSection(key: SettingsSectionKey): void {
  const section = document.getElementById(SETTINGS_SECTIONS[key].id);
  if (!section) return;
  scrollPageTo(section);
  section.focus({ preventScroll: true });
}

// Only the page's own scroller moves: `scrollIntoView` also scrolls every clipped ancestor, and
// the room under the page is one, which pushed the header and the menu off the screen.
function scrollPageTo(section: HTMLElement): void {
  const scroller = section.closest<HTMLElement>('[data-settings-scroller]');
  if (!scroller) return;
  const offset = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  scroller.scrollTo?.({ top: scroller.scrollTop + offset - SECTION_TOP_GAP, behavior: 'smooth' });
}
