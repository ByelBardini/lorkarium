# Documentos — servidor

Hub: [../documents.md](../documents.md).

## Persistência

Migrações geradas: `0068_document_image_purpose` acrescenta o propósito reservado antes do seu uso; `0069_library_documents` cria quatro tabelas.

- `library_documents`: campanha, pasta nullable, nome 1–60, visibilidade privada por padrão, JSONB, schema 1, versão não negativa, autor nullable e timestamps. Único `(campaign_id,id)` e índice campanha/pasta; não há índice no corpo.
- `library_document_owners`: PK campanha/documento/usuário, FKs compostas para documento e participação da mesma campanha; remoção de participação apaga posse.
- `library_document_assets`: PK campanha/documento/asset, FKs compostas; `in_content` distingue preparação e referência confirmada. Índice campanha/asset.
- `library_document_actions`: PK campanha/usuário/actionId; operação, SHA256 canônico do pedido e recibo sem conteúdo. Não aponta ao documento para reconhecer uma exclusão repetida. Cascata pela campanha.

A FK composta da pasta usa `SET NULL (folder_id)`. O serviço de biblioteca move documentos ao pai na transação de exclusão de pasta, preservando conteúdo/donos e avançando versão. Exclusão da campanha remove as quatro tabelas por cascata. Schema e truncamento de testes incluem todas.

## Serviços e transações

`DocumentsService` recebe DAOs de leitura e compositores `transaction`/`snapshot`, relógio, gerador de IDs e `LibraryPublisherPort`. `createDocumentsModule` monta os DAOs por executor com `runInTransaction` e `runInSnapshot`; `build-app` registra plugin sob `/api` e compõe política de assets sem dependência de Documents em Assets.

`DocumentAccessBo` concentra leitura, edição, administração e comparação de versão; mapper projeta capacidades e só inclui donos para mestres. Posse só vale para jogador atual. ID privado inacessível/outra campanha: `DOCUMENT_NOT_FOUND`; público sem edição: `FORBIDDEN`; não participante: `CAMPAIGN_NOT_FOUND`.

Escritas travam campanha (`lockById`) e releem participação protegida. A comparação de versão, conteúdo, donos, referências e recibo ocorre na mesma transação. Recibo só é publicado/confirmado depois do commit. IDs iguais com pedido diferente dão `DOCUMENT_ACTION_REUSED`; pedido igual reautoriza e retorna recibo com snapshot atual, sem nova publicação. Versão divergente dá `DOCUMENT_VERSION_CONFLICT`, sem gravar. Nenhum I/O de imagem/S3 fica sob trava.

## Rotas

Sob `/api/campaigns/:campaignId/documents`, autenticadas:

| Método e sufixo                         | Resultado                                           |
| --------------------------------------- | --------------------------------------------------- |
| POST raiz                               | 201 `{document,receipt}`; mestre cria oculto vazio  |
| GET `/:documentId`                      | 200 `{document}` autorizado                         |
| PATCH `/:documentId/content`            | nome/conteúdo de mestre ou dono; versão esperada    |
| PATCH `/:documentId`                    | pasta/visibilidade/donos de mestre; versão esperada |
| DELETE `/:documentId`                   | 204; mestre; versão esperada e actionId no corpo    |
| POST `/:documentId/images`              | arquivo cru; 201 `{asset}`                          |
| POST `/:documentId/images/import`       | `{url}`; 201 `{asset}`                              |
| POST `/:documentId/images/from-library` | `{imageId}`; 201 `{asset}`                          |

JSON limitado a 1 MiB; arquivos 20 MiB. Erros de contrato são 400, conflito/reutilização 409, permissão 403 e inexistente 404. Params inválidos usam 404. Respostas de documento/agregado usam `private, no-store`. `library:changed` leva só campanha e horário; não transmite título, posse ou corpo privado.

O agregado `LibraryImageService.list` consulta resumos sem corpo e donos em lote no snapshot, aplica `DocumentAccessBo` e une os ancestrais com grids e imagens. `GET /scenes` mantém o contrato anterior.
