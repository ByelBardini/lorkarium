# Imagens e apresentação

Imagens são itens próprios da campanha nas mesmas scene_folders, sem grid. Mestre cadastra, organiza, publica e apresenta; jogador/espectador consulta apenas imagens públicas. Apresentar não publica o item nem revela sua pasta.

## Persistência e concorrência

Migração `0067_amazing_reavers.sql`: enum asset_purpose recebe library_image; assets ganha índice único (campaign_id,id). library_images guarda id, campaign_id, folder_id nullable, asset_id, name, visibility privada por padrão e timestamps. CHECK nome 1–60; unicidade asset_id e (campaign_id,id); FKs compostas de campanha/pasta e campanha/asset. SQL ajusta SET NULL (folder_id).

library_image_presentations tem PK campaign_id, version >=0, presentation_id/image_id/name_at_presentation preenchidos juntos ou todos nulos, changed_at e FK composta de imagem. A linha/version ficam após excluir a imagem atual. Ausência equivale à versão 0/nula.

LibraryImageService cuida do CRUD/agregado; ImagePresentationService do snapshot/apresentar. editLibraryImages autoriza mestre e trava campanha antes de ler/alterar, serializando cadastro, edição, pasta, apresentação e exclusão. Excluir pasta move imagens ao pai dentro da transação existente. Snapshot, agregado e autorização de bytes usam runInSnapshot (repeatable read/read only).

Cada clique recebe ID novo e soma versão, mesmo repetindo imagem. Nome capturado no clique; renomear/mover/publicar não altera a apresentação. Excluir a atual grava null/versão+1 antes de apagar. Commit sempre antecede publicação; rollback não publica.

## HTTP e eventos

Prefixo /api, cookie autenticado e autor da sessão, corpo estrito pelos DTOs.

| Rota                                                              | Resultado                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| GET /campaigns/:campaignId/library                                | Agregado activeSceneId/folders/scenes/images autorizado |
| POST /campaigns/:campaignId/library-images                        | Mestre; name/assetId/folderId?/visibility?; 201         |
| PATCH /campaigns/:campaignId/library-images/:imageId              | Mestre; name/folderId/visibility, ao menos uma chave    |
| DELETE /campaigns/:campaignId/library-images/:imageId             | Mestre; 204, limpa apresentação atual atomicamente      |
| GET /campaigns/:campaignId/image-presentation                     | Leitor, espectador incluso; snapshot                    |
| POST /campaigns/:campaignId/library-images/:imageId/presentations | Mestre; nova apresentação/versão                        |

Imagem DTO: id/name/folderId/visibility/asset/updatedAt. Asset contém só id/mimeType/width/height. Cadastro exige asset reservado da campanha, ainda não associado a outro item. Nenhum storageKey, ownerId ou URL externa na resposta.

Não membro: CAMPAIGN_NOT_FOUND 404; imagem inválida/outra campanha: LIBRARY_IMAGE_NOT_FOUND 404; pasta inválida: FOLDER_NOT_FOUND 404; jogador/espectador em mutação: FORBIDDEN 403; corpo inválido: INVALID_BODY 400. Reutilizar asset já associado recusa 404, sem publicação.

Snapshot: {campaignId,version,at,presentation:null|{id,imageId,name,asset}}. Evento library:imagePresentationChanged acrescenta eventId; SocketIoLibraryPublisher envia à sala campaign, independente do grid, incluindo espectadores. Mostrar não invalida biblioteca. Excluir a atual publica apresentação nula e library:changed após commit. Demais mutações publicam somente library:changed sem conteúdo privado.

GET /scenes preserva suas chaves estritas. Novo agregado reutiliza SceneLibraryBo.visibleTo com pastas adicionais das imagens públicas, unindo ancestrais antes de podar. Apresentação privada não revela ancestrais; exceção do grid ativo privado continua exclusiva dos grids.

## Arquivo e sigilo

library_image só é enviado/importado por mestre, autorizado antes do fetch/processamento. PNG/JPEG/WebP estáticos até 20 MiB e maior lado 4096 px, sem recorte; preserva proporção/alfa/orientação. GIF/SVG recusados. Usa processador/fetcher existentes.

AssetReadPolicyPort injetada pelo composition root mantém Assets independente da biblioteca. Sem política nega nova finalidade. LibraryImageReadPolicy lê coerentemente: mestre lê inclusive órfão; jogador/espectador lê item público ou imagem atualmente apresentada; resto é ASSET_NOT_FOUND. Substituição/exclusão revoga novas leituras da privada anterior; fechar local não altera acesso. Cache dedicado: private, no-store, também na rota genérica. Finalidades antigas mantêm cache imutável.

requireAssetsOf recusa dedicados em tokens/formas/auras/condições; fundo recusa no validador próprio; capa continua exigindo purpose cover. Sem exclusão física do S3, troca de arquivo ou cópia de imagem.

## Testes

Unit: BO de imagem/apresentação, mapper/service, transaction, policy, AssetsService (autorização antes do I/O/cache) e token-transaction. Fakes nomeados e diário lock/save/commit/publish.

Integração library-images.spec.ts: CRUD privado/público, bytes/cache, imagem órfã, permissões/isolamento, pastas mistas, exclusão da pasta preservando imagens, dimensão 5000×2500 para 4096×2048, GIF, referências reservadas e asset único. image-presentations.spec.ts: sockets mestre/jogador/espectador e campanha isolada, IDs/versões, nome capturado, substituição/revogação, reinício, exclusão, rollback por trigger e corrida apresentação/exclusão.

## Armadilhas

- Índice assets(campaign_id,id) precisa anteceder FK library_images_asset_fk; o SQL de criação precisa respeitar essa ordem.
- No PowerShell, argumentos SeaweedFS como '-ip.bind=0.0.0.0' exigem aspas ou o endereço vira .bind=0.0.0.0.
- Driver de camadas aponta policy fora de infrastructure; falso positivo: implementação de regra de domínio fica na biblioteca conforme plano, só orquestra DAOs/BO, sem lib externa.
- Driver testar aponta DAO/rotas sem unit espelho; cobertos pelas integrações HTTP/Postgres/sockets acima. Erros são provados nas recusas.

## Referências em documentos

O agregado contém documents, com resumos autorizados por DocumentAccessBo e ancestrais unidos aos demais itens. Um asset library_image também pode ser lido por referência autorizada em documento, mesmo após apagar o item da biblioteca; o vínculo aponta ao asset imutável. Preparações só abrem para editores, referências confirmadas para leitores autorizados. Ver [../documents/imagens.md](../documents/imagens.md).
