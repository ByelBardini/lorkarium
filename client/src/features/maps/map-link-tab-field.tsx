import type { DocumentTabSummaryDto, MapRegionLinkDto } from '@lorkarium/contracts';
import { useEffect, useId, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DocumentsApi } from '@/services/documents-api';

type OpenLink = Extract<NonNullable<MapRegionLinkDto>, { state: 'open' }>;

export type MapLinkTabFieldProps = Readonly<{
  campaignId: string;
  /** A link to a document, as the server confirmed it. */
  link: OpenLink;
  documents: Pick<DocumentsApi, 'detail'>;
  disabled?: boolean;
  /** The tab chosen; `null` = the document as a whole. */
  onChange: (tabId: string | null) => void;
}>;

type TabsRead = readonly DocumentTabSummaryDto[] | 'failed' | null;

// The Select refuses an empty value, and a tab id is always a uuid.
const WHOLE_DOCUMENT = 'whole-document';

/** "Abrir em": which tab of a linked document the place leads to.
 *
 *  Example: `<MapLinkTabField campaignId={c} link={link} documents={api} onChange={save} />` */
export function MapLinkTabField(props: MapLinkTabFieldProps): React.JSX.Element {
  const { link, disabled, onChange } = props;
  const labelId = useId();
  const read = useDocumentTabs(props);
  const tabs = read === null || read === 'failed' ? [] : read;
  // Until the list lands, the tab saved still has to read as the one chosen.
  const savedIsListed = tabs.some(({ id }) => id === link.tabId);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span id={labelId}>Abrir em</span>
      <Select
        value={link.tabId ?? WHOLE_DOCUMENT}
        disabled={disabled ?? false}
        onValueChange={(value) => onChange(value === WHOLE_DOCUMENT ? null : value)}
      >
        <SelectTrigger aria-labelledby={labelId} className="h-9 rounded-md px-2.5 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={WHOLE_DOCUMENT}>Documento inteiro</SelectItem>
          {link.tabId && !savedIsListed && (
            <SelectItem value={link.tabId}>{link.tabName}</SelectItem>
          )}
          {tabs.map((tab) => (
            <SelectItem key={tab.id} value={tab.id}>
              {tab.visibility === 'masters' ? `${tab.name} (só mestres)` : tab.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {read === 'failed' && (
        <span role="alert" className="text-destructive-text">
          Não deu para ler as abas deste documento.
        </span>
      )}
    </div>
  );
}

function useDocumentTabs({ campaignId, link, documents }: MapLinkTabFieldProps): TabsRead {
  const documentId = link.id;
  const [landed, setLanded] = useState<Readonly<{ documentId: string; read: TabsRead }> | null>(
    null,
  );
  useEffect(() => {
    let current = true;
    void documents.detail(campaignId, documentId).then((answer) => {
      if (current) setLanded({ documentId, read: answer.ok ? answer.value.tabs : 'failed' });
    });
    return () => {
      current = false;
    };
  }, [documents, campaignId, documentId]);
  // By document: swapping the linked item must not show the tabs of the previous one.
  return landed?.documentId === documentId ? landed.read : null;
}
