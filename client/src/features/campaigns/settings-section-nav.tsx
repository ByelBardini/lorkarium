import { useEffect, useId, useState } from 'react';
import { memberCountLabel } from '@/lib/campaign-meta';
import { cn } from '@/lib/utils';
import { jumpToSettingsSection, SECTION_TOP_GAP } from './settings-section-jump';
import { sectionSummaryOf } from './settings-section-summary';
import { SETTINGS_SECTIONS, type SettingsSectionKey } from './settings-sections';
import type { SettingsValues } from './use-campaign-settings-draft';

const SECTION_KEYS = Object.keys(SETTINGS_SECTIONS) as readonly SettingsSectionKey[];

const CREATED_AT_FORMAT = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export type SettingsSectionNavProps = Readonly<{
  /** "Zona de perigo" is on the page (owner powers only). */
  withDanger: boolean;
  /** The draft: each item says the state of its section. */
  values: SettingsValues;
  createdAt: string;
  memberCount: number;
}>;

/** The side menu of the settings page (a row on top below `md`): each item names a section of
 *  the one form, is described by its state ("Pública · sem senha") and jumps there, scrolling the
 *  page and moving the focus. The section in view is marked. At the foot, when the table was
 *  created and how many are in it.
 *
 *  Example: `<SettingsSectionNav withDanger values={draft.values} createdAt={c.createdAt} memberCount={c.memberCount} />` */
export function SettingsSectionNav(props: SettingsSectionNavProps): React.JSX.Element {
  const keys = sectionKeysOf(props.withDanger);
  const [active, setActive] = useActiveSection(props.withDanger);
  return (
    <nav
      aria-label="Seções das configurações"
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-divider bg-panel px-3 py-2 md:w-56 md:flex-col md:gap-0.5 md:overflow-y-auto md:border-r md:border-b-0 md:px-2.5 md:py-4 xl:w-60"
    >
      {keys.map((key) => (
        <SectionLink
          key={key}
          section={key}
          summary={sectionSummaryOf(key, props.values)}
          current={active === key}
          onJump={() => {
            setActive(key);
            jumpToSettingsSection(key);
          }}
        />
      ))}
      <TableFacts createdAt={props.createdAt} memberCount={props.memberCount} />
    </nav>
  );
}

type SectionLinkProps = Readonly<{
  section: SettingsSectionKey;
  summary: string;
  current: boolean;
  onJump: () => void;
}>;

function SectionLink({ section, summary, current, onJump }: SectionLinkProps): React.JSX.Element {
  const summaryId = useId();
  const entry: Readonly<{ title: string; menuTitle?: string }> = SETTINGS_SECTIONS[section];
  const title = entry.menuTitle ?? entry.title;
  return (
    <button
      type="button"
      aria-label={title}
      aria-describedby={summaryId}
      aria-current={current ? 'location' : undefined}
      onClick={onJump}
      className={cn(
        'flex shrink-0 flex-col gap-0.5 rounded-md px-3 py-2 text-left text-muted-foreground outline-offset-2 transition-colors hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none md:w-full',
        current && 'bg-card text-foreground md:shadow-[inset_2px_0_0_var(--color-primary)]',
      )}
    >
      <span
        className={cn(
          'text-sm font-semibold whitespace-nowrap',
          section === 'danger' && 'text-destructive-text',
        )}
      >
        {title}
      </span>
      <span id={summaryId} className="hidden truncate text-xs text-placeholder md:block">
        {summary}
      </span>
    </button>
  );
}

type TableFactsProps = Readonly<{ createdAt: string; memberCount: number }>;

function TableFacts({ createdAt, memberCount }: TableFactsProps): React.JSX.Element {
  return (
    <div className="mt-auto hidden flex-col gap-1 rounded-md border border-divider bg-card px-3 py-2.5 md:flex">
      <span className="text-[11px] font-semibold tracking-[0.12em] text-placeholder uppercase">
        Mesa
      </span>
      <span className="text-xs text-muted-foreground">
        Criada em {CREATED_AT_FORMAT.format(new Date(createdAt))}
      </span>
      <span className="text-xs text-muted-foreground">{memberCountLabel(memberCount)}</span>
    </div>
  );
}

// The section whose top crossed the top of the page scroller, refreshed as it scrolls.
function useActiveSection(
  withDanger: boolean,
): [SettingsSectionKey, (key: SettingsSectionKey) => void] {
  const [active, setActive] = useState<SettingsSectionKey>('general');
  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>('[data-settings-scroller]');
    if (!scroller) return;
    const sync = (): void => setActive(sectionInView(scroller, sectionKeysOf(withDanger)));
    scroller.addEventListener('scroll', sync, { passive: true });
    return () => scroller.removeEventListener('scroll', sync);
  }, [withDanger]);
  return [active, setActive];
}

function sectionKeysOf(withDanger: boolean): readonly SettingsSectionKey[] {
  return withDanger ? SECTION_KEYS : SECTION_KEYS.filter((key) => key !== 'danger');
}

function sectionInView(
  scroller: HTMLElement,
  keys: readonly SettingsSectionKey[],
): SettingsSectionKey {
  const line = scroller.getBoundingClientRect().top + SECTION_TOP_GAP * 4;
  let inView: SettingsSectionKey = 'general';
  for (const key of keys) {
    const section = document.getElementById(SETTINGS_SECTIONS[key].id);
    if (section && section.getBoundingClientRect().top <= line) inView = key;
  }
  return inView;
}
