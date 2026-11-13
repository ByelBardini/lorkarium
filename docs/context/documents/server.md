# Documentos — servidor

Hub: [../documents.md](../documents.md). Abas (tabela, regra, rotas): [abas.md](abas.md).

## Persistência

Migrações: `0068_document_image_purpose` (propósito reservado), `0069_library_documents` (quatro tabelas), `0070_document_tabs` (abas; o corpo sai do documento) `0071_document_tab_assets` (imagem por aba) e `0107_document_preview` (a prévia).

- `library_documents`: campanha, pasta nullable, nome 1–60, visibilidade privada por padrão, versão não negativa, autor nullable e timestamps. Desde a `0070` **sem** `content`/`schema_version`: o corpo mora em `library_document_tabs` ([abas.md](abas.md)). Único `(campaign_id,id)` e índice campanha/pasta. A prévia: `preview_summary` (texto nulo, `CHECK` 1–280) e `preview_asset_id` (→ `assets`, `ON DELETE SET NULL`, sem índice: aceito no `foreign-key-indexes.spec.ts`; está no `ASSET_FOREIGN_KEYS` do `asset-references.dao.ts`, então o asset da capa não é órfão).
- `library_document_owners`: PK campanha/documento/usuário, FKs compostas para documento e participação da mesma campanha; remoção de participação apaga posse.
- `library_document_assets` (`document-assets.po.ts`): PK campanha/documento/asset/**aba**, FKs compostas para documento, aba (cascade) e asset; `in_content` distingue preparação e referência confirmada **daquela aba**. Índice campanha/asset.
- `library_document_actions`: PK campanha/usuário/actionId; operação, SHA256 canônico do pedido e recibo sem conteúdo. Não aponta ao documento para reconhecer uma exclusão repetida. Cascata pela campanha. `created_at` (`0103_receipt_created_at`): o recibo vale 24 h, depois o housekeeping o apaga e o mesmo `actionId` é um comando novo (ver [`../housekeeping.md`](../housekeeping.md)).

A FK composta da pasta usa `SET NULL (folder_id)`. O serviço de biblioteca move documentos ao pai na transação de exclusão de pasta, preservando conteúdo/donos e avançando versão. Exclusão da campanha remove tudo por cascata. Schema e `truncateAllTables` incluem as cinco tabelas.

## Serviços e transações

`DocumentsServiceDeps` (em `document-writes.service.ts`) recebe DAOs de leitura e compositores `transaction`/`snapshot`, relógio, gerador de IDs, `LibraryPublisherPort` e `tabLimit` (o plugin passa `DOCUMENT_TABS_MAX`). `DocumentWriteSteps`, no mesmo arquivo, guarda os passos comuns: `lockedAccess` (trava a mesa e relê a participação) e `lockedTable` (o mesmo, por `lockWithOwner`, com os `limits` do plano do dono), `tabLockedAccess` (trava só a linha da aba, para o corpo; salvar o corpo não conta contra o plano), `scopeOf` (linha + donos + `DocumentAccessBo`, exige leitura), `view` (o `DocumentDto` com as abas visíveis), `previous`/`record` (recibo), `bumpDocument`, `published` (`library:changed`, só para comando aplicado, depois do commit) e `tabChanged` (`document:tabChanged` do corpo salvo, idem; aba `masters` só aos mestres — ver [Tempo real](../documents.md#tempo-real)); `commandFingerprint` e `documentAssetIds` também moram lá.

- `DocumentsService`: criar (com a aba "Geral" vazia na mesma transação), ler, renomear (`PATCH …/content`, só `name`), a prévia (`updatePreview`: quem edita — mestre ou dono —, versão do documento +1, recibo `preview`, `library:changed`; a capa passa por `DocumentPreviewBo`), administrar, excluir e as associações de imagem de uma aba (`authorizeEditor`, `associateAsset`, `associateLibraryAsset`, todas com `tabId`).
- `DocumentTabsService` ([abas.md](abas.md)): ler aba, criar, renomear/ocultar, reordenar, excluir e salvar corpo.

`createDocumentsModule` monta os DAOs por executor com `runInTransaction` e `runInSnapshot`; `build-app` registra o plugin sob `/api` e compõe a política de assets sem dependência de Documents em Assets.

`DocumentPreviewBo` (`document-preview.bo.ts`, sem I/O): a capa pode ser nenhuma, a atual ou uma imagem já associada a uma aba que o requerente vê (o dono não alcança, pela capa, imagem só de aba `masters`); senão `DocumentPreviewAssetNotFoundError` (`DOCUMENT_ASSET_NOT_FOUND`, 404). O service lê as abas e as referências do documento (`assets.ofDocument`) para montá-lo.

`DocumentAccessBo` concentra leitura, edição, administração e comparação de versão; mapper projeta capacidades e só inclui donos para mestres. Posse só vale para jogador atual. ID privado inacessível/outra campanha: `DOCUMENT_NOT_FOUND`; público sem edição: `FORBIDDEN`; não participante: `CAMPAIGN_NOT_FOUND`.

Escritas travam a campanha (`lockById`) e releem participação protegida; **salvar o corpo de uma aba** trava só a linha da aba (`DocumentTabsDao.lockById`, `FOR NO KEY UPDATE`, pelo `tabLockedAccess`), então não espera as barras e condições dos personagens (que seguram a linha da campanha). Dois corpos da mesma aba seguem em série (o 2º lê a versão nova e leva `DOCUMENT_VERSION_CONFLICT`); a escrita estrutural da aba e a exclusão do documento (cascata) esperam o corpo na linha; mover, renomear ou administrar o documento não espera. Comparação de versão, conteúdo, donos, referências e recibo ocorrem na mesma transação. Recibo só é publicado/confirmado depois do commit. IDs iguais com pedido diferente dão `DOCUMENT_ACTION_REUSED`; pedido igual reautoriza a leitura e retorna o recibo com o estado atual, sem nova publicação. Versão divergente dá `DOCUMENT_VERSION_CONFLICT`, sem gravar. Nenhum I/O de imagem/S3 fica sob trava.

## Rotas

Sob `/api/campaigns/:campaignId/documents`, autenticadas:

| Método e sufixo                                     | Resultado                                                      |
| --------------------------------------------------- | -------------------------------------------------------------- |
| POST raiz                                           | 201 `{document,receipt}`; mestre cria oculto com a aba "Geral" |
| GET `/:documentId`                                  | 200 `{document}` com `tabs` (resumos visíveis, sem corpo)      |
| PATCH `/:documentId/content`                        | `{actionId,expectedVersion,name}`: renomeia (mestre ou dono)   |
| PATCH `/:documentId/preview`                        | `updateDocumentPreviewRequestDto`: a prévia (mestre ou dono)   |
| PATCH `/:documentId`                                | pasta/visibilidade/donos de mestre; versão esperada            |
| DELETE `/:documentId`                               | 204; mestre; versão esperada e actionId no corpo               |
| `/:documentId/tabs…`                                | abas: tabela de rotas em [abas.md](abas.md)                    |
| POST `/:documentId/tabs/:tabId/images`              | arquivo cru; 201 `{asset}` preparado naquela aba               |
| POST `/:documentId/tabs/:tabId/images/import`       | `{url}`; 201 `{asset}`                                         |
| POST `/:documentId/tabs/:tabId/images/from-library` | `{imageId}`; 201 `{asset}`                                     |

JSON limitado a 1 MiB; arquivos 20 MiB. Erros de contrato são 400, conflito/reutilização/última aba 409, teto de abas 422, permissão 403 e inexistente 404 (`DOCUMENT_NOT_FOUND`, `DOCUMENT_TAB_NOT_FOUND`, `DOCUMENT_ASSET_NOT_FOUND`). Params inválidos usam 404. Respostas de documento/aba/agregado usam `private, no-store`. `library:changed` leva só campanha e horário; não transmite título, posse ou corpo privado. Salvar o corpo de uma aba publica `document:tabChanged` (ids e versão da aba), não `library:changed`.

O agregado `LibraryImageService.list` consulta resumos sem corpo e donos em lote no snapshot, aplica `DocumentAccessBo` e une os ancestrais com grids e imagens (o resumo não leva abas). `GET /scenes` mantém o contrato anterior.
