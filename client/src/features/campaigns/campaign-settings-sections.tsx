import {
  CAMPAIGN_DESCRIPTION_MAX_LENGTH,
  CAMPAIGN_NAME_MAX_LENGTH,
  type CampaignDetailDto,
  type CampaignStatusDto,
} from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { FormField } from '@/components/form-field';
import { PasswordField } from '@/components/password-field';
import { SegmentField, type SegmentOption } from '@/components/segment-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { featureGate } from '@/features/plans/plan-gate';
import { usePlanLimits } from '@/features/plans/use-plan-limits';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_HINT,
  CAMPAIGN_STATUS_LABEL,
  statusToneClass,
} from '@/lib/campaign-status';
import { VisibilityField } from '@/features/home/visibility-field';
import { cn } from '@/lib/utils';
import type { Clipboard } from '@/services/clipboard';
import { CampaignImageFields, type CampaignImageFieldsProps } from './campaign-image-fields';
import { CampaignTagsField, ContentWarningsField } from './campaign-label-fields';
import { PLAYER_TOKEN_RIGHTS_TEXT } from './campaign-settings-messages';
import { DeleteCampaignDialog } from './delete-campaign-dialog';
import { JoinCodeSetting } from './join-code-setting';
import { SETTINGS_SECTIONS } from './settings-sections';
import type { SettingsDraft } from './use-campaign-settings-draft';

// The dot repeats the status tone of the badges; the label still says it in words.
const STATUS_OPTIONS: readonly SegmentOption<CampaignStatusDto>[] = CAMPAIGN_STATUSES.map(
  (status) => ({
    value: status,
    label: CAMPAIGN_STATUS_LABEL[status],
    mark: (
      <span
        aria-hidden="true"
        className={cn('size-1.5 shrink-0 rounded-full bg-current', statusToneClass(status))}
      />
    ),
  }),
);

type SettingsSectionProps = Readonly<{
  /** The entry of `SETTINGS_SECTIONS`: the anchor the side menu jumps to, and the title. */
  section: Readonly<{ id: string; title: string }>;
  description: string;
  danger?: boolean;
  children: React.ReactNode;
}>;

function SettingsSection(props: SettingsSectionProps): React.JSX.Element {
  const titleId = useId();
  return (
    <section
      id={props.section.id}
      tabIndex={-1}
      aria-labelledby={titleId}
      className="flex scroll-mt-4 flex-col gap-5 border-b border-divider px-4 py-6 outline-none last:border-b-0 sm:px-8"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2
          id={titleId}
          className={cn(
            'font-display text-2xl leading-tight font-semibold',
            props.danger && 'text-destructive-text',
          )}
        >
          {props.section.title}
        </h2>
        <p className="text-[13px] text-muted-foreground">{props.description}</p>
      </div>
      {props.children}
    </section>
  );
}

/** "Geral": name, system, status and "Sobre a mesa".
 *
 *  Example: `<GeneralSection draft={draft} />` */
export function GeneralSection({ draft }: Readonly<{ draft: SettingsDraft }>): React.JSX.Element {
  const { values, change } = draft;
  return (
    <SettingsSection
      section={SETTINGS_SECTIONS.general}
      description="Nome, sistema e o momento da campanha."
    >
      <NameAndSystemFields draft={draft} />
      <SegmentField
        legend="Status"
        value={values.status}
        options={STATUS_OPTIONS}
        fill
        onChange={(status) => change({ status })}
        hint={CAMPAIGN_STATUS_HINT[values.status]}
      />
      <DescriptionField draft={draft} />
    </SettingsSection>
  );
}

/** "Imagens": the photo, cover and banner side by side, and the drawn cover under them.
 *
 *  Example: `<ImagesSection draft={draft} campaignId={id} assets={assets} drawnCover={cover} />` */
export function ImagesSection(props: CampaignImageFieldsProps): React.JSX.Element {
  return (
    <SettingsSection
      section={SETTINGS_SECTIONS.images}
      description="Solte, cole (Ctrl+V) ou clique. PNG, JPEG, WebP ou GIF até 20 MB."
    >
      <CampaignImageFields {...props} />
    </SettingsSection>
  );
}

