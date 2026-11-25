# Emojis personalizados

Os emojis da **conta** (`:festa:`): quem cria usa em qualquer mesa e nas mensagens privadas; quem recebe a mensagem só vê. O catálogo fixo (memes e smileys) está em [`client/chat-emotes.md`](client/chat-emotes.md); o chat, em [`chat.md`](chat.md) e [`direct-messages.md`](direct-messages.md). Módulo `server/src/modules/custom-emojis/`; DTOs em `packages/contracts/src/custom-emojis/custom-emoji.dto.ts`.

## Regras de negócio

- **Quem cria:** pelo plano efetivo da conta (`effectiveLimitsOf`): `maxCustomEmojis` = Grátis 0, Apoiador 10, Narrador 25, Lenda 50, Amigo do Dono / admin / Dono do Lorkarium `null` (sem teto). `PLAN_LIMIT` `customEmojis` (recurso contado) antes de decodificar e de novo sob a trava da conta (`UsersDao.lockForPlan`).
- **GIF:** `animatedCustomEmojis` só na Lenda (e acima). Sem ele o GIF é gravado parado. Com ele grava-se o animado em `custom-emojis/<id>` **e** o 1º quadro em `custom-emojis/<id>-still`; a coluna `animated` diz que há os dois.
- **Queda de plano:** nada é apagado. Ficam **ativos** os mais antigos por `(created_at, id)` até o teto novo (`activeEmojiIdsOf`); os mais recentes ficam inativos (a lista os marca `active: false` e nenhuma mensagem os desenha). O GIF de quem saiu da Lenda é servido pelo `-still` (`servedCustomEmojiKeyOf`), e a lista o mostra `animated: false`.
- **Nome:** `^[a-z0-9_]{2,32}$`, único por conta (`custom_emojis_owner_name_unique`). Dois donos podem ter `:festa:` cada um: na mensagem vale o de quem mandou. Nome do catálogo (`isCatalogEmoteName`, sem caixa) é recusado pelo DTO (`refine`).
- **Uso:** só o dono usa os próprios; não há "salvar o de outra pessoa".
- **Moderação:** o admin lista e apaga os emojis de qualquer conta (rotas abaixo).

## Tabela `custom_emojis` (`custom-emoji.po.ts`, migração `0125_custom_emojis`)

`id` uuid (PK, do `randomUUID`), `owner_id` → `users` (`on delete cascade`), `name`, `animated`, `created_at`. `CHECK` do padrão do nome.

## Rotas (`custom-emojis.routes.ts`, sob `/api`)

