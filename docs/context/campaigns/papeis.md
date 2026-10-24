# Papéis na mesa

Detalhe de [`../campaigns.md`](../campaigns.md). O papel de cada membro mora em `campaign_members.role` (enum `campaign_role`: `master` · `player` · `spectator`, migração 0049). Spec §1.3, §3.9 (Espectador: "visualização de informações públicas, sem permissão para modificar o estado").

## O papel

| Papel       | O que faz na mesa                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `master`    | Tudo (§3.9): grids privados, configurações, todo token.                                                                                        |
| `player`    | Age com as regras de jogador: os próprios tokens, desenho, ping, ficha própria.                                                                |
| `spectator` | Só lê, como um jogador lê (grid do grupo, públicos, elenco, fichas, imagens). Nenhuma escrita, nenhum ping. Não deixa rastro na mesa (abaixo). |

**Quem entra pelo código é espectador** (`CampaignJoinBo.decide` → `join-as-spectator`; `CampaignJoinService` grava `spectator`); quem já é membro, de qualquer papel, entra de novo sem mudar (`already-member`). Vira jogador só quando o mestre promove (abaixo). Por isso os suportes de teste que põem um jogador na mesa entram e promovem pela rota, e o `pnpm db:seed-stress` promove o Caio pelo `MemberRoleService`.

## Nega por padrão (`CampaignAccessBo`)

- `requireViewer()` → o papel de qualquer membro, espectador incluído; quem não é membro → `CAMPAIGN_NOT_FOUND`.
- `requireMember()` → `ActingRole` (`master | player`); o espectador → `FORBIDDEN` (`ForbiddenActionError`, ação `act at the table`, "requires the player or master role"). Não é 404: o espectador vê a mesa, não há existência a esconder.
- `isMaster()` e `isSpectator()` assentam no `requireViewer()`: não lançam para o espectador. `requireMaster(ação)` dá `FORBIDDEN` a ele, como ao jogador.
- `member-access.ts`: `memberAccessOf` (escritas, chama `requireMember`) e `viewerAccessOf` (leituras, chama `requireViewer`).

**Régua:** toda escrita usa `requireMember`/`memberAccessOf` (o padrão; um comando novo esquecido continua barrado). Só a lista fechada abaixo usa `requireViewer`/`viewerAccessOf`; uma leitura nova que o espectador precise ler entra nela explicitamente — esquecida, quebra de forma visível (`FORBIDDEN`) no teste.

## Leituras que aceitam espectador (lista fechada)