function NameAndSystemFields({ draft }: Readonly<{ draft: SettingsDraft }>): React.JSX.Element {
  const ids = { name: useId(), system: useId() };
  const { values, errors, change } = draft;
  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <FormField
        id={ids.name}
        label="Nome da mesa"
        error={errors.name}
        hint={`${values.name.length}/${CAMPAIGN_NAME_MAX_LENGTH}`}
      >
        <Input
          id={ids.name}
          className="font-display text-lg font-semibold"
          value={values.name}
          onChange={(event) => change({ name: event.target.value })}
          aria-invalid={errors.name !== undefined}
          aria-describedby={errors.name ? `${ids.name}-error` : undefined}
        />
      </FormField>
      <FormField id={ids.system} label="Sistema" error={errors.system} hint="Opcional.">
        <Input
          id={ids.system}
          value={values.system}
          placeholder="D&D 5e, Tormenta20…"
          onChange={(event) => change({ system: event.target.value })}
          aria-invalid={errors.system !== undefined}
          aria-describedby={errors.system ? `${ids.system}-error` : undefined}
        />
      </FormField>
    </div>
  );
}

function DescriptionField({ draft }: Readonly<{ draft: SettingsDraft }>): React.JSX.Element {
  const id = useId();
  const { values, errors, change } = draft;
  return (
    <FormField
      id={id}
      label="Sobre a mesa"
      error={errors.description}
      hint={`${values.description.length}/${CAMPAIGN_DESCRIPTION_MAX_LENGTH}`}
    >
      <Textarea
        id={id}
        value={values.description}
        placeholder="Do que se trata a campanha, o clima, quando joga…"
        onChange={(event) => change({ description: event.target.value })}
        aria-invalid={errors.description !== undefined}
        aria-describedby={errors.description ? `${id}-error` : undefined}
      />
    </FormField>
  );
}

/** "Conteúdo": the content warnings and the free tags.
 *
 *  Example: `<ContentSection draft={draft} />` */
export function ContentSection({ draft }: Readonly<{ draft: SettingsDraft }>): React.JSX.Element {
  const { values, change } = draft;
  return (
    <SettingsSection
      section={SETTINGS_SECTIONS.content}
      description="O clima da mesa, antes de alguém entrar."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <ContentWarningsField
          value={values.contentWarnings}
          onChange={(contentWarnings) => change({ contentWarnings })}
        />
        <CampaignTagsField value={values.tags} onChange={(tags) => change({ tags })} />
      </div>
    </SettingsSection>
  );
}

export type AccessSectionProps = Readonly<{
  draft: SettingsDraft;
  campaign: CampaignDetailDto;
  clipboard: Clipboard;
}>;

/** "Acesso": visibility, the password switch (kept, replaced or removed) and the join code.
 *  Without `privateCampaign` in the table's plan, "Privada" is offered only to a table that is
 *  private already (it stays until it goes public).
 *
 *  Example: `<AccessSection draft={draft} campaign={campaign} clipboard={clipboard} />` */
export function AccessSection({ draft, campaign, clipboard }: AccessSectionProps) {
  const { values, change } = draft;
  const gate = featureGate(usePlanLimits().table, (limits) => limits.privateCampaign);
  const locked = !gate.open && campaign.visibility === 'public';
  return (
    <SettingsSection section={SETTINGS_SECTIONS.access} description="Quem consegue entrar e como.">
      <VisibilityField
        value={values.visibility}
        onChange={(visibility) => change({ visibility })}
        privateLock={locked ? gate.hint : null}
      />
      {/* One panel split by a hairline, not two cards: the short password side would stretch to
          the code's height and leave an empty box. */}
      <div className="grid divide-y divide-divider rounded-md border border-divider bg-card lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <div className="self-center p-4">
          <PasswordSetting draft={draft} hasPassword={campaign.hasPassword} />
        </div>
        {campaign.joinCode && (
          <div className="p-4">
            <JoinCodeSetting
              campaignId={campaign.id}
              code={campaign.joinCode}
              clipboard={clipboard}
            />
          </div>
        )}
      </div>
    </SettingsSection>
  );
}

