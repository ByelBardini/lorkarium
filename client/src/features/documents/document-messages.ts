import { DOCUMENT_TABS_MAX } from '@lorkarium/contracts';
import type { DocumentsFailure } from '@/services/documents-api';
import type { DocumentSaveStatus } from '@/stores/document-editor-store';

export const DOCUMENT_SAVE_LABEL: Readonly<Record<DocumentSaveStatus, string>> = {
  loading: 'Carregando documento…',
  saved: 'Salvo',
  pending: 'Alterações pendentes',
  saving: 'Salvando…',
  offline: 'Sem conexão. Seu rascunho está nesta janela.',
  conflict: 'Outra edição foi salva. Seu rascunho foi preservado.',
  forbidden: 'Você perdeu a permissão de editar. Copie seu rascunho antes de sair.',
  not_found: 'Documento indisponível.',
  failure: 'Não foi possível salvar. Tente novamente.',
};
/** Explains a refused document command. Example: `documentFailureMessage(failure)`. */
export function documentFailureMessage(failure: DocumentsFailure): string {
  if (failure.kind === 'conflict' || failure.kind === 'action_reused')
    return DOCUMENT_SAVE_LABEL.conflict;
  if (failure.kind === 'forbidden') return 'Você não tem permissão para esta alteração.';
  if (failure.kind === 'not_found') return DOCUMENT_SAVE_LABEL.not_found;
  if (failure.kind === 'offline') return 'Sem conexão com o servidor.';
  if (failure.kind === 'invalid') return 'Confira os campos e o formato da imagem.';
  if (failure.kind === 'unauthenticated') return 'Sua sessão terminou.';
  if (failure.kind === 'tab_limit') return `Um documento tem no máximo ${DOCUMENT_TABS_MAX} abas.`;
  if (failure.kind === 'last_tab') return 'O documento precisa de pelo menos uma aba.';
  return 'Não foi possível concluir. Tente novamente.';
}
