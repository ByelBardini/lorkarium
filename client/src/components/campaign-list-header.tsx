import { SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';

export type CampaignListHeaderProps = Readonly<{
  /** The id the list's section is labelled by. */
  titleId: string;
  title: string;
  /** How many campaigns are showing after the search. */
  count: number;
  query: string;
  onQuery: (query: string) => void;
  searchLabel: string;
}>;

/** The head of a campaign list: the title, "N mesas" and the search box, over a hairline.
 *
 *  Example: `<CampaignListHeader titleId="mine" title="Suas mesas" count={3} query={q} onQuery={setQ} searchLabel="Buscar mesa" />` */
export function CampaignListHeader(props: CampaignListHeaderProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
      <div className="flex items-baseline gap-3">
        <h2 id={props.titleId} className="font-display text-[28px] font-semibold">
          {props.title}
        </h2>
        <span className="text-sm text-muted-foreground">{campaignCountLabel(props.count)}</span>
      </div>
      <div className="relative w-full sm:w-72">
        <SearchIcon
          aria-hidden="true"
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-placeholder"
        />
        <Input
          type="search"
          aria-label={props.searchLabel}
          placeholder="Buscar mesa…"
          value={props.query}
          onChange={(event) => props.onQuery(event.target.value)}
          className="h-10 pl-9 text-sm"
        />
      </div>
    </div>
  );
}

function campaignCountLabel(count: number): string {
  return count === 1 ? '1 mesa' : `${count} mesas`;
}
