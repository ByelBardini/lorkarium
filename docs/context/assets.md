# Assets

As imagens da mesa: o fundo da cena e a imagem do token. O server guarda o arquivo num S3 compatível (§4.3) e serve pela mesma origem. Plano de origem: `docs/plans/2026-10-17-imagens-e-direcao-do-token.md`. DTOs em [`contracts.md`](contracts.md) (Assets).

## Contrato (prefixo `/api`, todas exigem sessão)

| Rota                                                                  | Entrada                                                                                                          | Saída                                                                                                                                                     | Erros                                                                                                                                                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /campaigns/:campaignId/assets?purpose=token\|background\|cover` | o **próprio arquivo** no corpo, `Content-Type` `image/png`, `image/jpeg` ou `image/webp` (`uploadAssetQueryDto`) | 201 `assetResponseDto`                                                                                                                                    | 401 · 404 `CAMPAIGN_NOT_FOUND` · 400 `INVALID_BODY` (purpose) · 415 `UNSUPPORTED_IMAGE` (outro tipo) · 422 `UNSUPPORTED_IMAGE` (não decodifica) · 413 `ASSET_TOO_LARGE` · 429 `RATE_LIMITED` |
| `POST /campaigns/:campaignId/assets/import`                           | `importAssetRequestDto` `{ url, purpose }`                                                                       | 201 `assetResponseDto`                                                                                                                                    | 401 · 404 · 400 `INVALID_BODY` (esquema, tamanho) · 422 `LINK_BLOCKED` / `LINK_UNREACHABLE` / `LINK_NOT_IMAGE` · 413 · 429                                                                   |
| `GET /assets/:assetId`                                                | `assetIdParamsDto`                                                                                               | 200 com os bytes, `Content-Type` do registro, `Content-Length`, `Cache-Control: private, max-age=31536000, immutable` e `X-Content-Type-Options: nosniff` | 401 · 404 `ASSET_NOT_FOUND`                                                                                                                                                                  |

- `assets.routes.ts` (`assetsRoutes(service)`): parser de corpo cru (`parseAs: 'buffer'`) **só** para os três tipos, no escopo do plugin; `bodyLimit` de 20 MiB só na rota de envio (o Fastify recusa com `FST_ERR_CTP_BODY_TOO_LARGE` → 413 `ASSET_TOO_LARGE`; tipo sem parser na rota de envio → `FST_ERR_CTP_INVALID_MEDIA_TYPE` → 415 `UNSUPPORTED_IMAGE`).
- Nas duas rotas de envio a guarda roda no **`onRequest`** (quem não tem sessão é recusado antes de o corpo de 20 MiB ser lido) e o `@fastify/rate-limit` no `preParsing` (depois da guarda, então a chave é o usuário; antes de ler o corpo): 20 por minuto por usuário e por rota → `AssetRateLimitedError` (`RATE_LIMITED`, `retryAfterSeconds`).
- Id malformado na URL dá 404 (`CAMPAIGN_NOT_FOUND` ou `ASSET_NOT_FOUND`), igual a um id de outra mesa. Mensagem pública fixa por código; a interna (link, endereço, id) só vai ao log.
- O asset é servido pelo server, na mesma origem: sem CORS no WebGL e com o cookie de sessão valendo. O conteúdo de um id nunca muda (o cache `immutable` de um ano vale).
- `assets.plugin.ts` — `createAssetsModule({ db, storage, processor, fetcher })` → `{ plugin, service }` (`newId` = `randomUUID`); o `buildApp` monta `SharpImageProcessor` e `GuardedImageFetcher` e o registra sob `/api` depois do health.

## Tabela e DAO (`server/drizzle/0010_assets.sql`)

- `assets` (`assets.po.ts`, exportada no `schema.ts` com os enums): `id` uuid, `campaign_id` → `campaigns` **cascade** (indexado), `owner_id` → `users` **set null** (quem enviou; a imagem fica com a mesa), `purpose` enum `asset_purpose` (`background` | `token` | `cover`, este da `0048_campaign_settings.sql`: a capa da mesa, lado máximo 1600 px pelo `ASSET_MAX_SIDE`; o `PATCH /campaigns/:id` só aceita como capa um asset da mesma mesa com `purpose = cover`, ver `campaigns.md`), `mime_type` enum `asset_mime_type` (`image/png` | `image/jpeg` | `image/webp`; enum do banco porque o PO não importa o DTO), `size_bytes`, `width`, `height` (do arquivo **normalizado**), `storage_key` (**único**, `assets/<uuid>`), `created_at`.
- `AssetsDao(db | tx)`: `insert`, `findById` (só para quem confere a participação depois), `findInCampaign(campaignId, id)` e `findManyInCampaign(campaignId, ids)` (o id de outra mesa não acha nada: critério 14).
- `assets` entra no `truncateAllTables` (`server/test/support/test-database.ts`).

## Regra e service

- `asset-upload.bo.ts` — `maxSideFor(purpose, limites)` e `requireSize(bytes, limite)` → `AssetTooLargeError` citando o tamanho e o limite. Os limites (`ASSET_MAX_SIDE`, `ASSET_MAX_BYTES`) entram por parâmetro: o BO não importa o DTO (o service os passa). `AssetPurpose` vem do PO.
- `assets.mapper.ts` — `storageKeyOf(id)` (`assets/<id>`), `toNewAssetPo({ assetId, campaignId, ownerId, purpose, image })` (tipo, bytes e pixels **normalizados**) e `toAssetDto(row)` (sem chave nem dono).
- `AssetsService({ members, assets, storage, processor, fetcher, newId })`:
  - `upload(userId, campaignId, { bytes, purpose })`: participação (`memberAccessOf`: fora da mesa → `CAMPAIGN_NOT_FOUND`) → `requireSize` (antes de decodificar) → `normalize` → `put('assets/<id>')` → `insert` → `AssetDto`. **O objeto vai ao S3 antes da linha**: linha sem objeto quebraria a mesa, objeto sem linha é só lixo (limpeza fora do escopo).
  - `importLink(userId, campaignId, { url, purpose })`: participação → `fetcher.fetch` → `requireSize` → `normalize` (a recusa do processador vira `LINK_NOT_IMAGE`: o link da página de busca do Google responde HTML) → o mesmo `keep`.
  - `open(userId, assetId)` → `{ body, size, mimeType }` (o tipo é o do **registro**): linha inexistente, mesa de que o usuário não é membro e objeto sumido do S3 dão o **mesmo** `ASSET_NOT_FOUND` (critério 14). O espectador lê como jogador (qualquer participação abre); enviar e importar exigem `memberAccessOf` e o espectador recebe 403 `FORBIDDEN` (o `replyWithApiError` traduz o `FORBIDDEN` do `campaigns`).
- Erros (`assets.error.ts`, todos `AssetError` com `code`): `ASSET_NOT_FOUND`, `UNSUPPORTED_IMAGE`, `ASSET_TOO_LARGE`, `LINK_BLOCKED`, `LINK_UNREACHABLE`, `LINK_NOT_IMAGE`.

## Armazenamento (`AssetStoragePort`)

- `server/src/modules/assets/asset-storage.port.ts` — `AssetStoragePort { ensureBucket(), put(key, bytes, contentType), open(key) → StoredObject | null, remove(key) }`; `StoredObject` = `{ body: Readable, size, contentType }` (o corpo vai em fluxo para a resposta). A chave é sempre `assets/<uuid>` (ou `avatars/<uuid>`, as fotos de perfil no mesmo bucket, ver `profiles.md`), nunca o nome do arquivo (§8.5). `remove` é idempotente: hoje só o perfil apaga (trocar ou tirar a foto); asset da mesa não é apagado.
- Adaptador `server/src/infrastructure/asset-storage/s3-asset-storage.ts` (`S3AssetStorage`, sobre `@aws-sdk/client-s3`), montado com o `env.storage` (`StorageConfig`, ver `server.md`). Serve para SeaweedFS, MinIO, R2 e AWS: só a env muda.
  - `ensureBucket` faz `HeadBucket` e, no 404, `CreateBucket` (idempotente; `BucketAlreadyOwnedByYou` é ignorado).
  - `open` de chave inexistente (`NoSuchKey`/404) → `null`.
  - `remove` é um `DeleteObject`; o S3 responde 204 também para chave inexistente (e um 404 é engolido), então apagar duas vezes não falha.
  - Qualquer outra falha vira `AssetStorageError` citando a operação, o bucket e o endpoint, com o nome do erro e o status HTTP, **nunca** a chave secreta.
  - `requestChecksumCalculation`/`responseChecksumValidation` em `WHEN_REQUIRED`: o CRC32 padrão do SDK novo não é aceito por todo S3 compatível.
  - `destroy()` fecha os sockets do cliente.
- No `buildApp` (`wireAssetStorage`): um `S3AssetStorage` por app; `onReady` → `ensureBucket()` (dev, CI e integração ganham o bucket sozinhos, antes da primeira requisição) e `onClose` → `destroy()`.

## Tratamento da imagem (`ImageProcessorPort`)

- `server/src/modules/assets/image-processor.port.ts` — `normalize(bytes, { maxSide }) → NormalizeOutcome`: `{ ok: true, image: NormalizedImage { bytes, mimeType, width, height } }` ou `{ ok: false, refusal: ImageRefusal { reason: not-an-image | format | too-many-pixels, detail } }`. **A recusa é valor, nunca exceção**: o adaptador em `infrastructure/` não importa o `assets.error.ts`; o service a traduz (`UnsupportedImageError(detail)` no envio, `LinkNotImageError(url)` no link). O tipo e o tamanho que valem são os **de saída**.
- Adaptador `server/src/infrastructure/image-processor/sharp-image-processor.ts` (`SharpImageProcessor({ maxInputPixels? })`, sobre `sharp`):
  - O formato sai dos bytes (`metadata().format`), nunca da extensão nem do `Content-Type`. Só `png`, `jpeg` e `webp` ficam; GIF e **SVG** (que o `sharp` renderizaria, e que pode levar script) → recusa `format` citando o formato e "expected png, jpeg or webp".
  - Bytes que não decodificam (HTML, texto) → recusa `not-an-image` ("the 200 bytes do not decode as an image").
  - Bomba de descompressão: largura × altura acima de `maxInputPixels` (padrão 100 MP; o spec passa 1 000) → recusa `too-many-pixels` citando os pixels e o limite, antes de decodificar.
  - `autoOrient()` (a orientação do EXIF vira pixel), `resize` `inside` até `maxSide` sem ampliar, e regrava no **mesmo formato** (PNG mantém o alfa; JPEG e WebP com qualidade 90). O `sharp` não copia metadado na saída: EXIF (GPS), ICC e o que vier depois do fim do arquivo (carga após o `IEND`) somem.
- `assets.error.ts` — `AssetError` (com `code`) e `UnsupportedImageError(detail)` (`UNSUPPORTED_IMAGE`, com as palavras do processador).
- O `sharp` 0.35 instala o binário por pacote opcional (`@img/sharp-*`), sem script de build: o `allowBuilds` do `pnpm-workspace.yaml` não precisou mudar. O `tsdown` o deixa externo (é dependência).

## Link (`ImageFetcherPort`)

O server baixa o link e guarda a imagem como um envio: o WebGL recusa textura de outra origem sem CORS, o link some com o tempo e o hotlink exporia o IP dos jogadores.

- `server/src/modules/assets/image-fetcher.port.ts` — `fetch(url) → FetchOutcome`: `{ ok: true, image: FetchedImage { bytes, contentType | null } }` (o tipo é só dica: quem decide é o processador) ou `{ ok: false, refusal: FetchRefusal }` = `blocked { host, address }` | `unreachable { reason }` | `too-large { limit, received | null }`. Dentro do adaptador a recusa viaja pelos callbacks do socket numa exceção local (`FetchRefused`) e o `fetch` a devolve como valor.
- `server/src/infrastructure/image-fetcher/address-policy.ts` — `AddressPolicy { allows(address) }`, `isPublicAddress(ip)` sobre `node:net` `BlockList` e `publicAddressPolicy`. Fora: `0/8`, `10/8`, `100.64/10` (CGNAT), `127/8`, `169.254/16` (o 169.254.169.254 dos metadados de nuvem), `172.16/12`, `192.0.0/24`, `192.0.2/24`, `192.168/16`, `198.18/15`, `198.51.100/24`, `203.0.113/24`, `224/4`, `240/4`; no IPv6 `::/96`, `::1`, `64:ff9b::/96` (NAT64), `2001:db8::/32`, `fc00::/7`, `fe80::/10`, `ff00::/8`. O IPv4 mapeado (`::ffff:127.0.0.1`) cai na regra do IPv4 sozinho (o `BlockList` confere). Texto que não é IP não é público.
- `server/src/infrastructure/image-fetcher/guarded-image-fetcher.ts` (`GuardedImageFetcher({ policy?, maxBytes?, timeoutMs?, maxRedirects? })`, sobre `node:http`/`node:https`, sem dependência):
  - **`lookup` próprio no socket**: resolve com `all: true`, recusa se **qualquer** endereço não passa na política e devolve à conexão o mesmo endereço conferido. Conferir antes e conectar depois (outra resolução) deixaria passar o DNS rebinding.
  - IP literal na URL não passa pelo `lookup` do Node: é conferido à parte, antes do pedido (com os colchetes do IPv6 tirados).
  - Só `http:`/`https:` em cada salto; até 3 redirects (301/302/303/307/308), cada um conferido de novo; o 4º → `unreachable` "made too many redirects (more than 3)".
  - 10 s para o download inteiro (`AbortSignal.timeout`, valendo para todos os saltos) → "did not answer within 10000 ms"; status ≠ 200 → "answered HTTP 404"; conexão recusada → "could not be reached (ECONNREFUSED)".
  - Acima de 20 MiB (`ASSET_MAX_BYTES`): pelo `Content-Length` declarado, ou contando os bytes enquanto chegam, a resposta é destruída e vira `too-large` (`received: null` quando cortada).
  - `agent: false`: sem conexão reaproveitada entre saltos.
  - Cabeçalhos `User-Agent: Lorkarium/1.0 (image link fetcher)` e `Accept` de imagem em todo salto: hosts como o Wikimedia respondem 403 a pedido sem `User-Agent` (o link parecia "inacessível").
- O service traduz a recusa (`linkErrorOf`): `blocked` → `LinkBlockedError(host, address)` (`LINK_BLOCKED`), `unreachable` → `LinkUnreachableError(url, motivo)` (`LINK_UNREACHABLE`, "link <url> answered HTTP 404"), `too-large` → `AssetTooLargeError(limit, received | null)` (`ASSET_TOO_LARGE`).

## S3 local (SeaweedFS)

- `infra/compose/compose.yaml` sobe `chrislusf/seaweedfs:4.48` (o MinIO comunitário foi descontinuado) com só a 8333 (S3) publicada, volume `seaweedfs-data` e healthcheck no `/healthz`. A identidade de dev (`lorkarium` / `lorkarium-dev-secret`, com Admin/Read/Write/List/Tagging) está em `infra/compose/seaweedfs/s3.json`.
- Comando: `server -dir=/data -ip.bind=0.0.0.0 -master.volumeSizeLimitMB=64 -volume.max=200 -s3 -s3.config=… -s3.port=8333`.
- Integração: o SeaweedFS descartável da receita do `/testar` (porta 8334, `--tmpfs`, bucket `lorkarium-test`). CI: a action `.github/actions/seaweedfs` (ver `ci.md`).

## Testes

- `server/test/integration/assets.spec.ts` (Postgres e SeaweedFS descartáveis, `app.inject()`): mestre e jogador enviam, leitura com os cabeçalhos, 3000 × 3000 → 1024 × 1024, Quelm não lê o de Vharn (e vice-versa), 401, não membro → `CAMPAIGN_NOT_FOUND`, GIF → 415, texto como PNG → 422, 20 MiB + 1 → 413, link para 127.0.0.1 → `LINK_BLOCKED` (a política real), `ftp:` → 400, o 21º envio → 429.

- Unit `server/test/modules/assets/`: `asset-upload.bo.spec.ts`, `assets.mapper.spec.ts` e `assets.service.spec.ts`, com os fakes de `test/support/assets-fakes.ts` (`AssetStorageFake` — escreve `put` e `remove:<chave>` —, `ImageProcessorFake` com `result`/`refusal`/`maxSides`, `ImageFetcherFake` com `answer`/`refusal`, `AssetsDaoFake`) num diário comum que prova `normalize → put → insert`.

- `server/test/integration/assets-dao.spec.ts`: colunas gravadas, `findManyInCampaign` filtrando a outra mesa, **mesa B não vê o asset da mesa A**, dono apagado → `owner_id` nulo, mesa apagada apaga os assets, `storage_key` repetida → `23505`. Fábricas em `server/test/support/assets-factories.ts` (`newAssetPo`, `lyraPortraitPo`).

- `server/test/integration/s3-asset-storage.spec.ts` (SeaweedFS real): grava e lê os mesmos bytes, tipo e tamanho; bucket novo criado e `ensureBucket` duas vezes; chave inexistente → `null`; `remove` apaga (o `open` seguinte é `null`) e é idempotente; segredo errado → erro com bucket e endpoint, sem o segredo. É o spec do adaptador (o driver do `/testar` acusa `fonte-sem-spec` porque ele mora na integração).

- `server/test/infrastructure/image-processor/sharp-image-processor.spec.ts` (unit, `sharp` real, imagens geradas no spec por `sharp({ create })`, sem binário no repo): PNG com alfa, WebP, EXIF de GPS removido, redução a 4096 × 2048, borda exata, orientação 6 → 100 × 200, carga após o `IEND`, HTML, GIF, SVG e o limite de pixels.

- `server/test/infrastructure/image-fetcher/address-policy.spec.ts` (cada faixa não pública e as públicas, inclusive `::ffff:8.8.8.8`) e `guarded-image-fetcher.spec.ts` (servidor HTTP local na loopback com a política `LoopbackOnlyPolicyFake` de `test/support/assets-fakes.ts`): bytes e tipo, redirect seguido, 4º redirect, IP literal bloqueado pela política padrão, `localhost` bloqueado **no `lookup`**, redirect para `[::1]` bloqueado, 404, resposta sem fim cortada, servidor mudo com 100 ms, esquema `ftp:`.

## Armadilhas

- **Adaptador não conhece módulo.** `src/infrastructure/` só importa **tipos** de `src/modules/` (a porta); lançar o erro de domínio de dentro do adaptador é seta proibida (o driver do `/desenvolver-server` acusa `transversal-conhece-modulo`). A porta devolve a recusa como valor e o service a traduz.

- **Conferir o host por texto não protege de SSRF.** `evil.example` pode resolver para 127.0.0.1, um redirect pode levar para 169.254.169.254 e o DNS pode mudar entre a conferência e a conexão (rebinding). A conferência mora no `lookup` do socket (o IP conferido é o conectado), em cada salto, e o IP literal é conferido à parte porque o Node não chama `lookup` para ele.

- SeaweedFS cria uma _collection_ por bucket e reserva volumes para ela. Com os padrões (volume de 30 GB, limite de volumes pelo disco livre), um tmpfs pequeno não tem volume livre e o `PutObject` num bucket novo dá `InternalError` 500 ("No writable volumes and no free volumes left"). Por isso `-master.volumeSizeLimitMB=64 -volume.max=200` no compose, na action do CI e na receita.
