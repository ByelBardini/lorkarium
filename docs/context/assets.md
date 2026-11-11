# Assets

As imagens da mesa: fundos, tokens, capas, condições, auras e itens da biblioteca. O server guarda o arquivo num S3 compatível (§4.3) e serve pela mesma origem. DTOs em [`contracts.md`](contracts.md) (Assets).

## Contrato (prefixo `/api`, todas exigem sessão)

| Rota                                                                                                               | Entrada                                                                                                                       | Saída                                                                                                                                       | Erros                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /campaigns/:campaignId/assets?purpose=token\|background\|cover\|condition\|aura\|library_image\|library_map` | o **próprio arquivo** no corpo, `Content-Type` `image/png`, `image/jpeg`, `image/webp` ou `image/gif` (`uploadAssetQueryDto`) | 201 `assetResponseDto`                                                                                                                      | 401 · 404 `CAMPAIGN_NOT_FOUND` · 400 `INVALID_BODY` (purpose) · 415 `UNSUPPORTED_IMAGE` (outro tipo) · 422 `UNSUPPORTED_IMAGE` (não decodifica; GIF fora da `aura`; GIF da `aura` acima de 120 quadros) · 413 `ASSET_TOO_LARGE` · 429 `RATE_LIMITED` |
| `POST /campaigns/:campaignId/assets/import`                                                                        | `importAssetRequestDto` `{ url, purpose }`                                                                                    | 201 `assetResponseDto`                                                                                                                      | 401 · 404 · 400 `INVALID_BODY` (esquema, tamanho) · 422 `LINK_BLOCKED` / `LINK_UNREACHABLE` / `LINK_NOT_IMAGE` · 413 · 429                                                                                                                           |
| `GET /assets/:assetId`                                                                                             | `assetIdParamsDto`                                                                                                            | 200 com os bytes, `Content-Type` do registro, `Content-Length`, `Cache-Control` por finalidade (abaixo) e `X-Content-Type-Options: nosniff` | 401 · 404 `ASSET_NOT_FOUND`                                                                                                                                                                                                                          |
| `GET /assets/:assetId/outline`                                                                                     | `assetIdParamsDto`                                                                                                            | 200 `assetOutlineResponseDto` (`null` = sem contorno, `[]` = toda transparente), com o mesmo `Cache-Control` imutável e sem abrir o S3      | 401 · 404 `ASSET_NOT_FOUND`                                                                                                                                                                                                                          |

- `assets.routes.ts` (`assetsRoutes(service)`): parser de corpo cru (`parseAs: 'buffer'`) **só** para os quatro tipos do `ASSET_MIME_TYPES`, no escopo do plugin; `bodyLimit` de 20 MiB só na rota de envio (o Fastify recusa com `FST_ERR_CTP_BODY_TOO_LARGE` → 413 `ASSET_TOO_LARGE`; tipo sem parser na rota de envio → `FST_ERR_CTP_INVALID_MEDIA_TYPE` → 415 `UNSUPPORTED_IMAGE`).
- Nas duas rotas de envio a guarda roda no **`onRequest`** (quem não tem sessão é recusado antes de o corpo de 20 MiB ser lido) e o `@fastify/rate-limit` no `preParsing` (depois da guarda, então a chave é o usuário; antes de ler o corpo): 20 por minuto por usuário e por rota → `AssetRateLimitedError` (`RATE_LIMITED`, `retryAfterSeconds`).
- **GIF (mudança de contrato da `0057`):** o `image/gif` ganhou parser, então um GIF de outra finalidade não é mais 415 pelo tipo: é decodificado e o processador o recusa, **422** `UNSUPPORTED_IMAGE` (mensagem pública "The file is not a PNG, JPEG or WebP image (GIF only for an aura)"). Só a `aura` guarda GIF, e animado.
- Id malformado na URL dá 404 (`CAMPAIGN_NOT_FOUND` ou `ASSET_NOT_FOUND`), igual a um id de outra mesa. Mensagem pública fixa por código; a interna (link, endereço, id) só vai ao log.
- O asset é servido pelo server, na mesma origem: sem CORS no WebGL e com o cookie de sessão valendo. O conteúdo de um id nunca muda: finalidades comuns usam `private, max-age=31536000, immutable`; as protegidas (`library_image`, `document_image`, `library_map`, `sheet_image`) usam `private, no-store`, pois sua autorização pode mudar.
- `assets.plugin.ts` — `createAssetsModule({ db, storage, processor, fetcher, readPolicy? })` → `{ plugin, service }` (`newId` = `randomUUID`); o `buildApp` monta `SharpImageProcessor` e `GuardedImageFetcher` e o registra sob `/api` depois do health.

## Tabela e DAO (`server/drizzle/0010_assets.sql`)

- `assets` (`assets.po.ts`, exportada no `schema.ts` com os enums): `id` uuid, `campaign_id` → `campaigns` **cascade** (indexado), `owner_id` → `users` **set null** (quem enviou; a imagem fica com a mesa), `purpose` enum `asset_purpose` (`background` | `token` | `cover` | `condition` | `aura` | `library_image`; `cover` da `0048_campaign_settings.sql`: a capa da mesa, lado máximo 1600 px pelo `ASSET_MAX_SIDE`; o `PATCH /campaigns/:id` só aceita como capa um asset da mesma mesa com `purpose = cover`, ver `campaigns.md`; `condition` da `0055_condition_image_purpose.sql`, só o `ALTER TYPE … ADD VALUE`: a imagem da condição, **quadrada** de até 256 px; `aura` da `0057_aura_asset_purpose.sql`: a imagem da aura do token, até 512 px, GIF animado guardado; `library_map` da `0091_library_maps.sql` e `sheet_image` da `0097_sheet_images.sql`, abaixo), `mime_type` enum `asset_mime_type` (`image/png` | `image/jpeg` | `image/webp` | `image/gif`, este também da `0057`, só usado pela `aura`; enum do banco porque o PO não importa o DTO), `size_bytes`, `width`, `height` (do arquivo **normalizado**), `storage_key` (**único**, `assets/<uuid>`), `sight_outline` (`jsonb` nulo da `0080_asset_sight_outline.sql`, ver [`assets/contorno.md`](assets/contorno.md)), `created_at`.
- `AssetsDao(db | tx)`: `insert`, `findById` (só para quem confere a participação depois), `findInCampaign(campaignId, id)` e `findManyInCampaign(campaignId, ids)` (o id de outra mesa não acha nada: critério 14) e `outlinesOf(campaignId, ids)` (mapa de id → contorno, com o mesmo filtro; sem ids, sem consulta). Fora de requisição, só para o `pnpm db:recompress-images` (ver `server/scripts.md`): `listPngImages()` (todas as mesas) e `updateKeptImage(id, { mimeType, sizeBytes, width, height })`.
- `assets` entra no `truncateAllTables` (`server/test/support/test-database.ts`).

## Regra e service

- `asset-upload.bo.ts` — `resizeFor(purpose, limites)` → `AssetResize { maxSide, square }` (`square` só na `condition`: o tabuleiro preenche o círculo do badge com a textura, e quadrada ela dispensa máscara, que quebraria o lote da GPU), `animationFor(purpose, AURA_ANIMATION_LIMITS)` → o orçamento só na `aura`, `null` nas outras (o service então não passa `animation` e o GIF é recusado), `outlineFor(purpose)` (só `token`), `opaqueAsWebpFor(purpose)` (só `background`, `library_image` e `library_map`: o processador recebe `opaqueAsWebp`) e `requireSize(bytes, limite)` → `AssetTooLargeError` citando o tamanho e o limite. Os limites (`ASSET_MAX_SIDE`, `ASSET_MAX_BYTES`) entram por parâmetro: o BO não importa o DTO (o service os passa). `AssetPurpose` vem do PO.
- `assets.mapper.ts` — `storageKeyOf(id)` (`assets/<id>`), `toNewAssetPo({ assetId, campaignId, ownerId, purpose, image })` (tipo, bytes e pixels **normalizados**) e `toAssetDto(row)` (sem chave nem dono).
- `AssetsService({ members, assets, storage, processor, fetcher, newId })`:
  - `upload(userId, campaignId, { bytes, purpose })`: participação (`memberAccessOf`: fora da mesa → `CAMPAIGN_NOT_FOUND`) → `requireSize` (antes de decodificar) → `normalize(bytes, keptAs(purpose))` (`resizeFor` + o `animation` do `animationFor`, só quando há) → `put('assets/<id>')` → `insert` → `AssetDto`. **O objeto vai ao S3 antes da linha**: linha sem objeto quebraria a mesa, objeto sem linha é só lixo (limpeza fora do escopo).
  - `importLink(userId, campaignId, { url, purpose })`: participação → `fetcher.fetch` → `requireSize` → `normalize` (a recusa do processador vira `LINK_NOT_IMAGE`: o link da página de busca do Google responde HTML) → o mesmo `keep`.
  - `open(userId, assetId)` → `{ body, size, mimeType }` (o tipo é o do **registro**): linha inexistente, mesa de que o usuário não é membro e objeto sumido do S3 dão o **mesmo** `ASSET_NOT_FOUND` (critério 14). O espectador lê como jogador (qualquer participação abre); enviar e importar exigem `memberAccessOf` e o espectador recebe 403 `FORBIDDEN` (o `replyWithApiError` traduz o `FORBIDDEN` do `campaigns`).
  - `outlineOf(userId, assetId)` → `{ outline }`, sob a mesma guarda do `open`, sem abrir o objeto.
- Erros (`assets.error.ts`, todos `AssetError` com `code`): `ASSET_NOT_FOUND`, `UNSUPPORTED_IMAGE`, `ASSET_TOO_LARGE`, `LINK_BLOCKED`, `LINK_UNREACHABLE`, `LINK_NOT_IMAGE`.

## Armazenamento (`AssetStoragePort`)

- `server/src/modules/assets/asset-storage.port.ts` — `AssetStoragePort { ensureBucket(), put(key, bytes, contentType), open(key) → StoredObject | null, remove(key) }`; `StoredObject` = `{ body: Readable, size, contentType }` (o corpo vai em fluxo para a resposta). A chave é sempre `assets/<uuid>` (ou `avatars/<uuid>`, as fotos de perfil no mesmo bucket, ver `profiles.md`), nunca o nome do arquivo (§8.5). `remove` é idempotente: hoje só o perfil apaga (trocar ou tirar a foto); asset da mesa não é apagado.
- Adaptador `server/src/infrastructure/asset-storage/s3-asset-storage.ts` (`S3AssetStorage`, sobre `@aws-sdk/client-s3`), montado com o `env.storage` (`StorageConfig`, ver `server.md`). Serve para SeaweedFS, MinIO, R2 e AWS: só a env muda.
  - `ensureBucket` faz `HeadBucket` e, no 404, `CreateBucket` (idempotente; `BucketAlreadyOwnedByYou` é ignorado). O pedido sai de `createBucketInput(bucket, region)`: em `us-east-1` (o padrão do `S3_REGION`, e o que SeaweedFS e R2 usam) vai só `{ Bucket }`, porque a AWS recusa `us-east-1` explícito; em qualquer outra região leva `CreateBucketConfiguration.LocationConstraint` com a região, que a AWS exige fora de `us-east-1`.
  - Na AWS, o usuário IAM precisa de `s3:ListBucket` no bucket: é a permissão do `HeadBucket` do boot. Sem ela a resposta é 403, vira `AssetStorageError` no `onReady` e **o app não sobe**. Com uma política mínima sem `s3:CreateBucket`, o bucket tem que ser criado à mão no console (na região do `S3_REGION`) antes do primeiro boot.
  - `open` de chave inexistente (`NoSuchKey`/404) → `null`.
  - `remove` é um `DeleteObject`; o S3 responde 204 também para chave inexistente (e um 404 é engolido), então apagar duas vezes não falha.
  - Qualquer outra falha vira `AssetStorageError` citando a operação, o bucket e o endpoint, com o nome do erro e o status HTTP, **nunca** a chave secreta.
  - `requestChecksumCalculation`/`responseChecksumValidation` em `WHEN_REQUIRED`: o CRC32 padrão do SDK novo não é aceito por todo S3 compatível.
  - `destroy()` fecha os sockets do cliente.
- No `buildApp` (`wireAssetStorage`): um `S3AssetStorage` por app; `onReady` → `ensureBucket()` (dev, CI e integração ganham o bucket sozinhos, antes da primeira requisição) e `onClose` → `destroy()`.

## Tratamento da imagem (`ImageProcessorPort`)

- `server/src/modules/assets/image-processor.port.ts` — `normalize(bytes, NormalizeOptions { maxSide, square?, animation?, outline?, opaqueAsWebp? }) → NormalizeOutcome`: `{ ok: true, image: NormalizedImage { bytes, mimeType, width, height, outline } }` ou `{ ok: false, refusal: ImageRefusal { reason: not-an-image | format | too-many-pixels | too-many-frames, detail } }`. `animation` é o `AnimationBudget { maxFrames, maxDecodedPixels }`: só com ele o GIF entra (e fica animado). **A recusa é valor, nunca exceção**: o adaptador em `infrastructure/` não importa o `assets.error.ts`; o service a traduz (`UnsupportedImageError(detail)` no envio, `LinkNotImageError(url)` no link). O tipo e o tamanho que valem são os **de saída**.
- Adaptador `server/src/infrastructure/image-processor/sharp-image-processor.ts` (`SharpImageProcessor({ maxInputPixels? })`, sobre `sharp`):
  - O formato sai dos bytes (`metadata().format`), nunca da extensão nem do `Content-Type`. Sem orçamento de animação, só `png`, `jpeg` e `webp` ficam; GIF e **SVG** (que o `sharp` renderizaria, e que pode levar script) → recusa `format` citando o formato e "expected png, jpeg or webp". Com orçamento o GIF também fica, e as recusas citam "expected png, jpeg, webp or gif"; o SVG segue recusado.
  - Bytes que não decodificam (HTML, texto) → recusa `not-an-image` ("the 200 bytes do not decode as an image").
  - Bomba de descompressão: largura × altura acima de `maxInputPixels` (padrão 100 MP; o spec passa 1 000) → recusa `too-many-pixels` citando os pixels e o limite, antes de decodificar.
  - `autoOrient()` (a orientação do EXIF vira pixel), `resize` `inside` até `maxSide` sem ampliar — com `square`, recorte central `cover` de lado = menor entre largura, altura e `maxSide` (nunca amplia: 200 × 100 → 100 × 100) —, e regrava no **mesmo formato** (PNG mantém o alfa; JPEG e WebP com qualidade 90). Com `opaqueAsWebp` (fundo, `library_image` e `library_map`), a imagem **opaca** sai **WebP q85**: o JPEG sempre, o PNG quando o `stats().isOpaque` diz que nenhum pixel é transparente (um RGBA todo sólido também vira WebP); PNG com transparência continua PNG e WebP continua WebP (q90). O `mimeType` devolvido é o de saída, e é ele que o service grava no S3 e na linha. O `sharp` não copia metadado na saída: EXIF (GPS), ICC e o que vier depois do fim do arquivo (carga após o `IEND`) somem.
  - **GIF animado** (só com `animation`, hoje só a finalidade `aura`): antes de decodificar, o `framesWithin` de `server/src/infrastructure/sharp-frames.ts` (comum com o avatar, ver `profiles.md`) recusa quadros acima de `maxFrames` (`too-many-frames`, "the image has 121 frames; expected at most 120 frames") e largura × altura do quadro × quadros acima de `maxInputPixels` (`too-many-pixels`, "… pixels across N frames"). O caminho animado mora em `animated-gif.ts` (`keptAnimatedGif`): `sharp(bytes, { animated: true, limitInputPixels })`, sem `autoOrient` (GIF não tem EXIF), lado = menor entre `maxSide` e ⌊√(`maxDecodedPixels` / quadros)⌋ (100 quadros com 16 MP → 400 px: o GIF longo perde resolução, nunca quadro), `resize` `inside` sem ampliar e `.gif()`, que mantém os atrasos e o laço. `width`/`height` são os do **quadro** (`pageHeight`), não da tira.
  - Fora o GIF, animação sai parada: sem `animated` o `sharp` lê só o 1º quadro, então um WebP animado ou APNG é regravado com uma página, com ou sem orçamento.
  - **Contorno:** com `outline: true`, o alfa da saída normalizada vira `outline` por `alpha-outline.ts` (grade de até 128 × 128, _marching squares_, redução a 48 vértices); sem o pedido, `null`. Detalhe em [`assets/contorno.md`](assets/contorno.md).
- `assets.error.ts` — `AssetError` (com `code`) e `UnsupportedImageError(detail)` (`UNSUPPORTED_IMAGE`, com as palavras do processador).
- O `sharp` 0.35 instala o binário por pacote opcional (`@img/sharp-*`), sem script de build: o `allowBuilds` do `pnpm-workspace.yaml` não precisou mudar. O `tsdown` o deixa externo (é dependência).

## Link (`ImageFetcherPort`)

O server baixa o link e guarda a imagem como um envio, com a defesa de SSRF no `lookup` do socket: porta, política de endereços, limites e recusas em [`assets/link.md`](assets/link.md).

## Contorno da imagem

A finalidade `token` traça a silhueta do alfa no envio (coluna `sight_outline`, rota `GET /assets/:assetId/outline`): formato, algoritmo, leitura e testes em [`assets/contorno.md`](assets/contorno.md).

## Imagens da biblioteca

Finalidade library_image reservada: PNG/JPEG/WebP estáticos, até 20 MiB e lado máximo de 4096 px sem recorte. Só mestre envia/importa, autorizado antes do fetch/processamento; jogador/espectador recebe 403 `FORBIDDEN`. Não pode virar token, forma, aura, condição, fundo ou capa.

AssetsService recebe AssetReadPolicyPort; ausência nega a finalidade. Política da biblioteca usa snapshot coerente: mestre lê inclusive órfão; jogador/espectador só público ou apresentação atual. Cache dedicado private, no-store; demais finalidades conservam cache imutável. Substituir/excluir apresentação revoga novas leituras da privada anterior. Detalhe e provas: [library/images.md](library/images.md).

Unit assets.service inclui AssetReadPolicyFake e guarda antes de I/O; policy cobre mestre/privado/público/apresentação; library-images/image-presentations integram bytes/cache/Postgres/S3 reais.

## S3 local (SeaweedFS)

- `infra/compose/compose.yaml` sobe `chrislusf/seaweedfs:4.48` (o MinIO comunitário foi descontinuado) com só a 8333 (S3) publicada, volume `seaweedfs-data` e healthcheck no `/healthz`. A identidade de dev (`lorkarium` / `lorkarium-dev-secret`, com Admin/Read/Write/List/Tagging) está em `infra/compose/seaweedfs/s3.json`.
- Comando: `server -dir=/data -ip.bind=0.0.0.0 -master.volumeSizeLimitMB=64 -volume.max=200 -s3 -s3.config=… -s3.port=8333`.
- Integração: o SeaweedFS descartável da receita do `/testar` (porta 8334, `--tmpfs`, bucket `lorkarium-test`). CI: a action `.github/actions/seaweedfs` (ver `ci.md`).

## Testes

Specs de integração, unit, DAO, armazenamento, processador e link, com os fakes de `test/support/assets-fakes.ts`: [`assets/testes.md`](assets/testes.md).

## Armadilhas

- **Adaptador não conhece módulo.** `src/infrastructure/` só importa **tipos** de `src/modules/` (a porta); lançar o erro de domínio de dentro do adaptador é seta proibida (o driver do `/desenvolver-server` acusa `transversal-conhece-modulo`). A porta devolve a recusa como valor e o service a traduz.

- **Conferir o host por texto não protege de SSRF.** `evil.example` pode resolver para 127.0.0.1, um redirect pode levar para 169.254.169.254 e o DNS pode mudar entre a conferência e a conexão (rebinding). A conferência mora no `lookup` do socket (o IP conferido é o conectado), em cada salto, e o IP literal é conferido à parte porque o Node não chama `lookup` para ele.

- SeaweedFS cria uma _collection_ por bucket e reserva volumes para ela. Com os padrões (volume de 30 GB, limite de volumes pelo disco livre), um tmpfs pequeno não tem volume livre e o `PutObject` num bucket novo dá `InternalError` 500 ("No writable volumes and no free volumes left"). Por isso `-master.volumeSizeLimitMB=64 -volume.max=200` no compose, na action do CI e na receita.

## Imagens de documentos

A migração 0068 acrescenta document_image, reservado a endpoints de documentos: PNG/JPEG/WebP estáticos, até 20 MiB e 4096 px. Rotas genéricas recusam antes de I/O; outros usos (fundo/token/aura/condição/capa) também recusam. A política de leitura composta permite referência autorizada em documento para document_image e library_image; sem política, nega ambos. Bytes usam private, no-store. Detalhe: [documents/imagens.md](documents/imagens.md).

## Imagens de mapas

Finalidade `library_map`: PNG/JPEG/WebP estáticos, até 20 MiB e **8192 px** de lado, sem recorte (mapa é feito para dar zoom). Só o mestre envia ou importa (403 `FORBIDDEN` antes do fetch e do processamento) e não vira token, forma, aura, condição, fundo nem capa.

A leitura passa por `LibraryMapReadPolicy` (`library-maps/`), sem cair nas políticas de imagem e de documento: em snapshot, acha o mapa pelo asset e pergunta ao `LibraryMapAccessBo.canSee` (mestre, Principal ou público). Asset ainda sem mapa, só o mestre. Bytes em `private, no-store`: deixar de ser Principal revoga a leitura seguinte. `isProtectedAssetPurpose` e `isMasterOnlyAssetPurpose`, em `asset-upload.bo.ts`, são a lista única dessas finalidades.

## Imagens da ficha

Finalidade `sheet_image` (`0097_sheet_images.sql`, o `ALTER TYPE … ADD VALUE` junto da tabela `sheet_assets`): PNG/JPEG/WebP estáticos, até 20 MiB e 4096 px, sem recorte. Só entra por `POST /campaigns/:c/sheets/:s/images` (quem **edita** a ficha; ver [`sheets/server.md`](sheets/server.md)); a rota genérica (`upload` e `import`) a recusa com `FORBIDDEN` antes de qualquer I/O, pela mesma `dedicatedEndpointOf` (`asset-upload.bo.ts`) que barra a `document_image`. É protegida (`isProtectedAssetPurpose`): `private, no-store` e não vira token, fundo, forma, aura, condição nem capa.

A leitura cai **só** na `SheetAssetReadPolicy` (sem passar pelas políticas da biblioteca e do documento, que deixariam o mestre ler uma órfã): lê quem lê alguma ficha a que a imagem foi associada (`SheetAccessBo.canRead`). Sem associação (ficha excluída, ou a associação nunca gravada), ninguém lê, nem o mestre.

## Fontes e imagens do modelo de ficha

Finalidade `sheet_template_asset` (`0100_sheet_template_assets`, que também soma `font/woff2` ao `asset_mime_type`): imagem PNG/JPEG/WebP estática até 4096 px **ou** fonte WOFF2 guardada como veio (assinatura `wOF2`, até 2 MiB, 0 × 0 px). Só entra por `POST /campaigns/:c/sheet-template-assets` (mestre); a rota genérica a recusa (`dedicatedEndpointOf`), é mestre-só e protegida (`private, no-store`). Lê o mestre e quem lê uma ficha de um modelo que a declara (`SheetTemplateAssetReadPolicy`). Detalhe: [`sheets/arquivos.md`](sheets/arquivos.md).
