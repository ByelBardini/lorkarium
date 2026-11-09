import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { LibraryMapsApi } from '@/services/library-maps-api';
import { mapRegionFailureMessage } from './map-messages';

export type MapRegionShowButtonProps = Readonly<{
  api: Pick<LibraryMapsApi, 'showRegion'>;
  campaignId: string;
  mapId: string;
  regionId: string;
}>;

/** The master's "Mostrar a todos" on a region's card: whoever is in the room is taken there. The
 *  server decides whether everyone may see it, so a hidden region is refused there and not here.
 *
 *  Example: `<MapRegionShowButton api={api} campaignId={id} mapId={map.id} regionId={region.id} />` */
export function MapRegionShowButton(props: MapRegionShowButtonProps): React.JSX.Element {
  const { sending, problem, send } = useRegionShow(props);
  return (
    <>
      {problem && (
        <p role="alert" className="w-full text-destructive-text">
          {problem}
        </p>
      )}
      <Button size="sm" variant="outline" disabled={sending} onClick={send}>
        Mostrar a todos
      </Button>
    </>
  );
}

type RegionShow = Readonly<{ sending: boolean; problem: string | null; send: () => void }>;

function useRegionShow(props: MapRegionShowButtonProps): RegionShow {
  const { api, campaignId, mapId, regionId } = props;
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const send = async (): Promise<void> => {
    setSending(true);
    setProblem(null);
    const answer = await api.showRegion(campaignId, mapId, regionId);
    setSending(false);
    if (!answer.ok) setProblem(mapRegionFailureMessage(answer.failure.kind));
  };
  return { sending, problem, send: () => void send() };
}
