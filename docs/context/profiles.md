# Profiles

O perfil da própria conta: apelido, cor, "Sobre você" e foto. A pessoa só mexe no que é dela (a identidade vem da sessão, §7.3); quem divide mesa vê o resultado no roster da sessão e no detalhe da mesa (ver `sessions.md` e `campaigns.md`). Vive em `server/src/modules/profiles/`. DTOs em [`contracts/conta.md`](contracts/conta.md). Plano de origem: `docs/plans/2026-10-24-tela-perfil-e-conta.md` (Etapa B). O @ e as colunas de `users` estão em `auth.md` e `auth/cifra.md`.

## Estrutura

- `profiles.dao.ts` — `ProfilesDao(db | tx)` sobre a tabela `users` do auth (como o `campaign-members.dao` lê dela): `findById` → `ProfileRow` (`id`, `username`, `name`, `color`, `bio`, `avatarId`, `createdAt`; nunca e-mail nem hash), `update(userId, ProfileChanges)` (só `name`/`color`/`bio`: o @ não está no tipo), `swapAvatar(userId, avatarId | null)` → `{ previousAvatarId }` (ou `undefined` sem conta) e `isCurrentAvatar(avatarId)`
- `profiles.mapper.ts` — `toProfileDto(row)` (`color` efetiva por `memberColorOf` do game-core, `colorChoice` = a coluna, `memberSince` = `createdAt`), `toProfileChanges(dto)` (só os campos que vieram), `avatarKeyOf(id)` (`avatars/<id>`), `AVATAR_CONTENT_TYPE` (`image/webp`)
- `profiles.service.ts` — `ProfilesService` (abaixo)
- `profiles.routes.ts` — borda HTTP; `profiles.error.ts` — `ProfileError` com `code` `AVATAR_NOT_FOUND` | `UNSUPPORTED_IMAGE` | `AVATAR_TOO_LARGE` | `LINK_BLOCKED` | `LINK_UNREACHABLE` | `LINK_NOT_IMAGE` | `RATE_LIMITED` (as três de link: `AvatarLinkBlockedError(host, endereço)`, `AvatarLinkUnreachableError(url, motivo)`, `AvatarLinkNotImageError(url, detalhe)`) (`AvatarNotFoundError`, `UnsupportedAvatarError(detail)`, `AvatarMediaTypeError(tipo)` — 415 —, `AvatarTooLargeError`, `ProfileRateLimitedError`)
- `avatar-processor.port.ts` e `profile-changed.port.ts` — portas (abaixo)
- `profiles.plugin.ts` — `createProfilesModule({ db, storage, processor, profileChanged, fetcher })` → `{ plugin }` (`newId` = `randomUUID`); o `buildApp` o registra sob `/api` **depois** do `wireRealtime` (precisa do service da sessão ao vivo), com o mesmo `S3AssetStorage` dos assets, um `SharpAvatarProcessor` e um `GuardedImageFetcher({ maxBytes: AVATAR_MAX_BYTES })` (o leitor de link dos assets, cortado nos 5 MiB da foto)

## Contrato (prefixo `/api`, todas exigem sessão)

| Rota                        | Entrada                                                          | Saída                                                                                                      | Erros                                                                                                                |
| --------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `GET /account/profile`      | —                                                                | 200 `profileResponseDto`                                                                                   | 401                                                                                                                  |
| `PATCH /account/profile`    | `updateProfileRequestDto` (estrito: `username` no corpo → 400)   | 200 `profileResponseDto`                                                                                   | 400 `INVALID_BODY` · 401 · 429 `RATE_LIMITED`                                                                        |
| `PUT /account/avatar`       | o próprio arquivo, `image/png`, `jpeg`, `webp` ou `gif`, ≤ 5 MiB | 200 `profileResponseDto` (com o `avatarId` novo)                                                           | 401 · 413 `AVATAR_TOO_LARGE` · 415 `UNSUPPORTED_IMAGE` (outro tipo) · 422 (não decodifica) · 429                     |
| `POST /account/avatar/link` | `avatarLinkRequestDto` `{ url }` (http/https)                    | 200 `profileResponseDto` (com o `avatarId` novo)                                                           | 400 `INVALID_BODY` · 401 · 413 `AVATAR_TOO_LARGE` · 422 `LINK_BLOCKED` / `LINK_UNREACHABLE` / `LINK_NOT_IMAGE` · 429 |
| `DELETE /account/avatar`    | —                                                                | 200 `profileResponseDto` (idempotente)                                                                     | 401                                                                                                                  |
| `GET /avatars/:avatarId`    | `avatarParamsDto`                                                | 200 bytes `image/webp`, `Content-Length`, `Cache-Control: private, max-age=31536000, immutable`, `nosniff` | 401 · 404 `AVATAR_NOT_FOUND` (inexistente, trocada, tirada ou id malformado)                                         |