| Rota                                                 | Quem                                                                                            | Resposta                                                                                    | Erros                                                                                             |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /account/custom-emojis`                         | sessão                                                                                          | `customEmojiListDto` `{ emojis, limit }` (mais antigo primeiro)                             | 401                                                                                               |
| `POST /account/custom-emojis?name=`                  | sessão; corpo = a imagem (`png`, `jpeg`, `webp`, `gif`) ≤ 2 MiB; 10/min na conta (`preParsing`) | 201 lista                                                                                   | 400 nome · 403 `PLAN_LIMIT` · 409 `CUSTOM_EMOJI_NAME_TAKEN` · 413 · 415 `UNSUPPORTED_IMAGE` · 429 |
| `PATCH /account/custom-emojis/:emojiId` `{ name }`   | dono; 30/min                                                                                    | lista                                                                                       | 400 · 404 · 409                                                                                   |
| `DELETE /account/custom-emojis/:emojiId`             | dono; 30/min                                                                                    | lista                                                                                       | 404                                                                                               |
| `GET /custom-emojis/:emojiId`                        | qualquer sessão                                                                                 | `image/webp`, `cache-control: private, max-age=300` (não é imutável: segue o plano do dono) | 404                                                                                               |
| `GET /admin/users/:userId/custom-emojis`             | `requireRole('admin')`                                                                          | lista                                                                                       | 403                                                                                               |
| `DELETE /admin/users/:userId/custom-emojis/:emojiId` | admin                                                                                           | lista                                                                                       | 403 · 404                                                                                         |

Id de outra conta no `PATCH`/`DELETE` → 404 (toda escrita do DAO filtra pelo dono).

## Estrutura

- `custom-emoji.bo.ts` — puro: `activeEmojiIdsOf(rows, limit)`, `customEmojiNamesIn(text, rules)` (cada `:nome:` uma vez, minúsculo, até `perMessage`), `customEmojiRefsIn(text, active, rules)`. As regras do nome entram por parâmetro (`EMOJI_NAME_RULES` no refs service): o BO não importa DTO.
- `custom-emojis.dao.ts` — `listOf`, `findOwnerPlan`, `findWithOwner` (emoji + plano do dono numa consulta), `insert` / `rename` (violação do único → `CustomEmojiNameTakenError`), `remove`.
- `custom-emojis.mapper.ts` — chaves (`customEmojiKeyOf`, `stillCustomEmojiKeyOf`, `customEmojiKeysOf`, `servedCustomEmojiKeyOf`) e `toCustomEmojiList(rows, limits)`.
- `custom-emojis.service.ts` — `list`, `create` (tamanho → plano → `requireRoom` → decodifica pelo `AvatarProcessorPort` da foto, 128 × 128 WebP, parado e, se pode, animado → `put` → transação com trava e insert; falha → tira as imagens), `rename`, `remove` (linha, depois as imagens), `open`. Toda escrita chama `refs.forget(userId)`.
- `custom-emoji-refs.service.ts` — `CustomEmojiRefsService.refsIn(userId, text)`: os ativos do remetente que o texto cita. **Cache em memória** por conta por `CUSTOM_EMOJI_CACHE_MS` (60 s), esquecido na hora pelo `forget`; texto sem `:nome:` nem consulta. É a `CustomEmojiRefsPort` (`custom-emoji-refs.port.ts`) do chat e das DMs.
- `custom-emojis.plugin.ts` — `createCustomEmojiRefs({ db, clock })` (criado no `buildApp` **antes** do `wireRealtime`, passado ao `wireChat` e ao `wireAccountRealtime`) e `createCustomEmojisModule({ db, storage, processor, refs })` (registrado depois do perfil, com o `SharpAvatarProcessor`).

## Nas mensagens

`chat:sent` e `dm:sent` levam `customEmojis: [{ name, emojiId }]` (até 20, `customEmojiRefsDto`; `.default([])` lê o histórico antigo). O texto não muda. O client desenha a imagem pelo `emojiId`.

## Fora do módulo

- **Exportação** ([`data-export.md`](data-export.md)): `customEmojis` no `dados.json` e as imagens em `imagens/emojis/<nome>.webp`.
- **Exclusão da conta** ([`user-admin.md`](user-admin.md)): as chaves dos emojis entram na fila de remoção do bucket, na mesma transação, antes do cascade.

## Testes

- Unit: `server/test/modules/custom-emojis/` (`custom-emoji.bo.spec.ts`, `custom-emojis.service.spec.ts`, `custom-emoji-refs.service.spec.ts`), fakes em `server/test/support/custom-emojis-fakes.ts` (`CustomEmojisDaoFake`, `EmojiPictureProcessorFake`, `EmojiRefsForgetFake`, `CustomEmojiRefsFake`).
- Integração: `server/test/integration/custom-emojis.spec.ts` (PNG → WebP 128, GIF da Lenda animado e parado depois de cair para Narrador, GIF do Apoiador parado, Grátis e 11º do Apoiador `PLAN_LIMIT`, nome do catálogo / inválido / repetido, mesmo nome em duas contas, 413 / 415 / 401, renomear e apagar, isolamento por conta, inativos depois da queda, admin, `chat:sent` com o emoji e o emoji novo já na mensagem seguinte). Para encher a cota o spec insere as linhas direto: o envio por HTTP bate no limite de 10/min.
- Contracts: `packages/contracts/test/custom-emojis/custom-emoji.dto.spec.ts`.
