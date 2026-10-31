# Documentos — servidor

Hub: [../documents.md](../documents.md). Abas (tabela, regra, rotas): [abas.md](abas.md).

## Persistência

Migrações: `0068_document_image_purpose` (propósito reservado), `0069_library_documents` (quatro tabelas), `0070_document_tabs` (abas; o corpo sai do documento) e `0071_document_tab_assets` (imagem por aba).

- `library_documents`: campanha, pasta nullable, nome 1–60, visibilidade privada por padrão, versão não negativa, autor nullable e timestamps. Desde a `0070` **sem** `content`/`schema_version`: o corpo mora em `library_document_tabs` ([abas.md](abas.md)). Único `(campaign_id,id)` e índice campanha/pasta.
- `library_document_owners`: PK campanha/documento/usuário, FKs compostas para documento e participação da mesma campanha; remoção de participação apaga posse.
- `library_document_assets` (`document-assets.po.ts`): PK campanha/documento/asset/**aba**, FKs compostas para documento, aba (cascade) e asset; `in_content` distingue preparação e referência confirmada **daquela aba**. Índice campanha/asset.
- `library_document_actions`: PK campanha/usuário/actionId; operação, SHA256 canônico do pedido e recibo sem conteúdo. Não aponta ao documento para reconhecer uma exclusão repetida. Cascata pela campanha.

A FK composta da pasta usa `SET NULL (folder_id)`. O serviço de biblioteca move documentos ao pai na transação de exclusão de pasta, preservando conteúdo/donos e avançando versão. Exclusão da campanha remove tudo por cascata. Schema e `truncateAllTables` incluem as cinco tabelas.

## Serviços e transações

`DocumentsServiceDeps` (em `document-writes.service.ts`) recebe DAOs de leitura e compositores `transaction`/`snapshot`, relógio, gerador de IDs, `LibraryPublisherPort` e `tabLimit` (o plugin passa `DOCUMENT_TABS_MAX`). `DocumentWriteSteps`, no mesmo arquivo, guarda os passos comuns: `lockedAccess` (trava a mesa e relê a participação), `scopeOf` (linha + donos + `DocumentAccessBo`, exige leitura), `view` (o `DocumentDto` com as abas visíveis), `previous`/`record` (recibo), `bumpDocument` e `published` (só publica comando aplicado, depois do commit); `commandFingerprint` e `documentAssetIds` também moram lá.

- `DocumentsService`: criar (com a aba "Geral" vazia na mesma transação), ler, renomear (`PATCH …/content`, só `name`), administrar, excluir e as associações de imagem de uma aba (`authorizeEditor`, `associateAsset`, `associateLibraryAsset`, todas com `tabId`).
- `DocumentTabsService` ([abas.md](abas.md)): ler aba, criar, renomear/ocultar, reordenar, excluir e salvar corpo.

`createDocumentsModule` monta os DAOs por executor com `runInTransaction` e `runInSnapshot`; `build-app` registra o plugin sob `/api` e compõe a política de assets sem dependência de Documents em Assets.

`DocumentAccessBo` concentra leitura, edição, administração e comparação de versão; mapper projeta capacidades e só inclui donos para mestres. Posse só vale para jogador atual. ID privado inacessível/outra campanha: `DOCUMENT_NOT_FOUND`; público sem edição: `FORBIDDEN`; não participante: `CAMPAIGN_NOT_FOUND`.

Escritas travam a campanha (`lockById`) e releem participação protegida. Comparação de versão, conteúdo, donos, referências e recibo ocorrem na mesma transação. Recibo só é publicado/confirmado depois do commit. IDs iguais com pedido diferente dão `DOCUMENT_ACTION_REUSED`; pedido igual reautoriza a leitura e retorna o recibo com o estado atual, sem nova publicação. Versão divergente dá `DOCUMENT_VERSION_CONFLICT`, sem gravar. Nenhum I/O de imagem/S3 fica sob trava.

## Rotas

Sob `/api/campaigns/:campaignId/documents`, autenticadas:

| Método e sufixo                                     | Resultado                                                      |
| --------------------------------------------------- | -------------------------------------------------------------- |
| POST raiz                                           | 201 `{document,receipt}`; mestre cria oculto com a aba "Geral" |
| GET `/:documentId`                                  | 200 `{document}` com `tabs` (resumos visíveis, sem corpo)      |
| PATCH `/:documentId/content`                        | `{actionId,expectedVersion,name}`: renomeia (mestre ou dono)   |
| PATCH `/:documentId`                                | pasta/visibilidade/donos de mestre; versão esperada            |
| DELETE `/:documentId`                               | 204; mestre; versão esperada e actionId no corpo               |
| `/:documentId/tabs…`                                | abas: tabela de rotas em [abas.md](abas.md)                    |
| POST `/:documentId/tabs/:tabId/images`              | arquivo cru; 201 `{asset}` preparado naquela aba               |
| POST `/:documentId/tabs/:tabId/images/import`       | `{url}`; 201 `{asset}`                                         |
| POST `/:documentId/tabs/:tabId/images/from-library` | `{imageId}`; 201 `{asset}`                                     |

JSON limitado a 1 MiB; arquivos 20 MiB. Erros de contrato são 400, conflito/reutilização/última aba 409, teto de abas 422, permissão 403 e inexistente 404 (`DOCUMENT_NOT_FOUND`, `DOCUMENT_TAB_NOT_FOUND`, `DOCUMENT_ASSET_NOT_FOUND`). Params inválidos usam 404. Respostas de documento/aba/agregado usam `private, no-store`. `library:changed` leva só campanha e horário; não transmite título, posse ou corpo privado.

O agregado `LibraryImageService.list` consulta resumos sem corpo e donos em lote no snapshot, aplica `DocumentAccessBo` e une os ancestrais com grids e imagens (o resumo não leva abas). `GET /scenes` mantém o contrato anterior.