- Limites (`@fastify/rate-limit` no escopo do plugin, chave = `userOf(request).id`): **30 PATCH por minuto** (`preHandler`, depois da guarda) e **10 envios de foto por minuto** (guarda no `onRequest`, limite no `preParsing`: quem não tem sessão é recusado antes de o corpo de 5 MiB ser lido, como nos assets). A foto por link tem os mesmos 10 por minuto, num contador próprio (`preHandler`: o corpo é um JSON pequeno). `DELETE` e as leituras não têm limite próprio.
- Parser cru (`parseAs: 'buffer'`) só para os 4 tipos de `AVATAR_MIME_TYPES`; o JSON e o `text/plain` do Fastify continuam (o PATCH precisa), então um corpo JSON ou texto no `PUT` também vira 415 (`AvatarMediaTypeError`). `bodyLimit` = `AVATAR_MAX_BYTES` só no `PUT` (`FST_ERR_CTP_BODY_TOO_LARGE` → 413).
- A foto é dado **da conta, não da mesa**: `GET /avatars/:id` exige sessão, mas não participação. O id é um uuid novo a cada envio (por isso o cache `immutable`) e só chega a quem divide mesa com a pessoa (roster e detalhe). Mensagem pública fixa por código; a interna (id, tamanho, formato) só vai ao log.

## Service (`ProfilesService`)

Deps: `profiles` (DAO), `storage: Pick<AssetStoragePort, 'put' | 'open' | 'remove'>`, `processor`, `profileChanged`, `fetcher: ImageFetcherPort` (dos assets), `newId`.

- `profileOf(userId)` e `update(userId, dto)`: grava → **depois** avisa a `ProfileChangedPort` → devolve o perfil.
- `replaceAvatar(userId, bytes)`: acima de `AVATAR_MAX_BYTES` → `AvatarTooLargeError` (defesa além do `bodyLimit`) → `normalize` (recusa → `UnsupportedAvatarError` com as palavras do processador) → `put('avatars/<novo>', webp)` → `swapAvatar` → `profileChanged` → `remove('avatars/<antigo>')`. **Apagar só depois de gravar**: uma falha no meio deixa a foto antiga valendo (no pior caso sobra um objeto órfão, nunca uma conta apontando para nada).
- `replaceAvatarFromLink(userId, url)`: `fetcher.fetch` (a recusa vira `LINK_BLOCKED`, `LINK_UNREACHABLE` ou `AVATAR_TOO_LARGE`) → o mesmo caminho da foto enviada (`keepAvatar`: tamanho → `normalize` → `put` → `swapAvatar` → `profileChanged` → `remove`), com a recusa do processador como `LINK_NOT_IMAGE` (o link de uma página, de um vídeo). GIF animado (e WebP animado) segue animado: é o mesmo processador.
- `removeAvatar(userId)`: sem foto não grava, não avisa nem chama o storage; com foto, `swapAvatar(null)` → `profileChanged` → `remove`.
- `openAvatar(avatarId)`: `isCurrentAvatar` (uma foto trocada é 404 mesmo se o objeto ainda existir) → `storage.open` (objeto sumido → o mesmo 404).
- `swapAvatar` lê a foto anterior sob `FOR UPDATE` numa consulta só (`WITH previous AS (… FOR UPDATE) UPDATE … RETURNING previous.avatar_id`): dois envios ao mesmo tempo nunca veem a mesma anterior, então nenhum objeto fica sem dono nem é apagado duas vezes.

## Portas e adaptadores

| Porta                 | Implementação                                               | O que faz                                                                                                                   |
| --------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `AvatarProcessorPort` | `SharpAvatarProcessor` (`infrastructure/avatar-processor/`) | `normalize(bytes) → { ok: true, avatar: { bytes, frames } } \| { ok: false, refusal: { reason, detail } }` (recusa é valor) |
| `ProfileChangedPort`  | `TableSessionService` (módulo `sessions`)                   | `profileChanged(userId)`: publica `session:memberUpdated` em cada mesa viva da pessoa (ver `sessions.md`)                   |
| `AssetStoragePort`    | `S3AssetStorage` (o do módulo `assets`)                     | as fotos moram no mesmo bucket, sob `avatars/<uuid>`; `remove` é idempotente                                                |

