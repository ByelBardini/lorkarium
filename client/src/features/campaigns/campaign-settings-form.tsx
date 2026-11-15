import type { CampaignDetailDto, DrawnCampaignCoverDto } from '@lorkarium/contracts';
import type { FormEvent } from 'react';
import { fallbackCoverOf } from '@/lib/campaign-cover';
import { useSavedNotice } from '@/lib/unsaved-changes';
import type { AssetsApi } from '@/services/assets-api';
import type { Clipboard } from '@/services/clipboard';
import { commandFailureMessage } from './campaign-messages';
import {
  AccessSection,
  ContentSection,
  DangerSection,
  GeneralSection,
  ImagesSection,
  PlayersSection,
} from './campaign-settings-sections';
import { CampaignSettingsPage } from './campaign-settings-page';
import { DiscardSettingsDialog } from './discard-settings-dialog';
import { SettingsPreviewPanel } from './settings-preview-panel';
import { SettingsSaveActions } from './settings-save-actions';
import { SettingsSectionNav } from './settings-section-nav';
import { useCampaignSettingsDraft, type SettingsDraft } from './use-campaign-settings-draft';
import {
  settingsFailureOf,
  useOnSettingsSettled,
  useSettingsFetcher,
} from './use-settings-fetcher';

export type CampaignSettingsEditorProps = Readonly<{
  campaign: CampaignDetailDto;
  assets: AssetsApi;
  clipboard: Clipboard;
  /** Owner powers (the owner, a juggernaut): only they see "Zona de perigo" and delete the table;
   *  a co-master keeps the rest. */
  canDelete: boolean;
}>;

const SETTINGS_FORM_ID = 'campaign-settings-form';

/** "Configurações da mesa" (master only): the page over the room with the save controls in its
 *  top bar, and the form below. The fields wait in a draft for "Salvar alterações"; leaving with
 *  edits asks first. The code and the deletion are commands of their own, outside the draft.
 *
 *  Example: `<CampaignSettingsEditor key={campaign.id} campaign={campaign} assets={assets} clipboard={clipboard} canDelete />` */
export function CampaignSettingsEditor(props: CampaignSettingsEditorProps): React.JSX.Element {
  const draft = useCampaignSettingsDraft(props.campaign);
  const save = useSettingsSave(props.campaign.id, draft);
  const actions = (
    <SettingsSaveActions
      formId={SETTINGS_FORM_ID}
      saving={save.saving}
      dirty={draft.dirty}
      invalid={draft.dirty && draft.update === null}
      justSaved={save.justSaved}
      failureMessage={save.failureMessage}
      onDiscard={draft.discard}
    />
  );
  return (
    <CampaignSettingsPage campaign={props.campaign} actions={actions}>
      <SettingsSectionNav
        withDanger={props.canDelete}
        values={draft.values}
        createdAt={props.campaign.createdAt}
        memberCount={props.campaign.memberCount}
      />
      {/* `relative`: Radix's hidden inputs are absolute; without a containing block here they
          overflow the clipped page, so a focus or a section jump scrolled the page itself away. */}
      <div data-settings-scroller className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
        <CampaignSettingsForm {...props} draft={draft} save={save} />
      </div>
      <aside
        aria-label="Prévia"
        className="hidden w-80 shrink-0 overflow-y-auto border-l border-divider bg-panel p-4 lg:block xl:w-96"
      >
        <SettingsPreviewPanel values={draft.values} campaign={props.campaign} />
      </aside>
      <DiscardSettingsDialog dirty={draft.dirty} />
    </CampaignSettingsPage>
  );
}

type CampaignSettingsFormProps = CampaignSettingsEditorProps &
  Readonly<{ draft: SettingsDraft; save: SettingsSave }>;

function CampaignSettingsForm({
  campaign,
  assets,
  clipboard,
  canDelete,
  draft,
  save,
}: CampaignSettingsFormProps): React.JSX.Element {
  return (
    <form
      id={SETTINGS_FORM_ID}
      noValidate
      aria-label="Configurações da mesa"
      aria-busy={save.saving}
      onSubmit={save.submit}
      className="flex flex-col"
    >
      <GeneralSection draft={draft} />
      <ImagesSection
        draft={draft}
        campaignId={campaign.id}
        assets={assets}
        drawnCover={drawnCoverOf(campaign)}
      />
      <ContentSection draft={draft} />
      <AccessSection draft={draft} campaign={campaign} clipboard={clipboard} />
      <PlayersSection draft={draft} />
      {canDelete && <DangerSection campaignId={campaign.id} campaignName={campaign.name} />}
    </form>
  );
}

// "Usar capa desenhada" goes back to the stored drawing, or the id's drawing after an image.
function drawnCoverOf(campaign: CampaignDetailDto): DrawnCampaignCoverDto {
  return campaign.cover.kind === 'drawn' ? campaign.cover : fallbackCoverOf(campaign.id);
}

type SettingsSave = Readonly<{
  saving: boolean;
  justSaved: boolean;
  failureMessage: string | null;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}>;

function useSettingsSave(campaignId: string, draft: SettingsDraft): SettingsSave {
  const fetcher = useSettingsFetcher(campaignId);
  const notice = useSavedNotice();
  const failure = settingsFailureOf(fetcher.settled);
  useOnSettingsSettled(fetcher.settled, (result) => {
    if (!('done' in result)) return;
    draft.discard();
    notice.showSaved();
  });
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (draft.update && !fetcher.busy) fetcher.send({ intent: 'update', input: draft.update });
  };
  return {
    saving: fetcher.busy,
    justSaved: notice.justSaved,
    failureMessage: failure && draft.dirty ? commandFailureMessage(failure) : null,
    submit,
  };
}
