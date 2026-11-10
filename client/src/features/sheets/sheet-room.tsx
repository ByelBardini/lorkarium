import type {
  CampaignDetailDto,
  SheetWriteResponseDto,
  UpdateSheetRequestDto,
} from '@lorkarium/contracts';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SheetsFailure, SheetsResult } from '@/services/sheets-api';
import { sheetCommandFailureMessage, skippedBarsNotice } from './sheet-messages';
import {
  SheetRoomContext,
  type SheetRoom,
  type SheetRoomActions,
  type SheetRoomServices,
} from './sheet-room-context';

/** What the room says under the board: a refusal, or a note about a command that went through. */
type RoomLine = Readonly<{ message: string; tone: 'failure' | 'notice' }>;
type SayLine = (line: RoomLine) => void;
type SheetUpdate = Omit<UpdateSheetRequestDto, 'actionId'>;

/** Gives the play room of `campaign` its sheet commands, and says their refusals itself (the
 *  menu that asked is already closed by then), and the template's bars a given sheet could not
 *  add to its holder.
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
  const [line, setLine] = useState<RoomLine | null>(null);
  const room = useMemo<SheetRoom>(
    () => ({ ...services, campaign, actions: sheetActionsOf(campaign, services, setLine) }),
    [campaign, services],
  );
  return (
    <SheetRoomContext value={room}>
      {children}
      {line && <SheetRoomLine line={line} onDismiss={() => setLine(null)} />}
    </SheetRoomContext>
  );
}

function sheetActionsOf(
  campaign: CampaignDetailDto,
  services: SheetRoomServices,
  say: SayLine,
): SheetRoomActions {
  const actionId = services.newActionId ?? (() => crypto.randomUUID());
  const api = services.sheetsApi;
  const open: SheetRoomActions['open'] = (sheet) =>
    void services.workspace
      .getState()
      .openSheet({ campaign, sheetId: sheet.id, sheetName: sheet.name });
  const answered = (action: string) => (result: SheetsResult<SheetWriteResponseDto>) => {
    if (!result.ok) return say(failureLine(action, result.failure));
    const notice = skippedBarsNotice(result.value.receipt.skippedBars);
    if (notice) say({ message: notice, tone: 'notice' });
  };
  const update = (sheetId: string, changes: SheetUpdate, action: string): void =>
    void api
      .update(campaign.id, sheetId, { actionId: actionId(), ...changes })
      .then(answered(action));
  return {
    open,
    create: (sheet) =>
      void api.create(campaign.id, { actionId: actionId(), ...sheet }).then((result) => {
        if (result.ok) open(result.value.sheet);
        answered('Criar')(result);
      }),
    setVisibility: (sheet, visibility) => update(sheet.id, { visibility }, 'Mudar'),
    give: (sheet, holder) => update(sheet.id, { holder }, holder ? 'Dar' : 'Tirar'),
  };
}

function failureLine(action: string, failure: SheetsFailure): RoomLine {
  return { message: sheetCommandFailureMessage(action, failure), tone: 'failure' };
}

function SheetRoomLine({
  line,
  onDismiss,
}: Readonly<{ line: RoomLine; onDismiss: () => void }>): React.JSX.Element {
  const failed = line.tone === 'failure';
  return (
    <div
      role={failed ? 'alert' : 'status'}
      className={cn(
        'fixed bottom-16 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-md border border-divider bg-panel px-4 py-2 text-sm shadow-lg',
        failed ? 'text-destructive-text' : 'text-foreground',
      )}
    >
      <p className="min-w-0 flex-1">{line.message}</p>
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        Entendi
      </Button>
    </div>
  );
}
