import { SHEET_DOCUMENT_READ_RATE } from '@/sheet-sandbox/sheet-bridge-host';
import type { SdkCallDoc } from './sheet-api-reference-content';

const PACE = `Até ${SHEET_DOCUMENT_READ_RATE.limit} leituras de documentos a cada ${SHEET_DOCUMENT_READ_RATE.windowMs / 1000} s (as três funções somadas).`;
const DOCUMENT_ERRORS = ['PERMISSION_NOT_DECLARED', 'RATE_LIMITED', 'OFFLINE'] as const;

/** The reference of `lorkarium.documents`: what the tab shows and the editor completes. */
export const DOCUMENT_SDK_CALLS: readonly SdkCallDoc[] = [
  {
    signature: 'lorkarium.documents.list()',
    summary: `Lista os documentos públicos da mesa que estão fora de pastas ocultas, os mesmos para o mestre e para os jogadores. Lido na hora (nada chega sozinho quando um documento muda: leia de novo). Exige "documents:read" no manifesto. ${PACE}`,
    params: [],
    returns:
      'Promessa que resolve com [{ id, name, folderPath }], folderPath = os nomes das pastas a partir da raiz ([] na raiz).',
    errors: [...DOCUMENT_ERRORS],
    example: `const documentos = await lorkarium.documents.list();
const bestiario = documentos.find((documento) => documento.name === 'Bestiário');`,
  },
  {
    signature: 'lorkarium.documents.tabs(documentId)',
    summary: `As abas de um documento público, na ordem dele, sem as que são só do mestre. Exige "documents:read" no manifesto. ${PACE}`,
    params: [['documentId', 'o id que o documents.list devolveu']],
    returns: 'Promessa que resolve com [{ id, name }].',
    errors: [...DOCUMENT_ERRORS, 'DOCUMENT_NOT_FOUND'],
    example: `const abas = await lorkarium.documents.tabs(bestiario.id);
const goblins = abas.find((aba) => aba.name === 'Goblins');`,
  },
  {
    signature: 'lorkarium.documents.readTab(documentId, tabId)',
    summary: `O conteúdo de uma aba: content é a árvore do editor de documentos ({ type: 'doc', content: [...] }, com parágrafos, títulos, listas, tabelas e imagens) e text é o texto puro, um parágrafo por linha e as células de uma tabela separadas por tab. Uma imagem da aba traz o assetId, lido por assets.read (que pede "sheet:images"). Exige "documents:read" no manifesto. ${PACE}`,
    params: [
      ['documentId', 'o id que o documents.list devolveu'],
      ['tabId', 'o id que o documents.tabs devolveu'],
    ],
    returns: 'Promessa que resolve com { id, name, content, text }.',
    errors: [...DOCUMENT_ERRORS, 'DOCUMENT_NOT_FOUND', 'DOCUMENT_TAB_NOT_FOUND'],
    example: `const aba = await lorkarium.documents.readTab(bestiario.id, goblins.id);
for (const linha of aba.text.split('\\n')) {
  const [nome, pv] = linha.split('\\t');
  if (pv) console.log(nome, Number(pv));
}`,
  },
];