type PasswordSettingProps = Readonly<{ draft: SettingsDraft; hasPassword: boolean }>;

function PasswordSetting({ draft, hasPassword }: PasswordSettingProps): React.JSX.Element {
  const passwordId = useId();
  const { values, errors, change } = draft;
  return (
    <div className="flex flex-col gap-3">
      <SwitchRow
        label="Pedir senha para entrar"
        hint={values.requirePassword ? undefined : 'Desligado: o código basta.'}
        checked={values.requirePassword}
        onCheckedChange={(requirePassword) => change({ requirePassword, password: '' })}
      />
      {values.requirePassword && (
        <FormField
          id={passwordId}
          label={hasPassword ? 'Nova senha' : 'Senha da mesa'}
          error={errors.password}
          hint={hasPassword ? 'Deixe em branco para manter a senha atual.' : undefined}
        >
          <PasswordField
            id={passwordId}
            value={values.password}
            onValueChange={(password) => change({ password })}
            invalid={errors.password !== undefined}
            describedBy={errors.password ? `${passwordId}-error` : undefined}
            autoComplete="new-password"
            autoFocus={!hasPassword}
          />
        </FormField>
      )}
    </div>
  );
}

// A surface for a setting that stands on its own (each player token right).
function SettingCard({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return <div className="rounded-md border border-divider bg-card p-4">{children}</div>;
}

type SwitchRowProps = Readonly<{
  label: string;
  /** A line under the label, tied to the switch. */
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}>;

function SwitchRow({ label, hint, ...toggle }: SwitchRowProps): React.JSX.Element {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <Switch
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-px"
        {...toggle}
      />
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={id} className="text-sm font-semibold text-foreground">
          {label}
        </Label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs text-placeholder">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

/** "Permissões dos jogadores": the two campaign switches that let every player create and edit,
 *  and delete, the tokens they created (the server reads them on each command).
 *
 *  Example: `<PlayersSection draft={draft} />` */
export function PlayersSection({ draft }: Readonly<{ draft: SettingsDraft }>): React.JSX.Element {
  const { values, change } = draft;
  return (
    <SettingsSection
      section={SETTINGS_SECTIONS.players}
      description={PLAYER_TOKEN_RIGHTS_TEXT.hint}
    >
      <div className="grid gap-3 lg:grid-cols-2">
        <SettingCard>
          <SwitchRow
            label={PLAYER_TOKEN_RIGHTS_TEXT.create}
            hint={PLAYER_TOKEN_RIGHTS_TEXT.createHint}
            checked={values.playersCreateTokens}
            onCheckedChange={(playersCreateTokens) => change({ playersCreateTokens })}
          />
        </SettingCard>
        <SettingCard>
          <SwitchRow
            label={PLAYER_TOKEN_RIGHTS_TEXT.remove}
            hint={PLAYER_TOKEN_RIGHTS_TEXT.removeHint}
            checked={values.playersDeleteTokens}
            onCheckedChange={(playersDeleteTokens) => change({ playersDeleteTokens })}
          />
        </SettingCard>
      </div>
    </SettingsSection>
  );
}

type DangerSectionProps = Readonly<{ campaignId: string; campaignName: string }>;

/** "Zona de perigo": only "Excluir mesa", confirmed by typing the name.
 *
 *  Example: `<DangerSection campaignId={campaign.id} campaignName={campaign.name} />` */
export function DangerSection(props: DangerSectionProps): React.JSX.Element {
  const [deleting, setDeleting] = useState(false);
  return (
    <SettingsSection section={SETTINGS_SECTIONS.danger} description="O que não tem volta." danger>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-destructive-text">Excluir mesa</span>
          <span className="text-[13px] text-muted-foreground">
            Apaga grids, tokens, fichas e desenhos. Não tem volta.
          </span>
        </div>
        <Button type="button" variant="destructive" onClick={() => setDeleting(true)}>
          Excluir mesa
        </Button>
      </div>
      {deleting && <DeleteCampaignDialog {...props} onClose={() => setDeleting(false)} />}
    </SettingsSection>
  );
}
