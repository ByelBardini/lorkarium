import { SETTINGS_SECTIONS } from './settings-sections';

const SECTION_LIST = Object.values(SETTINGS_SECTIONS);

// Room above a section once jumped to, so its title does not touch the top edge (24px = `pt-6`).
const SECTION_TOP_GAP = 24;

const LINK_CLASS =
  'shrink-0 rounded-sm px-2 py-1.5 text-left text-[13px] font-semibold whitespace-nowrap text-muted-foreground outline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none';

/** The side menu of the settings page (a row on top below `md`): jumps to a section of the one
 *  form, scrolling to it and moving the focus there.
 *
 *  Example: `<SettingsSectionNav />` */
export function SettingsSectionNav(): React.JSX.Element {
  return (
    <nav
      aria-label="Seções das configurações"
      className="sticky top-0 z-10 -mx-4 flex gap-1 overflow-x-auto border-b border-border bg-background px-4 py-2 sm:-mx-8 sm:px-8 md:top-6 md:mx-0 md:flex-col md:self-start md:overflow-visible md:border-0 md:p-0"
    >
      {SECTION_LIST.map((section) => (
        <button
          key={section.id}
          type="button"
          className={LINK_CLASS}
          onClick={() => jumpTo(section.id)}
        >
          {'menuTitle' in section ? section.menuTitle : section.title}
        </button>
      ))}
    </nav>
  );
}

// Buttons, not `#hash` links: one form with one bar, so the URL stays the page's and the
// router never sees a hash-only navigation.
function jumpTo(sectionId: string): void {
  const section = document.getElementById(sectionId);
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