| Leitura                                      | Onde                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /api/campaigns/:id` (detalhe)           | `CampaignsService.viewOf` (`myRole: 'spectator'`, `joinCode: null`)                   |
| `POST /api/campaigns/:id/enter`              | `CampaignJoinService.enter` (grava o `last_entered_at` dele)                          |
| `session:join` (roster)                      | `CampaignsService.rosterOf`                                                           |
| `board:sync` (snapshot)                      | `BoardService.snapshotFor` (viewer `role: 'spectator'`, tokens pela redação `others`) |
| `scene:watch` (aba de grid)                  | `SceneWatchService.watch` (o `SceneAccessBo` do jogador: grupo, públicos, elenco)     |
| `GET /api/campaigns/:id/scenes` (biblioteca) | `LibraryService.list` (a mesma que o jogador vê)                                      |
| `GET /api/assets/:assetId` (imagem)          | `AssetsService.open` (já aceitava qualquer participação)                              |

Todo o resto é escrita e volta `FORBIDDEN` sem gravar: os comandos do tabuleiro (token, desenho, área, parede/porta, luz, ficha, condição, combate, ping, `scene:activate`) e o HTTP (envio e importação de imagem — o `assets.routes.ts` traduz o `FORBIDDEN` em 403 —, `PATCH`/`DELETE`/código da mesa, biblioteca).

## Controle de token inerte

- `TokenAccessBo`: quem está em `controllerIds` só conta se não for espectador (`isListed()` olha `isSpectator()`): `audience()` → `others`, `requireControl`/`requireListed` → `FORBIDDEN`. O mestre e os jogadores listados não mudam.
- A regra "controlador é membro" (`TokenRulesBo.controllers`) fica: o espectador pode constar em `controllerIds` (o rebaixado guarda o controle), inerte até voltar a jogador.

## Salas ao vivo (`TableAudience`)

- `rooms.ts`: `TableAudience = 'master' | 'player' | 'spectator'`; `sceneAudienceRooms(mesa, grid, usuário, público)` → o espectador só entra no `sceneRoom`; o jogador + `sceneUserRoom`; o mestre + `sceneMastersRoom`.
- `sessions.gateway.ts`: o público sai do papel no snapshot (`audienceIn`; ausente → `spectator`); o espectador não entra em `campaignUserRoom`. Como o publicador manda o token inteiro à sala do usuário controlador, fora dela o espectador recebe a versão redigida mesmo constando em `controllerIds`.
- `socket-io-scene-audience.ts`: `audienceAt(socket, mesa)` lê o papel **pelas salas** (sem banco): sala dos mestres → `master`; `campaignUserRoom` → `player`; nenhuma → `spectator`. Expulsão de `players` alcança o espectador.

## Sem rastro na mesa

O que "sem rastro" cobre:

- Fora de Participantes: `toCampaignDetailDto` lista só `membersOfRecord(members)` (todos menos espectadores), mesmo com ele online.
- Fora do `memberCount`: a subconsulta do `listOfUser` e o `toCampaignSummaryOfView` contam só mestre e jogadores.
- Fora do "Último acesso": `lastAccessAtOf` ignora `role = 'spectator'`.
- Sem ficha: `MemberCardsDao.listOfCampaign` faz `inner join` com `campaign_members` pelo par da PK e `role <> 'spectator'` (a ficha do rebaixado fica guardada, escondida); `MemberCardBo` recebe o papel do alvo e o espectador vira `MEMBER_NOT_FOUND`.
- Roster da sessão só enquanto online: `TablePresenceBo.lists(member)` (jogador e mestre sempre; espectador só `isOnline`) filtra o `toSessionStateDto`, e o `profileChanged` pula a mesa em que a pessoa é espectadora offline (nem publica nem move a versão).

O que fica: a linha em `campaign_members` (F5, queda e reinício não derrubam o espectador; a mesa aparece na home dele, com o papel `spectator` e o `memberCount` sem ele) e o `last_entered_at` dele, que ordena a home e a faixa "Continuar" da própria conta. Por ser linha de `campaign_members`, o espectador **conta** no `otherMembers` do backoffice: a mesa com espectador bloqueia excluir a conta do dono (`OwnsSharedCampaignsError`, ver [`../user-admin.md`](../user-admin.md)).

## Trocar o papel (mestre: jogador ↔ espectador)

- **Rota:** `PATCH /api/campaigns/:campaignId/members/:userId` `{ role: 'player' | 'spectator' }` (`campaignMemberParamsDto` + `updateMemberRoleRequestDto`, estritos). Quem pede vem de `userOf(request)`, o alvo do caminho. 200 = o `campaignMemberDto` do alvo **puro, sem envelope** (relido depois de gravar, com o `online` da presença). Erros: 401; 400 `INVALID_BODY` (`master`, chave a mais, sem `role`); 400 `INVALID_PARAMS` (id que não é uuid, `InvalidMemberParamsError`; mensagem pública "The ids in the path must be uuids"); 403 `FORBIDDEN` (jogador ou espectador pedindo; o mestre como alvo); 404 `MEMBER_NOT_FOUND` "Member not found" (alvo fora da mesa); 404 `CAMPAIGN_NOT_FOUND` (quem pede não é da mesa, critério 14). Sem guarda "mesa aberta".
- **Regra** (`member-role.bo.ts`, `MemberRoleBo(access, { userId, role | null })`, montado por `toMemberRoleBo` do mapper): `decide(role)` → `{ change: 'changed', from, to }` · `{ change: 'unchanged', role }` (o mesmo papel: idempotente). Ordem: `requireMaster` (não membro `CAMPAIGN_NOT_FOUND`, jogador/espectador `FORBIDDEN`) → alvo fora `MemberNotFoundError` → alvo mestre `MasterRoleLockedError` (`FORBIDDEN`, "the master's role does not change"). `AssignableRole = 'player' | 'spectator'`.
- **Service** (`member-role.service.ts`, `MemberRoleService({ members, memberships, changed, presence })`): `change(userId, { campaignId, targetId, role })` lê as duas participações no DAO (sem memória) → BO → em `changed`: `members.updateRole` (DAO, `undefined` → `MEMBER_NOT_FOUND`) → `memberships.forget(mesa, alvo)` (senão o comando seguinte do alvo usa o papel lembrado) → `await changed.memberRoleChanged({ campaignId, userId, role })`. `unchanged` não grava nem avisa. Responde pelo `listMembers` + `toCampaignMemberDto`.
- **Porta** `member-role-changed.port.ts` (`MemberRoleChangedPort`), implementada pelo `TableSessionService.memberRoleChanged` (ver [`../sessions.md`](../sessions.md)); o `pluginWith(campaignChanged, memberRoleChanged)` recebe as duas portas do mesmo service.
- **Ao vivo:** só com sala viva (roster no registro): o membro relido (`rosterOf` do alvo) → `roleChanged()` (versão +1) → salva → o publicador **move as conexões do alvo** e só então emite `session:memberUpdated` (com o papel novo; o rebaixado offline também sai, para os outros tirarem o card dele).
- **Salas na troca:** `SocketIoSessionPublisher.memberRoleChanged(event, { campaignId, userId, audience })` acha as conexões do alvo na sala da mesa e, para `player`, entra em `campaignUserRoom` e no `sceneUserRoom` de cada grid em que a conexão está (`sceneIdOfRoom` de `rooms.ts` lê o grid do nome da sala); para `spectator`, sai delas. As salas das outras mesas não mudam.
- **Ida e volta:** rebaixar não escreve nos grids: tokens, `controllerIds`, ficha, personagem e principal ficam guardados (o controle fica inerte, a ficha escondida). O `board:sync` seguinte do rebaixado sai redigido e sem a ficha dele (o dos outros também sem ela); promover de volta devolve o token inteiro (`canControl: true`) e a ficha igual à de antes.

## Testes

- Unit: `server/test/modules/campaigns/campaign-access.bo.spec.ts` e `member-access.spec.ts` (o espectador lê e é recusado), `tokens/token-access.bo.spec.ts` (controle inerte), `campaigns.mapper.spec.ts` (detalhe sem a Duda), `member-cards/member-card.bo.spec.ts`, `sessions/*.spec.ts` (`lists`, roster, perfil), `realtime/rooms.spec.ts`, `infrastructure/scene-audience/socket-io-scene-audience.spec.ts`.
- Troca de papel: unit `member-role.bo.spec.ts`, `member-role.service.spec.ts` (diário `updateRole → forget → memberRoleChanged` em `members.writes`; fakes `ForgottenMembershipsFake` e `MemberRoleChangedFake` em `test/support/member-role-fakes.ts`; `CampaignMembersDaoFake.updateRole`), `sessions/sessions.service.member-role.spec.ts`, `infrastructure/session-publisher/socket-io-session-publisher.spec.ts` (fakes de socket em `test/support/realtime-rooms-fakes.ts`, também do `socket-io-scene-audience.spec.ts`); integração `campaign-roles.spec.ts` (rota, recusas, `forget`) e `campaign-roles-live.spec.ts` (redação e ficha na ida e volta, Quelm sem nada).
- Integração: `server/test/integration/spectators.spec.ts` (leituras, um `it.each` com uma escrita por módulo, HTTP 403, isolamento, sessão ao vivo, sem rastro), `campaign-members-dao.spec.ts`, `member-cards-dao.spec.ts`, `campaigns.spec.ts`.
- Entrada: unit `campaign-join.bo.spec.ts` (`join-as-spectator`) e `campaign-join.service.spec.ts` (grava `spectator`, fora do `memberCount`; membro de qualquer papel mantém o papel); integração `campaigns.spec.ts` ("join by code and enter the table": entra espectador, entra de novo igual, promovido e entrando de novo continua jogador).
- Suporte: `DUDA_ID` (a espectadora) em `campaigns-factories.ts`. Em `server/test/support/tables.ts`: o `Table` traz `master` (o `SignedInUser` de `createTable`); `joinAsSpectator(app, user, table)` só entra pelo código; `joinByCode(app, user, table)` entra e o `table.master` promove pela rota (`PATCH …/members/:userId`, 200 exigido). `TokenTableHarness.joinAsSpectator(user, table)`, `signUp(nome)` e `connect(usuário)` (conexão sem mesa) em `token-table.ts`. Um `Table` montado à mão precisa do `master`; `atTable`/`synced` de `live-table.ts` pedem só `Pick<Table, 'id'>`. E2E: `joinByCodeAndEnter(player, código, mestre)` e `joinAsSpectatorAndEnter` (ver [`../ci/e2e.md`](../ci/e2e.md)).
