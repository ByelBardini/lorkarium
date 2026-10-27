import type { AuthUserDto, CampaignDetailDto, CampaignRoleDto } from '@lorkarium/contracts';
import { useContext, useState } from 'react';
import { useNavigate, useRevalidator } from 'react-router';
import type { StoreApi } from 'zustand/vanilla';
import { juggernautFailureMessage } from '@/features/campaigns/campaign-messages';
import { EXPLORE_PATH } from '@/features/explore/explore-path';
import {
  MemberRoleContext,
  type MemberRoleChanger,
} from '@/features/sessions/use-member-role-change';
import { readerSeatOf } from '@/lib/campaign-seat';
import type { CampaignsResult } from '@/services/campaigns-api';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { OpenTablesStore } from '@/stores/open-tables-store';

export type JuggernautModeDeps = Readonly<{
  campaign: CampaignDetailDto;
  reader: AuthUserDto | null;
  openTables: StoreApi<OpenTablesStore>;
  /** The tab shown: a refusal goes to its status line. */
  interaction: StoreApi<BoardInteractionStore>;
}>;

/** Juggernaut mode of the reader at this table: whether it is on, whether a request is on its
 *  way, and the switch. */
export type JuggernautMode = Readonly<{ on: boolean; pending: boolean; toggle: () => void }>;

/** "Ativar/Sair do modo juggernaut" for an admin who does not own the table (`null` for anyone
 *  else, or outside the room). Turning it on reads the campaign again (the room becomes the
 *  master's); turning it off reads it again in the role the server gave back, or — `myRole:
 *  null`, they were not a member — closes the table and goes to "Explorar mesas".
 *
 *  Example: `const mode = useJuggernautMode({ campaign, reader: user, openTables, interaction })` */
export function useJuggernautMode(deps: JuggernautModeDeps): JuggernautMode | null {
  const changer = useContext(MemberRoleContext);
  const after = useAfterSwitch(deps);
  const [pending, setPending] = useState(false);
  if (!changer || !offersJuggernautMode(deps)) return null;
  const on = deps.campaign.juggernaut;
  const toggle = (): void => {
    setPending(true);
    void switchMode(changer, deps.campaign.id, on).then((result) => {
      setPending(false);
      if (result.ok) void after(result.value);
      else deps.interaction.getState().say(juggernautFailureMessage(result.failure));
    });
  };
  return { on, pending, toggle };
}

function offersJuggernautMode({ campaign, reader }: JuggernautModeDeps): boolean {
  if (reader?.role !== 'admin') return false;
  return !readerSeatOf(campaign, reader.id).owner;
}

// Once the server switched: the room follows the role it gave back; `null` left the table.
function useAfterSwitch({
  campaign,
  openTables,
}: JuggernautModeDeps): (myRole: CampaignRoleDto | null) => Promise<void> {
  const { revalidate } = useRevalidator();
  const navigate = useNavigate();
  return async (myRole) => {
    if (myRole !== null) return revalidate();
    // Explorar first: the table screen, still mounted, would show a table no longer open.
    await navigate(EXPLORE_PATH);
    openTables.getState().close(campaign.id);
  };
}

async function switchMode(
  changer: MemberRoleChanger,
  campaignId: string,
  on: boolean,
): Promise<CampaignsResult<CampaignRoleDto | null>> {
  if (!on) {
    const started = await changer.startJuggernaut(campaignId);
    return started.ok ? { ok: true, value: started.value.myRole } : started;
  }
  const ended = await changer.endJuggernaut(campaignId);
  return ended.ok ? { ok: true, value: ended.value.myRole } : ended;
}
