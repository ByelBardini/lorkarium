# Badges (insígnias)

Catálogo de insígnias mantido pelo admin no backoffice (imagem quadrada, nome, descrição, ordem) e a concessão a cada conta. O card de perfil e o perfil próprio mostram as insígnias da pessoa na ordem do catálogo. Vive em `server/src/modules/badges/`. DTOs em [`contracts/insignias.md`](contracts/insignias.md). Dado global da conta (fora de campanha): a guarda é o papel `admin` na escrita e a sessão na leitura da imagem.

## Tabelas (migração `0114_badges`)

- `badges`: `id` uuid, `name` text (`badges_name_length` 1–40), `description` text (`badges_description_length` 1–200), `image_id` uuid nulo (único `badges_image_id_unique`; objeto `badges/<image_id>` no bucket, sem FK), `position` int ≥ 0, `created_at`. Índice único `badges_name_unique` em `lower(name)` (nome único sem diferença de maiúscula). `badges_position_unique` é `DEFERRABLE INITIALLY DEFERRED`, **editado à mão no SQL** (o drizzle-kit não declara; o snapshot não guarda): um só `UPDATE` troca posições no reordenar. Os tetos vêm de `BADGE_NAME_MAX_LENGTH`/`BADGE_DESCRIPTION_MAX_LENGTH` dos contracts.
- `user_badges`: `user_id` → `users.id` e `badge_id` → `badges.id`, os dois `ON DELETE CASCADE`; `granted_at`; PK (`user_id`, `badge_id`); índice `user_badges_badge_idx` em `badge_id` (a contagem de quem tem).
- As duas entram no `truncateAllTables` (`server/test/support/test-database.ts`).

## Estrutura

- `badges.po.ts` — as duas tabelas (`BadgePo`, `NewBadgePo`, `UserBadgePo`).
- `badges.dao.ts` — `BadgesDao(db | tx)`: `listCatalog()` (ordem, com `holders` por subconsulta), `findById`, `insert(texts)` (posição = `max + 1`, sem imagem), `update(id, changes)`, `swapImage(id, imageId)` → `{ previousId }` (anterior lida sob `FOR UPDATE` no mesmo comando, como o `swapBanner`), `isCurrentImage(imageId)`, `lockCatalog()` (`{ id, imageId }` em ordem, `FOR UPDATE`), `reorder(ids)` (posições 0…n−1 num `updateManySql`), `delete(id)` → `{ imageId }`, `grantIdsOf(userId)` (com ou sem imagem, na ordem), `replaceGrants(userId, ids)` (apaga as que saíram, `ON CONFLICT DO NOTHING` nas novas: a que fica guarda o `granted_at`) e `badgesOfAccount(userId)` (só com `image_id`, na ordem).
- `badges.bo.ts` — `orderVerdict(catálogo, pedidos)` → `current` ou `stale { missing, extra }` (só uma permutação do catálogo atual passa); `grantVerdict(entradas, pedidos)` → `grantable`, `unknown { badgeId }` (dito primeiro) ou `without-image { badgeId }`.
- `badges.mapper.ts` — `toAdminBadgeDto`, `shownBadgesOf(rows)` (tira as sem imagem, mantém a ordem), `toCatalogEntries`, `toBadgeChanges` (só os textos que vieram), `badgeImageKeyOf(id)` (`badges/<id>`), `BADGE_IMAGE_SHAPE` (`{ 128, 128, parado }`), `BADGE_IMAGE_CONTENT_TYPE` (`image/webp`).
- `badges.service.ts` — `BadgesService` (abaixo). `badges.error.ts` — `BadgesError` e as subclasses por código. `badges.routes.ts` — a borda HTTP (abaixo).
- `badges.plugin.ts` — `createBadgesModule({ db, storage, processor })` → `{ plugin, service }` (`newId` = `randomUUID`; transação pelo `runInTransaction` com `BadgesDao`/`UsersDao` sobre o `tx`). O `buildApp` cria o módulo **antes** do perfil (com o mesmo `S3AssetStorage` e o `SharpAvatarProcessor` da foto), passa `badges.service` ao `createProfilesModule` como `AccountBadgesPort`, e o `wireBackoffice` registra o `plugin` sob `/api` depois do `user-admin`.

