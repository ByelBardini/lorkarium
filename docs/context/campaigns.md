# Campaigns

Mesas (campanhas): criação, participação (mestre/jogador), listagem do usuário, detalhe, entrada por código e "entrou por último". Vive em `server/src/modules/campaigns/` (módulo do server); o lado do client (home, diálogos, modal de detalhe, tela da mesa) está em [`client/home.md`](client/home.md). Os DTOs estão em [`contracts.md`](contracts.md) (seção Mesas). Spec: §3.1, §3.8, §3.9, §6, §7.1, §8.2.

## Estrutura

- `server/src/modules/campaigns/campaigns.po.ts` — tabela `campaigns` e enum `campaign_visibility`
- `server/src/modules/campaigns/campaign-members.po.ts` — tabela `campaign_members` e enum `campaign_role`
- `server/src/modules/campaigns/campaigns.dao.ts` — `CampaignsDao(db | tx)`: `insert`, `findById`, `findByJoinCode` (ausente → `undefined`, como no auth)
- `server/src/modules/campaigns/campaign-members.dao.ts` — `CampaignMembersDao(db | tx)`: `insert`, `findMembership(campaignId, userId)`, `listOfUser(userId)` → `CampaignListingRow[]`, `listMembers(campaignId)` → `CampaignMemberRow[]` (`{ userId, name, username, colorChoice, avatarId, bio, role }` — o perfil lido de `users`, `colorChoice` nulo = cor automática —, sem ordem garantida: quem ordena é o mapper), `campaignIdsOfUser(userId)` (só os ids das mesas do usuário, sem join), `markEntered(campaignId, userId, at)`

## Consultas

- `listOfUser` parte de `campaign_members` filtrado pelo `userId` (isolamento: só sai mesa de que o usuário é membro). Cada linha: `{ campaign (PO inteiro), role, joinedAt, lastEnteredAt, masterName, memberCount }`; o mestre vem do membro com `role = 'master'` (não do `owner_id`) e a contagem é subconsulta em `campaign_members`.
- Ordem: `last_entered_at desc nulls last`, depois `joined_at desc`.

- `server/src/modules/campaigns/campaign-code.port.ts` — `CampaignCodePort.generate()`; adaptador `server/src/infrastructure/campaign-code/crypto-campaign-code.ts` (`CryptoCampaignCode`, sorteio uniforme por `randomInt` do `node:crypto` no `CAMPAIGN_CODE_ALPHABET`, 8 símbolos = 40 bits; a fonte de índices é parâmetro para o teste)
- `campaign-access.bo.ts`, `campaign-join.bo.ts`, `campaigns.mapper.ts`, `campaigns.service.ts`, `campaign-join.service.ts`, `campaigns.error.ts` — abaixo
- `cached-memberships.ts` — `CachedMemberships` (o DAO de membros com memória, abaixo) e o tipo `MembershipReader` (`findMembership` + `listMembers`), o que os módulos do tabuleiro recebem
- `campaigns.routes.ts` (borda HTTP) e `campaigns.plugin.ts` — `createCampaignsModule({ db, hasher, codes, clock })` devolve `{ plugin, service, memberships }` (o `service` vai para o módulo `sessions`; `memberships` para todo módulo do tabuleiro, como `members` no plugin de cada um); `buildApp` o registra sob `/api` depois do auth (usa `app.authGuards`) e compartilha com o auth as instâncias de `Argon2PasswordHasher` e `SystemClock`

## Contrato (prefixo `/api`, todas exigem sessão)

