import type { TokenDto, TokenLayerDto } from '@lorkarium/contracts';
import type { Cell } from '@lorkarium/game-core';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DISCONNECTED_COMMAND, tokenCommandFailureMessage } from '@/features/board/board-messages';
import type { SceneDistance } from '@/lib/sight-form';
import type { AssetsApi } from '@/services/assets-api';
import type {
  BoardCommandFailure,
  BoardCommandResult,
  TableBoardCommands,
  TokenEdit,
  BoardScope,
} from '@/services/table-board-commands';
import { AuraEditor } from './aura-editor';
import type { AuraFormValues } from './aura-form-state';
import { BarsEditor } from './bars-editor';
import { TokenBasicsTab } from './token-basics-tab';
import {
  dialogTabsOf,
  emptyTokenForm,
  firstErrorTab,
  parseTokenForm,
  tabHasErrors,
  tokenFormOf,
  TOKEN_DIALOG_TABS,
  withAura,
  withControllers,
  type TokenDialogTab,
  type TokenFormErrors,
  type TokenFormValues,
  type TokenPlayer,
} from './token-form-state';
import {
  deleteTokenQuestion,
  EDIT_TOKEN_SUBTITLE,
  MISSING_FIELDS,
  NEW_TOKEN_SUBTITLE,
  PLAYER_EDIT_TOKEN_SUBTITLE,
  PLAYER_NEW_TOKEN_SUBTITLE,
  sharedFieldsNote,
} from './token-messages';
import { TokenPreview } from './token-preview';
import { VisionLightTab } from './vision-light-tab';

/** Who opens the dialog: the master (everything), or a player on a token she may edit, who never
 *  sees "Visão e luz", always stays in "Quem controla" and deletes only with the room's key. */
export type TokenDialogViewer =
  Readonly<{ mode: 'master' }> | Readonly<{ mode: 'player'; userId: string; canDelete: boolean }>;

const MASTER: TokenDialogViewer = { mode: 'master' };

export type TokenDialogProps = Readonly<{
  /** The grid the token is on (or lands on). */
  scope: BoardScope;
  /** `null` creates ("Novo token"); a token edits it ("Editar token"). */
  token: TokenDto | null;
  /** Where a new token goes: the cell at the center of the view. */
  placeAt: Cell;
  /** The layer a new token lands on (the master's active one). */
  layer: TokenLayerDto;
  players: readonly TokenPlayer[];
  commands: TableBoardCommands;
  assets: AssetsApi;
  /** The scene's cell: the sight is typed in its unit. */
  distance: SceneDistance;
  connected: boolean;
  /** The player whose character the token is linked to: identity, control and bars are the
   *  character's, in every grid (`null`/absent: a loose token). */
  cardOwner?: string | null;
  /** The master when absent. */
  viewer?: TokenDialogViewer;
  onClose: () => void;
}>;

/** "Novo token" / "Editar token": the preview at the side (also where the image is chosen), the
 *  tabs "Básico", "Barras", "Visão e luz" (not for a player) and "Aura", and the footer. Saving with an error
 *  goes to the first tab that has one. Mounted only while open; saving closes on the ack, and the
 *  change itself arrives as the event everyone gets.
 *
 *  Example: `{dialog && <TokenDialog scope={scope} token={null} placeAt={center} layer="tokens" players={players} commands={commands} assets={assets} distance={scene} connected onClose={close} />}` */