## Service (`BadgesService`)

Deps: `badges` (DAO), `accounts: Pick<UsersDao, 'findById'>`, `transaction`, `storage: Pick<AssetStoragePort, 'put' | 'open' | 'remove'>`, `processor: AvatarProcessorPort`, `newId`.

- `catalog()`, `create(dto)` (fim da ordem, `holders: 0`), `update(id, dto)`: a violação de `badges_name_unique` vira `BadgeNameTakenError(nome)`; id desconhecido → `BADGE_NOT_FOUND`.
- `uploadImage(id, bytes, crop)`: acima de `BADGE_IMAGE_MAX_BYTES` → `BADGE_IMAGE_TOO_LARGE` (antes de decodificar) → a insígnia existe (senão 404, antes de decodificar) → `normalize({ 128, 128, parado, crop })` (recusa → `UNSUPPORTED_IMAGE` com as palavras do processador) → `put('badges/<novo>')` → `swapImage` → `remove('badges/<antigo>')`. **Apagar só depois de gravar**; insígnia apagada entre a conferência e o `swap`: o objeto novo sai e volta 404.
- `reorder(ids)`: na transação `lockCatalog` → `orderVerdict` (stale → `BadgeOrderStaleError(missing, extra)`, nada gravado) → `reorder` → o catálogo relido.
- `delete(id)`: apaga a linha (concessões por cascade) e só então o objeto; sem imagem não chama o `remove`.
- `grantsOf(userId)` e `grant(userId, ids)`: conta inexistente → `USER_NOT_FOUND` (suspensa vale: o admin vê a conta na lista). `grant` na transação: conta → `lockCatalog` → `grantVerdict` → `replaceGrants` → `badgesOfAccount`. Vale para o próprio admin.
- `badgesOf(userId)` (a `AccountBadgesPort` do perfil) e `openImage(imageId)` (`isCurrentImage`: imagem trocada é 404 mesmo com o objeto ainda no bucket; objeto sumido → o mesmo 404).

## Contrato (prefixo `/api`)

Backoffice: sessão **e** `admin` (401 `UNAUTHENTICATED` · 403 `FORBIDDEN_ROLE`). Corpo de erro `{ code, message, retryAfterSeconds? }`; DTO inválido é 400 `INVALID_BODY`.