| Rota                                | Entrada                    | Saída                                                                                     | Erros                                                                                                                     |
| ----------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /campaigns`                    | cookie                     | 200 `listCampaignsResponseDto`                                                            | 401 `UNAUTHENTICATED`                                                                                                     |
| `POST /campaigns`                   | `createCampaignRequestDto` | 201 `campaignResponseDto` (com `joinCode`)                                                | 400 `INVALID_BODY` · 401                                                                                                  |
| `GET /campaigns/:campaignId`        | `campaignIdParamsDto`      | 200 `campaignResponseDto` (`joinCode` só para o mestre; `castSceneId` = o elenco da mesa) | 400 `INVALID_PARAMS` · 401 · 404 `CAMPAIGN_NOT_FOUND`                                                                     |
| `POST /campaigns/join`              | `joinCampaignRequestDto`   | 200 `joinCampaignResponseDto`; idempotente para quem já é membro                          | 400 · 401 · 404 · 403 `CAMPAIGN_PASSWORD_REQUIRED` · 403 `CAMPAIGN_PASSWORD_INVALID` · 429 `RATE_LIMITED` + `Retry-After` |
| `POST /campaigns/:campaignId/enter` | `campaignIdParamsDto`      | 204 (grava `last_entered_at`)                                                             | 400 · 401 · 404                                                                                                           |

- Isolamento: a "campanha da sessão" (§2.6) é a participação do usuário de `userOf(request)`. Detalhe e `enter` de quem não é membro dão o **mesmo** 404 de id inexistente.
- Limite da entrada por código: 10 tentativas por minuto **por usuário** (`@fastify/rate-limit` no escopo do plugin, `hook: 'preHandler'`, que roda depois da guarda; a chave é `userOf(request).id`). Conta toda tentativa.
- Erro sempre como `ApiErrorDto`, mensagem pública fixa por código; `CAMPAIGN_CODE_EXHAUSTED` vira 500 `INTERNAL_ERROR` e vai para o log. O corpo do 400 vem de `invalidBodyError` (`server/src/lib/invalid-body.ts`, compartilhado com o auth).

## Tabelas (`server/drizzle/0001_campaigns.sql`)

- `campaigns`: `id` uuid, `owner_id` → `users.id` **cascade**, `name`, `system`/`status`/`description` nulos, `visibility` enum `campaign_visibility` (`public` · `private` padrão), `join_code` **único** (forma canônica, sem hífen), `password_hash` nulo (Argon2id; `null` = sem senha), `created_at`, `updated_at`.
- `campaign_members`: PK (`campaign_id`, `user_id`), ambos **cascade**, `role` enum `campaign_role` (`master` · `player`), `joined_at`, `last_entered_at` nulo; índice `campaign_members_user_id_idx`.

## Regras de negócio (BO + mapper)

- `CampaignAccessBo({ campaignId, userId, role | null })`: `requireMember()` lança `CampaignNotFoundError` citando mesa e usuário; `canSeeJoinCode()` só para `master`.
- `CampaignJoinBo({ campaignId, isMember, hasPassword })`: `needsPasswordCheck()` (só quem não é membro numa mesa com senha); `decide(check)` com `check` = `not-required | missing | matches | mismatch` (calculado pelo service) → `already-member` | `join-as-player`, ou `CampaignPasswordRequiredError` / `CampaignPasswordInvalidError`.
- `campaigns.mapper.ts`: `toCampaignSummaryDto(listingRow)`, `toCampaignSummaryOfView(view)` e `toCampaignDetailDto(view)` (`CampaignView` = mesa + participação + membros; mestre = membro `master`; membros na ordem de `orderedMembers(rows)` — mestre primeiro e depois por nome em `pt-BR` (a mesma ordem serve ao `rosterOf`) —, cada um como `{ userId, name, role, color (efetiva, memberColorOf do game-core), avatarId }`; `hasPassword` = hash não nulo; nunca o hash), `toNewCampaignPo` (a senha não chega ao PO), `toCampaignAccessBo`, `toCampaignJoinBo`.
- `campaigns.error.ts`: `CampaignError` com `code` `CAMPAIGN_NOT_FOUND` | `CAMPAIGN_PASSWORD_REQUIRED` | `CAMPAIGN_PASSWORD_INVALID` | `CAMPAIGN_CODE_EXHAUSTED` | `RATE_LIMITED` | `INVALID_PARAMS`; a mensagem interna cita id, usuário ou código.

## Services

- `CampaignsService` (`CampaignsServiceDeps`: DAOs de leitura, `transaction: CampaignTransactionRunner`, `codes`, `hasher`, `clock`):
  - `create(userId, dto)`: hash da senha (se houver) → até 3 tentativas, cada uma **numa transação própria** (a violação de unicidade aborta a transação no Postgres): gera o código, grava a mesa, o criador como `master` (`joinedAt` do relógio) **a cena ativa** (`scenes` com o grid padrão + `campaigns.active_scene_id`, ver `board.md`) e **o elenco** (`kind = 'cast'`, ver `tokens/character.md`), tudo na mesma transação; `23505` → próximo código; 3 colisões → `CampaignCodeExhaustedError` citando os códigos. Devolve o detalhe.
  - `listMine(userId)` e `detail(userId, campaignId)` (participação → `requireMember` → mesa → membros → elenco: `castSceneId` pelo `ScenesDao.findCastOf`, dep `scenes`).
  - `campaignIdsOf(userId)` → os ids das mesas do usuário (só as participações dele): a entrada da sessão ao vivo para avisar cada mesa de um perfil gravado (`session:memberUpdated`, ver `sessions.md`).
  - `rosterOf(userId, campaignId)` → `CampaignMemberRow[]` (com o perfil, em `orderedMembers`): participação → `requireMember` → membros, os dois pelo `memberships` (dep `memberships: MembershipReader`), de modo que o `session:join` deixa a participação lembrada para os comandos do tabuleiro. É a porta de entrada de **outro módulo** (a sessão ao vivo, `sessions.md`) aos membros da mesa; quem não é membro recebe `CampaignNotFoundError` sem chegar ao `listMembers`.
- **Participação em memória** (`CachedMemberships(dao, limite = MEMBERSHIP_MEMORY_MAX` = 4096)): `findMembership` lembra só quem **é** membro (por `<mesa>:<usuário>`, então membro da mesa A não vale para a B); "não é membro" vai ao banco toda vez, para quem entra pelo código logo depois ser aceito. No limite a memória recomeça (`clear`). `listMembers` não é lembrado (muda quando alguém entra). `forget(mesa, usuário)` é o gancho de quem sair da mesa ou trocar de papel — hoje ninguém sai nem troca, então nada chama. O próprio módulo (detalhe, `enter`, entrada por código) segue no DAO sem memória: lê `lastEnteredAt`, que a memória deixaria velho. Vale em instância única (spec §5.7).
- `CampaignJoinService` (DAOs, `hasher`, `clock`): `join(userId, { code, password? })` acha pelo código (senão `CampaignNotFoundError` citando o código), verifica a senha só quando `needsPasswordCheck()`, grava `player` e devolve o resumo; `enter(userId, campaignId)` exige participação e grava `last_entered_at` com o relógio.
- O runner de transação (`CampaignTransactionRunner`) entrega DAOs presos ao `tx` (`campaigns`, `members`, `scenes`); o plugin o monta sobre `runInTransaction`.

## Testes

- Integração: `server/test/integration/campaigns-dao.spec.ts`, `campaign-members-dao.spec.ts` e `campaigns.spec.ts` (borda: 401, 400, isolamento/critério 14, senha, idempotência, `enter`, 429; um app novo por `describe` por causa do limitador em memória).
- Unit: `server/test/modules/campaigns/*.spec.ts` (BOs, mapper, os dois services) e `server/test/infrastructure/campaign-code/`.
- `server/test/support/campaigns-fakes.ts` — `IndexSourceFake`, `CampaignCodeFake` (sequência, `generated`), `UniqueViolationFake`, `CampaignsDaoFake` (código repetido lança como o índice único), `CampaignMembersDaoFake` (`listedFor` do `listOfUser`, `membersListedFor` do `listMembers`, `entered`, nomes por `userNames`, o @ = nome minúsculo, sem cor, foto nem bio; `campaignIdsOfUser`), `TransactionRunnerFake` (`runs`, `writesInside`), `MembershipReadsFake` (`findMembership`/`listMembers` sobre `rows`, `reads` = `<mesa>:<usuário>` e `list:<mesa>`).
- `server/test/support/campaigns-factories.ts` — `newCampaignPo`, `campaignPo`, `newCampaignMemberPo`, `campaignMemberPo` (ids `VHARN_ID`, `QUELM_ID`, `BIA_ID`, `CAIO_ID`; o `ANA_ID` vem do auth), `campaignListingRow`, `campaignMemberRow` (o @ nasce do `name` minúsculo; `colorChoice`, `avatarId` e `bio` nulos).

## Armadilhas

- **Quando nascer expulsar membro ou trocar papel**, chame `campaigns.memberships.forget(mesa, usuário)` no mesmo caso de uso: a memória da participação só esquece por ali, e sem isso quem saiu continua mandando comando no tabuleiro (e o papel velho continua valendo).
