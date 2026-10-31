import { redirect, type ActionFunction } from 'react-router';
import type { AppDependencies } from '@/app/router';
import { loginPathFor } from '@/app/route-access';
import { tokenCommandFailureMessage } from '@/features/board/board-messages';
import type { LibraryResult } from '@/services/library-api';
import type { SceneActivationResult } from '@/services/scene-activation';
import type { DocumentsResult } from '@/services/documents-api';
import { libraryIntentDto, type LibraryIntent, type LibraryOutcome } from './library-intents';
import { libraryFailureMessage } from './library-messages';
import { isSheetIntent, runSheetIntent } from './sheet-intent';
import { isSheetTemplateIntent, runSheetTemplateIntent } from './sheet-template-intent';

type Intent<K extends LibraryIntent['intent']> = Extract<LibraryIntent, { intent: K }>;

type IntentAnswer =
  | Readonly<{ ok: true; createdId: string | null }>
  | Readonly<{ ok: false; message: string; signedOut: boolean }>;

/** The library's mutations, by `intent` (JSON from the library fetcher): REST through the
 *  `LibraryApi`, "Levar o grupo pra cá" through `scene:activate`. The router reads the list
 *  again after it; an expired session goes back to the login.
 *
 *  Example: `{ path: 'library', action: libraryAction(deps) }` */
export function libraryAction(deps: AppDependencies): ActionFunction {
  return async ({ request, params }): Promise<LibraryOutcome> => {
    const intent = libraryIntentDto.parse(await request.json());
    const answer = await runIntent(deps, params.campaignId ?? '', intent);
    if (answer.ok) return { intent: intent.intent, ok: true, createdId: answer.createdId };
    if (answer.signedOut) {
      deps.sessionStore.getState().signedOut();
      throw redirect(loginPathFor(new URL(request.url)));
    }
    return { intent: intent.intent, ok: false, message: answer.message };
  };
}

async function runIntent(
  deps: AppDependencies,
  campaignId: string,
  intent: LibraryIntent,
): Promise<IntentAnswer> {
  const { libraryApi } = deps;
  if (isSheetTemplateIntent(intent))
    return runSheetTemplateIntent(deps.sheetTemplatesApi, campaignId, intent);
  if (isSheetIntent(intent)) return runSheetIntent(deps.sheetsApi, campaignId, intent);
  if (intent.intent === 'createDocument') {
    const result = await deps.documentsApi.create(campaignId, intent.changes);
    return result.ok
      ? { ok: true, createdId: result.value.document.id }
      : fromDocumentFailure(result);
  }
  if (intent.intent === 'updateDocument') {
    const result = await deps.documentsApi.update(campaignId, intent.documentId, intent.changes);
    return result.ok ? { ok: true, createdId: null } : fromDocumentFailure(result);
  }
  if (intent.intent === 'removeDocument') {
    const result = await deps.documentsApi.remove(campaignId, intent.documentId, intent.changes);
    return result.ok ? { ok: true, createdId: null } : fromDocumentFailure(result);
  }
  if (intent.intent === 'activateScene') {
    const scope = { campaignId, sceneId: intent.sceneId };
    return fromActivation(await deps.sceneActivation.activate(scope));
  }
  if (intent.intent === 'createFolder') {
    return fromLibrary(await libraryApi.createFolder(campaignId, intent.folder), true);
  }
  if (intent.intent === 'updateFolder') {
    const { folderId, changes } = intent;
    return fromLibrary(await libraryApi.updateFolder(campaignId, folderId, changes), false);
  }
  if (intent.intent === 'removeFolder') {
    return fromLibrary(await libraryApi.removeFolder(campaignId, intent.folderId), false);
  }
  if (intent.intent === 'updateImage')
    return fromLibrary(
      await libraryApi.updateImage(campaignId, intent.imageId, intent.changes),
      false,
    );
  if (intent.intent === 'removeImage')
    return fromLibrary(await libraryApi.removeImage(campaignId, intent.imageId), false);
  return runSceneIntent(deps, campaignId, intent);
}

function fromDocumentFailure(result: Extract<DocumentsResult<never>, { ok: false }>): IntentAnswer {
  const kind = result.failure.kind;
  const message =
    kind === 'conflict'
      ? 'O documento mudou. Confira a versão atual antes de tentar novamente.'
      : kind === 'offline'
        ? 'Sem conexão. Tente novamente quando a mesa reconectar.'
        : kind === 'forbidden'
          ? 'Você não tem permissão para alterar este documento.'
          : 'Não foi possível alterar o documento.';
  return { ok: false, message, signedOut: kind === 'unauthenticated' };
}

async function runSceneIntent(
  { libraryApi }: AppDependencies,
  campaignId: string,
  intent: Intent<'createScene' | 'updateScene' | 'duplicateScene' | 'removeScene'>,
): Promise<IntentAnswer> {
  if (intent.intent === 'createScene') {
    const input = { folderId: intent.folderId };
    return fromLibrary(await libraryApi.createScene(campaignId, input), true);
  }
  if (intent.intent === 'updateScene') {
    const { sceneId, changes } = intent;
    return fromLibrary(await libraryApi.updateScene(campaignId, sceneId, changes), false);
  }
  if (intent.intent === 'duplicateScene') {
    return fromLibrary(await libraryApi.duplicateScene(campaignId, intent.sceneId), true);
  }
  return fromLibrary(await libraryApi.removeScene(campaignId, intent.sceneId), false);
}

function fromLibrary(
  result: LibraryResult<Readonly<{ id: string }> | null>,
  created: boolean,
): IntentAnswer {
  if (result.ok) return { ok: true, createdId: created ? (result.value?.id ?? null) : null };
  const { kind } = result.failure;
  return { ok: false, message: libraryFailureMessage(kind), signedOut: kind === 'unauthenticated' };
}

function fromActivation(result: SceneActivationResult): IntentAnswer {
  if (result.ok) return { ok: true, createdId: null };
  const message = tokenCommandFailureMessage(result.failure);
  return { ok: false, message, signedOut: result.failure === 'unauthenticated' };
}
