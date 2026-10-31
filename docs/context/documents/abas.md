# Documentos — abas

Hub: [../documents.md](../documents.md). Plano: [documentos com abas e fichas](../../plans/2026-10-31-documentos-com-abas-e-fichas.md), Parte A.

## Tabela (`0070_document_tabs`)

`library_document_tabs` (`document-tabs.po.ts`): `campaign_id`, `document_id`, `id`, `name` (`CHECK` 1–40), `position` (≥ 0), `visibility` (enum `document_tab_visibility`: `document` | `masters`, padrão `document`), `content` JSONB, `schema_version` (1), `version` (≥ 0, **da aba**) e timestamps.

- PK (`campaign_id`, `id`); único (`campaign_id`, `document_id`, `id`), alvo da FK das imagens por aba.
- FK composta (`campaign_id`, `document_id`) → `library_documents` **cascade**: apagar o documento (ou a mesa) leva as abas.
- Único (`document_id`, `position`) **`DEFERRABLE INITIALLY DEFERRED`**, editado à mão no SQL (o drizzle-kit não declara adiável): o reordenar troca todas as posições num `updateManySql` e o Postgres só confere no commit. Sem o adiável, trocar 0↔1 numa instrução dá `23505`.
- Posições não precisam ser contíguas (excluir deixa buraco); a ordem é sempre `ORDER BY position`.

A migração copia o `content`/`schema_version` de cada documento numa aba "Geral" (posição 0, `document`, versão 0, mesmos timestamps) e dá `DROP` nas duas colunas de `library_documents`: o corpo só existe na aba. A FK `SET NULL ("folder_id")` da pasta não foi tocada (armadilha da `0033`, conferida no SQL e no `document-tabs-migration.spec.ts`).

`DocumentTabsDao`: `listOfDocument` (resumos sem `content`, por posição), `findInDocument` (com conteúdo), `countOfDocument`, `insert`, `update` (nome/visibilidade), `saveContent` (soma a versão **da aba**; a do documento não muda), `reorder` (um `UPDATE … FROM (VALUES …)`) e `delete`. Toda consulta filtra por `campaign_id` + `document_id`.

## Regra (`document-tabs.bo.ts`)

`DocumentTabsBo(document: DocumentAccessBo, tabs, limit)`; o limite (200, `DOCUMENT_TABS_MAX`) entra pelo plugin, o BO não lê o contrato. `visibleTabsOf(document, tabs)` (também usado pelo mapper) ordena por posição e tira as `masters` de quem não é mestre.

- `visibleTo()` exige leitura do documento; `requireVisible(tabId)` → `DOCUMENT_TAB_NOT_FOUND` para aba inexistente **ou oculta** (nunca `FORBIDDEN`).
- `requireEdit(tabId)` (renomear, conteúdo): visível primeiro, depois edição (mestre ou dono) → leitor de documento público recebe `FORBIDDEN` só em aba que vê.
- `requireVisibilityChange(tabId)`: visível e `requireManage` (só mestre; dono → `FORBIDDEN`).
- `requireCreate()`: edição; total + 1 acima do limite → `DOCUMENT_TAB_LIMIT` ("would have 201 tabs; expected at most 200"); devolve a posição seguinte à maior.
- `requireDelete(tabId)`: edição; a única aba do documento → `DOCUMENT_TAB_LAST`. Um documento pode ficar só com abas `masters` (o jogador recebe `tabs: []`).
- `mergedOrder(visibleOrder)`: id fora das visíveis (de outro documento ou oculto) → `DOCUMENT_TAB_NOT_FOUND` citando o id. As casas das abas pedidas recebem a ordem pedida, em sequência; aba oculta **ou omitida** fica na casa dela (A, B oculta, C + `[C, A]` → C, B, A). Posições renumeradas de 0 sem buraco.

Mapper: `toDocumentDto(row, owners, access, tabs)` (`schemaVersion: 2`) leva só os resumos de `visibleTabsOf`, sem corpo; `document-tabs.mapper.ts`: `toDocumentTabSummaryDto` e `toDocumentTabDto` (com `content` revalidado pelo contrato).

## Service e rotas (`document-tabs.service.ts`)

`DocumentTabsService(deps)` reusa os passos de `DocumentWriteSteps` (trava `lockById`, escopo, recibo, publicação depois do commit). Criar documento já cria a aba "Geral" vazia (`FIRST_DOCUMENT_TAB_NAME`) na mesma transação.

