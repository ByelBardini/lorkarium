import type { AuthUserDto, CampaignSummaryDto } from '@lorkarium/contracts';
import { useState } from 'react';
import { Outlet } from 'react-router';
import { countGate } from '@/features/plans/plan-gate';
import { continueCandidate } from '@/lib/campaign-list';
import type { Clipboard } from '@/services/clipboard';
import { CampaignList } from './campaign-list';
import { ContinueBand } from './continue-band';
import { GreetingHeader } from './greeting-header';
import { HomeActions } from './home-actions';
import { HomeDialogs, type HomeDialog } from './home-dialogs';

export type HomePageProps = Readonly<{
  user: AuthUserDto;
  campaigns: readonly CampaignSummaryDto[];
  now: Date;
  /** Drawn once per visit, so the greeting does not change on every render. */
  greetingDraw: number;
  clipboard: Clipboard;
}>;

/** "Suas mesas": greeting, the campaign to continue, the list, and the create/join dialogs.
 *  The campaign detail modal renders through the `Outlet`.
 *
 *  Example: `<HomePage user={user} campaigns={campaigns} now={new Date()} greetingDraw={0.4} clipboard={clipboard} />` */
export function HomePage(props: HomePageProps): React.JSX.Element {
  const { user, campaigns, now, greetingDraw, clipboard } = props;
  const [dialog, setDialog] = useState<HomeDialog>(null);
  const candidate = continueCandidate(campaigns);
  const openCreate = (): void => setDialog('create');
  const openJoin = (): void => setDialog('join');
  const owned = campaigns.filter(({ ownerId }) => ownerId === user.id).length;
  const createGate = countGate(user.limits, 'campaigns', owned);
  return (
    <div className="flex w-full flex-col gap-10 px-4 py-8 sm:px-8 sm:py-10 lg:px-12">
      <title>Lorkarium · Mesas</title>
      <header className="flex flex-wrap items-end justify-between gap-6">
        <GreetingHeader name={user.name} now={now} draw={greetingDraw} />
        {campaigns.length > 0 && (
          <HomeActions onCreate={openCreate} onJoin={openJoin} createGate={createGate} />
        )}
      </header>
      {candidate && <ContinueBand campaign={candidate} readerId={user.id} />}
      <CampaignList
        campaigns={campaigns}
        readerId={user.id}
        onCreate={openCreate}
        onJoin={openJoin}
      />
      <HomeDialogs dialog={dialog} clipboard={clipboard} onClose={() => setDialog(null)} />
      <Outlet />
    </div>
  );
}
