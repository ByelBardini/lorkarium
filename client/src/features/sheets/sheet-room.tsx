import type { CampaignDetailDto, UpdateSheetRequestDto } from '@lorkarium/contracts';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { SheetsResult } from '@/services/sheets-api';
import { sheetCommandFailureMessage } from './sheet-messages';
import {
  SheetRoomContext,
  type SheetRoom,
  type SheetRoomActions,
  type SheetRoomServices,
} from './sheet-room-context';

type SayFailure = (message: string | null) => void;
type SheetUpdate = Omit<UpdateSheetRequestDto, 'actionId'>;

/** Gives the play room of `campaign` its sheet commands, and says their refusals itself (the
 *  menu that asked is already closed by then).
 *
 *  Example: `<SheetRoomProvider campaign={campaign} services={deps}><PlayRoomPage … /></SheetRoomProvider>` */
export function SheetRoomProvider({
  campaign,
  services,
  children,
}: Readonly<{
  campaign: CampaignDetailDto;
  services: SheetRoomServices;
  children: ReactNode;
}>): React.JSX.Element {
  const [failure, setFailure] = useState<string | null>(null);
  const room = useMemo<SheetRoom>(
    () => ({ ...services, campaign, actions: sheetActionsOf(campaign, services, setFailure) }),
    [campaign, services],
  );
  return (
    <SheetRoomContext value={room}>
      {children}
      {failure && <SheetFailureLine message={failure} onDismiss={() => setFailure(null)} />}
    </SheetRoomContext>
  );
}

function sheetActionsOf(
  campaign: CampaignDetailDto,
  services: SheetRoomServices,
  sayFailure: SayFailure,
): SheetRoomActions {
  const actionId = services.newActionId ?? (() => crypto.randomUUID());
  const api = services.sheetsApi;
  const open: SheetRoomActions['open'] = (sheet) =>
    void services.workspace
      .getState()
      .openSheet({ campaign, sheetId: sheet.id, sheetName: sheet.name });
  const answered = (action: string) => (result: SheetsResult<unknown>) =>
    !result.ok && sayFailure(sheetCommandFailureMessage(action, result.failure));
  const update = (sheetId: string, changes: SheetUpdate, action: string): void =>
    void api
      .update(campaign.id, sheetId, { actionId: actionId(), ...changes })
      .then(answered(action));
  return {
    open,
    create: (sheet) =>
      void api.create(campaign.id, { actionId: actionId(), ...sheet }).then((result) => {
        if (result.ok) open(result.value.sheet);
        else answered('Criar')(result);
      }),
    setVisibility: (sheet, visibility) => update(sheet.id, { visibility }, 'Mudar'),
    give: (sheet, holder) => update(sheet.id, { holder }, holder ? 'Dar' : 'Tirar'),
  };
}

function SheetFailureLine({
  message,
  onDismiss,
}: Readonly<{ message: string; onDismiss: () => void }>): React.JSX.Element {
  return (
    <div
      role="alert"
      className="fixed bottom-16 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-md border border-divider bg-panel px-4 py-2 text-sm text-destructive-text shadow-lg"
    >
      <p className="min-w-0 flex-1">{message}</p>
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        Entendi
      </Button>
    </div>
  );
}