export function TokenDialog(props: TokenDialogProps): React.JSX.Element {
  const { token, onClose } = props;
  const dialog = useTokenDialog(props);
  const player = props.viewer?.mode === 'player';
  const newSubtitle = player ? PLAYER_NEW_TOKEN_SUBTITLE : NEW_TOKEN_SUBTITLE;
  const editSubtitle = player ? PLAYER_EDIT_TOKEN_SUBTITLE : EDIT_TOKEN_SUBTITLE;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[min(800px,calc(100svh-var(--title-bar-height)-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[900px]">
        <DialogHeader className="shrink-0 gap-1 border-b border-border py-5 pr-14 pl-6 md:pl-7">
          <DialogTitle>{token ? 'Editar token' : 'Novo token'}</DialogTitle>
          <DialogDescription>{token ? editSubtitle : newSubtitle}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            dialog.save();
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
            <aside className="shrink-0 border-b border-border bg-background p-4 md:w-[300px] md:overflow-y-auto md:border-r md:border-b-0 md:p-6">
              <TokenPreview
                form={dialog.form}
                image={{ campaignId: props.scope.campaignId, assets: props.assets }}
                onImage={dialog.setImage}
                distance={props.distance}
              />
            </aside>
            <TokenTabs props={props} dialog={dialog} />
          </div>
          <TokenDialogFooter props={props} dialog={dialog} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

type TokenDialogState = Readonly<{
  form: TokenFormValues;
  setForm: (form: TokenFormValues) => void;
  setImage: (assetId: string | null) => void;
  setAura: (update: (aura: AuraFormValues) => AuraFormValues) => void;
  errors: TokenFormErrors;
  tab: TokenDialogTab;
  setTab: (tab: TokenDialogTab) => void;
  failure: BoardCommandFailure | null;
  saving: boolean;
  save: () => void;
  remove: () => void;
}>;

function useTokenDialog(props: TokenDialogProps): TokenDialogState {
  const { distance, onClose } = props;
  const viewer = props.viewer ?? MASTER;
  const token = props.token;
  const [form, setForm] = useState(() => initialFormOf(props));
  const [errors, setErrors] = useState<TokenFormErrors>({});
  const [tab, setTab] = useState<TokenDialogTab>('basics');
  const [failure, setFailure] = useState<BoardCommandFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const run = async (send: () => Promise<BoardCommandResult>): Promise<void> => {
    setSaving(true);
    const result = await send();
    setSaving(false);
    if (result.ok) return onClose();
    setFailure(result.failure);
  };
  const save = (): void => {
    const parsed = parseTokenForm(form, distance, viewer.mode);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return setTab(firstErrorTab(parsed.errors) ?? tab);
    void run(() => sendToken(props, parsed.token));
  };
  const remove = (): void => {
    if (token) void run(() => props.commands.deleteToken(props.scope, token.id));
  };
  // The image arrives after an upload: the fields typed meanwhile are kept.
  const setImage = (imageAssetId: string | null): void =>
    setForm((current) => ({ ...current, imageAssetId }));
  const setAura = (update: (aura: AuraFormValues) => AuraFormValues): void =>
    setForm((current) => withAura(current, update(current.aura)));
  return { form, setForm, setImage, setAura, errors, tab, setTab, failure, saving, save, remove };
}

// A player's token is born without sight and with her in control (the server's rule): the form
// starts that way so the preview and "Quem controla" do not say otherwise.
function initialFormOf({ token, distance, viewer }: TokenDialogProps): TokenFormValues {
  const form = token ? tokenFormOf(token, distance) : emptyTokenForm(distance);
  if (viewer?.mode !== 'player') return form;
  const unseeing = token ? form : { ...form, sight: { ...form.sight, sees: false } };
  return withControllers(unseeing, [viewer.userId]);
}

function lockedIdsOf(viewer: TokenDialogViewer | undefined): readonly string[] {
  return viewer?.mode === 'player' ? [viewer.userId] : [];
}

// A player only moves on the Tokens layer, so hers lands there whatever layer is active.
function sendToken(props: TokenDialogProps, edit: TokenEdit): Promise<BoardCommandResult> {
  const { commands, scope, token, placeAt } = props;
  if (token) return commands.updateToken(scope, token.id, edit);
  const layer = props.viewer?.mode === 'player' ? 'tokens' : props.layer;
  return commands.createToken(scope, { ...edit, col: placeAt.col, row: placeAt.row, layer });
}

type DialogPartProps = Readonly<{ props: TokenDialogProps; dialog: TokenDialogState }>;

const TAB_LABEL: Readonly<Record<TokenDialogTab, string>> = {
  basics: 'Básico',
  bars: 'Barras',
  vision: 'Visão e luz',
  aura: 'Aura',
};

function TokenTabs({ props, dialog }: DialogPartProps): React.JSX.Element {
  const { form, errors, setForm } = dialog;
  return (
    <Tabs
      value={dialog.tab}
      onValueChange={(value) => isDialogTab(value) && dialog.setTab(value)}
      className="min-w-0 flex-1 md:min-h-0"
    >
      <TabsList className="shrink-0 gap-6 px-6 md:px-7" aria-label="Seções do token">
        {dialogTabsOf(props.viewer?.mode ?? 'master').map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {TAB_LABEL[tab]}
            {tab === 'bars' && (
              <>
                {' '}
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] text-label tabular-nums">
                  {form.bars.length}
                </span>
              </>
            )}
            {tabHasErrors(errors, tab) && <ErrorMark />}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="px-6 py-6 md:min-h-0 md:flex-1 md:overflow-y-auto md:px-7">
        <TabsContent value="basics">
          <SharedNote owner={props.cardOwner} />
          <TokenBasicsTab
            form={form}
            errors={errors}
            players={props.players}
            lockedIds={lockedIdsOf(props.viewer)}
            onChange={setForm}
          />
        </TabsContent>
        <TabsContent value="bars">
          <SharedNote owner={props.cardOwner} />
          <BarsEditor
            bars={form.bars}
            errors={errors.bars}
            onChange={(bars) => setForm({ ...form, bars })}
          />
        </TabsContent>
        <TabsContent value="vision">
          <VisionLightTab
            form={form}
            errors={errors}
            distance={props.distance}
            onChange={setForm}
          />
        </TabsContent>
        <TabsContent value="aura">
          <AuraEditor
            form={form.aura}
            errors={errors.aura ?? {}}
            distance={props.distance}
            images={{ campaignId: props.scope.campaignId, assets: props.assets }}
            onChange={dialog.setAura}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
}

// The fields of this tab are the character's: changing them changes it in every grid.
function SharedNote({ owner }: Readonly<{ owner: string | null | undefined }>) {
  if (!owner) return null;
  return (
    <p className="mb-4 border-l-2 border-primary pl-3 text-[13px] text-label">
      {sharedFieldsNote(owner)}
    </p>
  );
}

function isDialogTab(value: string): value is TokenDialogTab {
  return TOKEN_DIALOG_TABS.some((tab) => tab === value);
}

// Never only by color: the tab is named "Básico (com erro)" for the screen reader.
function ErrorMark(): React.JSX.Element {
  return (
    <>
      <span aria-hidden="true" className="size-1.5 bg-destructive" />{' '}
      <span className="sr-only">(com erro)</span>
    </>
  );
}

function TokenDialogFooter({ props, dialog }: DialogPartProps): React.JSX.Element {
  const { token, connected, onClose } = props;
  const { saving } = dialog;
  const viewer = props.viewer ?? MASTER;
  const canDelete = viewer.mode === 'master' || viewer.canDelete;
  return (
    <div className="flex shrink-0 flex-col border-t border-border">
      {dialog.failure && (
        <Alert variant="destructive" className="mx-6 mt-3 w-auto px-3.5 py-3 text-sm">
          {tokenCommandFailureMessage(dialog.failure)}
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 py-3.5">
        {token && canDelete && (
          <DeleteToken
            name={token.name}
            disabled={saving || !connected}
            onConfirm={dialog.remove}
          />
        )}
        <p role="status" className="text-[13px] text-destructive-text">
          {firstErrorTab(dialog.errors) ? MISSING_FIELDS : ''}
        </p>
        {!connected && <p className="text-[13px] text-muted-foreground">{DISCONNECTED_COMMAND}</p>}
        <span className="ml-auto hidden text-xs text-placeholder sm:inline">Esc fecha</span>
        <div className="ml-auto flex gap-2 sm:ml-0">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || !connected} aria-busy={saving}>
            {saving ? 'Salvando…' : token ? 'Salvar' : 'Criar token'}
          </Button>
        </div>
      </div>
    </div>
  );
}

type DeleteTokenProps = Readonly<{ name: string; disabled: boolean; onConfirm: () => void }>;

// Two steps, no modal over the modal: the question replaces the button until answered.
function DeleteToken({ name, disabled, onConfirm }: DeleteTokenProps): React.JSX.Element {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="text-destructive-text"
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        Excluir token
      </Button>
    );
  }
  return (
    <div
      role="group"
      aria-label={deleteTokenQuestion(name)}
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-sm text-destructive-text">{deleteTokenQuestion(name)}</span>
      <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={onConfirm}>
        Excluir
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
        Manter
      </Button>
    </div>
  );
}
