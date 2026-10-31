import { describe, expect, it } from 'vitest';
import { documentFailureMessage } from '@/features/documents/document-messages';
import type { DocumentsFailure } from '@/services/documents-api';

describe('document failure explanations', () => {
  it.each<[DocumentsFailure['kind'], string]>([
    ['conflict', 'Outra edição foi salva. Seu rascunho foi preservado.'],
    ['action_reused', 'Outra edição foi salva. Seu rascunho foi preservado.'],
    ['forbidden', 'Você não tem permissão para esta alteração.'],
    ['not_found', 'Documento indisponível.'],
    ['offline', 'Sem conexão com o servidor.'],
    ['invalid', 'Confira os campos e o formato da imagem.'],
    ['unauthenticated', 'Sua sessão terminou.'],
    ['unexpected', 'Não foi possível concluir. Tente novamente.'],
  ])('explains %s without hiding the recovery action', (kind, expected) =>
    expect(documentFailureMessage({ kind })).toBe(expected),
  );
});