- **Ligação da `ProfileChangedPort`:** o `wireRealtime` do `build-app.ts` devolve, junto das saídas do tempo real, `profileChanged: sessions.service` (o `createSessionsModule` passou a devolver `{ gateway, service }`); o `buildApp` passa esse valor ao `createProfilesModule`. Sem adaptador: o service da sessão cumpre a porta por estrutura.
- `SharpAvatarProcessor({ maxTotalPixels? = 100 MP, maxFrames? = 120 })`:
  - formato pelos bytes (`metadata().format`): `png`, `jpeg`, `webp`, `gif`; SVG (renderizador que pode levar script) e o resto → `format` ("expected png, jpeg, webp or gif"); bytes que não decodificam → `not-an-image`;
  - **antes de decodificar**: quadros (`metadata().pages`) acima de `maxFrames` → `too-many-frames` ("expected at most 120 frames"); largura × altura do quadro (`pageHeight ?? height`) × quadros acima de `maxTotalPixels` → `too-many-pixels`. A conferência é o `framesWithin` de `server/src/infrastructure/sharp-frames.ts`, comum com o `SharpImageProcessor` (o GIF da aura, ver `assets.md`);
  - decodifica com `{ animated: quadros > 1, limitInputPixels: maxTotalPixels }`, `autoOrient()` só com um quadro, `resize(256, 256, { fit: 'cover', position: 'centre' })` e `webp({ quality: 85 })`. O `sharp` não copia metadado na saída (EXIF/GPS some).

## Testes

- Unit: `server/test/modules/profiles/profiles.service.spec.ts` (diário `normalize → put → swap → profileChanged → remove`, recusa, limite, sem foto, foto trocada, objeto sumido, só a conta pedida) e `profiles.mapper.spec.ts`; `server/test/infrastructure/avatar-processor/sharp-avatar-processor.spec.ts` (`sharp` real, imagens geradas no spec: centro do PNG 800 × 400, GIF de 3 quadros → WebP animado de 3 × 256, EXIF de GPS, SVG, HTML, teto de quadros e de pixels × quadros pelas opções).
- Fakes em `server/test/support/profiles-fakes.ts`: `profileRow`, `ProfilesDaoFake` (`update:<campos>`, `swap:<id>`), `AvatarProcessorFake` (`result`, `refusal`), `ProfileChangedFake` (`told`); o `AssetStorageFake` dos assets escreve `put` e `remove:<chave>` no mesmo diário.
- Integração: `server/test/integration/profiles.spec.ts` (borda com Postgres e SeaweedFS: perfil, PATCH só da própria conta, `null` volta à automática, `/me` seguinte, corpos 400, 401 em todas, o 31º PATCH → 429, PNG → WebP 256 com os cabeçalhos, outra pessoa lê a foto, trocar → 404 e objeto sumido, tirar, 413, 422, 415, o 11º envio → 429) e `profiles-dao.spec.ts` (colunas, `CHECK` da bio, `swapAvatar` em sequência e em paralelo).

## Armadilhas

- **`sharp` e GIF animado.** Sem `{ animated: true }` (ou `pages: -1`) o `sharp` lê **só o primeiro quadro** e a foto sai parada; mas o `metadata()` conta os quadros (`pages`) mesmo sem a opção — é por ele que o teto é conferido antes de decodificar. Com a opção, `height` vira a tira inteira (quadros × `pageHeight`) e o `limitInputPixels` passa a valer para a tira, por isso o limite que se passa é o de pixels × quadros. O `autoOrient` não se aplica à animação (fica só para um quadro).
- **O codificador de GIF junta quadros iguais.** Um GIF montado no spec com `sharp([...], { join: { animated: true } })` de quadros idênticos (ou parecidos depois da paleta) sai com menos `pages` que o pedido: os specs usam quadros de cores bem distintas e provam o teto de quadros com `maxFrames` pequeno, não com 200 quadros.
- **Índice.** `isCurrentAvatar` filtra `users.avatar_id`, que não tem índice: com muitas contas, cada leitura de foto varre `users`. O browser guarda a foto por um ano (`immutable`), mas um índice em `avatar_id` é a próxima migração quando a tabela crescer.