- **Estruturais** (criar, renomear/ocultar, reordenar, excluir): `lock → load tabs → recibo anterior? → BO (permissão) → versão do documento → grava → bump do documento → recibo → commit → publish`. A versão esperada é a **do documento**, que soma 1; o recibo leva a versão nova, `operation` `tab-*` e `tabId` (a criada, a renomeada, a excluída; reordenar não leva). Resposta `{ document, receipt }` com as abas que o leitor vê. A permissão vem antes da versão (leitor sem posse recebe 403, não 409); o recibo repetido vem antes da permissão, então uma exclusão retransmitida devolve o recibo mesmo com a aba já apagada.
- **Corpo** (`tab-content`): `lock → load tabs → requireEdit → recibo anterior? → versão da aba → imagens → saveContent → recibo → commit → publish`. Versão esperada **da aba**; divergente → `DOCUMENT_VERSION_CONFLICT` sem gravar. A do documento não muda, então duas pessoas em abas diferentes não conflitam. Resposta `{ tab: resumo, receipt }`.
- `library:changed` sai a cada mutação aplicada e nunca na recusa nem na repetição.

| Método e caminho (sob `/api/campaigns/:campaignId/documents/:documentId`) | Corpo                                                                  | Resposta                               |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- |
| POST `/tabs`                                                              | `createDocumentTabRequestDto` (`actionId`, `expectedVersion`, `name?`) | 201 `documentWriteResponseDto`         |
| PATCH `/tabs/order`                                                       | `reorderDocumentTabsRequestDto` (`tabIds`)                             | 200 `documentWriteResponseDto`         |
| PATCH `/tabs/:tabId`                                                      | `updateDocumentTabRequestDto` (`name?`, `visibility?`)                 | 200 `documentWriteResponseDto`         |
| DELETE `/tabs/:tabId`                                                     | `deleteDocumentTabRequestDto`                                          | 200 `documentWriteResponseDto`         |
| GET `/tabs/:tabId`                                                        | —                                                                      | 200 `documentTabResponseDto` `{ tab }` |
| PATCH `/tabs/:tabId/content`                                              | `updateDocumentTabContentRequestDto` (versão da aba)                   | 200 `documentTabWriteResponseDto`      |

Erros: `DOCUMENT_TAB_NOT_FOUND` 404 (também aba oculta e `tabId` malformado), `DOCUMENT_TAB_LIMIT` 422 (mesmo padrão de `FOLDER_TOO_DEEP`), `DOCUMENT_TAB_LAST` **409** (conflito com o estado, mesmo padrão de `SCENE_IS_ACTIVE`), `DOCUMENT_VERSION_CONFLICT`/`DOCUMENT_ACTION_REUSED` 409, `FORBIDDEN` 403, `DOCUMENT_NOT_FOUND`/`CAMPAIGN_NOT_FOUND` 404. O DELETE da aba responde 200 com o documento (o do documento continua 204). Imagens por aba: [imagens.md](imagens.md).

## Provas

`server/test/integration/document-tabs-dao.spec.ts`: ordem, conteúdo, versão só da aba, troca 1ª↔3ª sem violar o único, `CHECK` do nome (0 e 41), isolamento Quelm × Vharn, FK composta (`23503`) e cascata. `document-tabs-migration.spec.ts`: banco de rascunho até a `0069`, documento com corpo vira uma aba "Geral" com o mesmo JSON, colunas removidas e FK da pasta intacta. Mutação: `saveContent` sem `+ 1` deixou o cenário da versão vermelho.

Unit: `document-tabs.bo.spec.ts` (19) e `document-tabs.mapper.spec.ts`/`documents.mapper.spec.ts`. Mutações desfeitas: sem filtro de `masters` (8 vermelhos), limite +1, última aba, mescla sem casa fixa e `FORBIDDEN` antes do 404 deixaram cada cenário certo vermelho.

Service e borda: `document-tabs.service.spec.ts` (diário de criar/renomear/ocultar/reordenar/excluir e do corpo, repetição sem publicar, reuso, versão do documento e da aba, rollback, exclusão retransmitida) e `document-writes.service.spec.ts`; integração `document-tabs.spec.ts` (restart, abas diferentes em paralelo, 409 da aba, "Segredos" fora da lista e 404 por id, reordenar com a oculta na casa, 403 na visibilidade, Caio e espectador leem e recebem 403 ao criar, Quelm/estranho 404, 201ª → 422, última → 409, `library:changed` só nas aplicadas). Mutações desfeitas: sem comparar a versão da aba (unit e integração vermelhos), sem `bumpDocument` (4 vermelhos), imagens sem o filtro de aba visível (1 vermelho).