| Rota                                                         | Entrada                                                          | Saída                                                                                                | Erros                                                                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/badges`                                          | —                                                                | 200 `adminBadgesResponseDto` (ordem)                                                                 | —                                                                                                                   |
| `POST /admin/badges`                                         | `createBadgeRequestDto`                                          | 201 `adminBadgeResponseDto`                                                                          | 400 · 409 `BADGE_NAME_TAKEN` · 429                                                                                  |
| `PATCH /admin/badges/:badgeId`                               | `updateBadgeRequestDto`                                          | 200 `adminBadgeResponseDto`                                                                          | 400 · 404 `BADGE_NOT_FOUND` · 409 `BADGE_NAME_TAKEN` · 429                                                          |
| `PUT /admin/badges/:badgeId/image?[cropX&cropY&cropW&cropH]` | bytes PNG/JPEG/WebP/GIF ≤ 2 MiB; retângulo em % (os 4 ou nenhum) | 200 `adminBadgeResponseDto` (`imageId` novo)                                                         | 400 · 404 `BADGE_NOT_FOUND` · 413 `BADGE_IMAGE_TOO_LARGE` · 415 `UNSUPPORTED_IMAGE` · 422 `UNSUPPORTED_IMAGE` · 429 |
| `PUT /admin/badges/order`                                    | `badgeOrderRequestDto`                                           | 200 `adminBadgesResponseDto`                                                                         | 400 · 409 `BADGE_ORDER_STALE` · 429                                                                                 |
| `DELETE /admin/badges/:badgeId`                              | —                                                                | 204                                                                                                  | 400 · 404 `BADGE_NOT_FOUND` · 429                                                                                   |
| `GET /admin/users/:userId/badges`                            | —                                                                | 200 `userBadgeIdsResponseDto`                                                                        | 400 · 404 `USER_NOT_FOUND`                                                                                          |
| `PUT /admin/users/:userId/badges`                            | `userBadgesRequestDto` (`[]` tira todas)                         | 200 `userBadgesResponseDto` (da conta)                                                               | 400 · 404 `USER_NOT_FOUND` / `BADGE_NOT_FOUND` · 409 `BADGE_WITHOUT_IMAGE` · 429                                    |
| `GET /badge-images/:imageId` (qualquer sessão)               | —                                                                | 200 `image/webp`, `Content-Length`, `Cache-Control: private, max-age=31536000, immutable`, `nosniff` | 401 · 404 `BADGE_IMAGE_NOT_FOUND` (inexistente, trocada ou id malformado)                                           |

- Envio cru no molde do `profile-images.routes.ts`: parser `parseAs: 'buffer'` só para `AVATAR_MIME_TYPES` (JSON e texto seguem com o parser do Fastify e viram 415 no envio), `bodyLimit` = 2 MiB, guarda `requireRole('admin')` no `onRequest` (sem sessão 401 e jogador 403 **antes** de ler o corpo), limite no `preParsing`. `FST_ERR_CTP_BODY_TOO_LARGE` → 413 e `FST_ERR_CTP_INVALID_MEDIA_TYPE` → 415, reconhecidos pelo **sufixo** da rota (`routeOptions.url` termina em `/admin/badges/:badgeId/image`): o prefixo não importa.
- Limites (`@fastify/rate-limit` no escopo do plugin, chave = o admin): 60 escritas por minuto em cada rota de escrita (contador por rota) e 10 envios de imagem por minuto. `RATE_LIMITED` 429 com `retryAfterSeconds`. As leituras não têm limite próprio.
- Cada escrita vai ao log pino como `{ adminId, badgeId, targetUserId, action }` "backoffice action"; a recusa conhecida sai como "badges request refused" com o código e a mensagem interna (ids, tamanhos). A mensagem pública é fixa por código.

## Quem consome

- Perfil: `AccountBadgesPort.badgesOf(userId)` (`server/src/modules/profiles/account-badges.port.ts`), cumprida pelo `BadgesService`: o `ProfileCardService` (card por id e pelo @) e o `ProfilesService` (`profileDto.badges` de `GET /account/profile` e de toda resposta do perfil próprio). Ver [`profiles/card.md`](profiles/card.md) e [`profiles.md`](profiles.md).
- O menu da conta no backoffice usa as duas rotas `/admin/users/:userId/badges` (ver [`user-admin.md`](user-admin.md)).

## Testes

- Unit: `server/test/modules/badges/{badges.bo,badges.mapper,badges.service}.spec.ts` (fakes em `server/test/support/badges-fakes.ts`: `badgeRow`, `BadgesDaoFake` em memória com `swap:<id>`, `reorder`, `grant:<user>`, `delete:<id>` no diário e o 23505 de `badges_name_unique`, `BadgeAccountsFake`, `badgesTransactionOver` que escreve `commit`; `AssetStorageFake` e `AvatarProcessorFake` reaproveitados).
- Integração: `server/test/integration/badges.dao.spec.ts` (ordem do `insert`, `holders`, `reorder` trocando posições, só com imagem em `badgesOfAccount`, `replaceGrants` idempotente e por conta, `lower(name)`, `swapImage`, cascades de insígnia e de conta, `lockCatalog`) e `badges-routes.spec.ts` (criar/editar/400/404/409, PNG → WebP 128 lido por jogador com os cabeçalhos, troca com o objeto antigo sumindo, 413/415/422, 401 e 403 antes do corpo, 404 de insígnia e de imagem, ordem igual e stale, concessão em ordem do catálogo, `[]`, sem imagem 409, conta 404, id repetido 400, excluir 204 com o objeto sumindo, 401/403 em cada rota do admin).

## Armadilhas

- **Posição na corrida de criação.** Dois `POST` ao mesmo tempo podem calcular o mesmo `max + 1`: o unique adiado recusa o segundo no fim do comando (500). É raro (escrita de admin); se aparecer, travar o catálogo antes do `insert`.
- **O PO importa os tetos dos contracts** (`BADGE_*_MAX_LENGTH`), como o `users.po.ts` e o `user-reports.po.ts`: o driver do `/desenvolver-server` acusa `seta-invertida`; é o mesmo padrão aceito, para o `CHECK` não divergir do DTO.
