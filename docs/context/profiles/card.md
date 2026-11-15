# Card de outra conta (`GET /api/users/:userId/card`)

Leitura pública (para quem tem sessão) do perfil de outra conta, no `profileCardResponseDto` de `packages/contracts/src/profiles/profile-card.dto.ts`. Nunca sai e-mail nem hash: o DAO só seleciona as colunas do card.

## Arquivos (`server/src/modules/profiles/`)

- `profile-card.dao.ts` — `ProfileCardDao(db)`, uma consulta por bloco: `accountOf(id)` (só conta ativa, `suspended_at is null`; `ProfileCardAccountRow` com `rollsCount`, `natural20Count`, preferências, `role`/`plan`/`lorkariumOwner`), `seatCountsOf(id)` → `{ asMaster, asPlayer }`, `mutualCampaignsOf(a, b)` → `[{ id, name }]` por nome, `mutualFriendsOf(a, b)` → contagem. Assentos contam pelo `playingSeatOf` exportado do `reputation.dao.ts` (mestre ou jogador, sem espectador nem juggernaut) — a mesma regra do "divide mesa" do voto.
- `profile-card.mapper.ts` — `profileCardRelationOf(reading, self)`, `profileCardPresenceOf(relation, visiblyOnline)`, `toProfileCardDto(parts)`. Selo por `accountSealFieldsOf` (campaigns.mapper); `bannerId` só com `customizationAllowed(account)` (senão `null`, a coluna fica); `color` efetiva por `memberColorOf`.
- `profile-card.service.ts` — `ProfileCardService({ cards, friendships, reputation, presence })`. `cardOf(viewerId, targetId)`: conta ausente/suspensa → `ProfileCardNotFoundError` (`PROFILE_NOT_FOUND`, 404, sem distinguir os dois); depois relação (`FriendshipsDao.relationBetween`), assentos, `reputation.summaryOf(target, viewer)`, mesas e amigos em comum em paralelo.
- `profile-card-presence.port.ts` — `ProfileCardPresencePort.isVisiblyOnline(userId)`; quem cumpre é o `AccountPresenceService` (o `wireRealtime` o expõe como `accountPresence` nas saídas, e o `buildApp` o passa ao `createProfilesModule`, junto de `reputation.service`).
- `profile-card.routes.ts` — `registerProfileCardRoute(app, cards)`, ligado pelo `profiles.plugin.ts` dentro do plugin do `profilesRoutes` (herda o rate limit e o tratador de erro do módulo). Limite: 60 leituras/minuto por conta (`RATE_LIMITED` 429 com `retryAfterSeconds`).

## Regras

- Relação: `self` (ler a si) → `blocked` (o leitor bloqueou) → `friend` → `outgoing` (pedido do leitor) → `incoming` → `none`. Ser bloqueado pelo outro lê `none` (o bloqueio já desfaz amizade e pedidos dele); o pedido pendente do próprio leitor continua `outgoing`, como a tela de amigos mostra (o pedido "silencioso").
- Presença só entre amigos: `online` se visível, invisível/desconectado → `offline`; qualquer outra relação (inclusive `self`) → `null`.
- Reputação como o leitor a vê (`myVote` dele; `percent` `null` abaixo do mínimo de votos — ver `reputation.md`).

## Testes

- Unit: `server/test/modules/profiles/profile-card.mapper.spec.ts`, `profile-card.service.spec.ts` (fakes nomeados em `server/test/support/profile-card-fakes.ts`).
- Integração: `server/test/integration/profile-card.spec.ts` (401, 404 de suspensa/inexistente, bloqueio lido como `none`, amigo/`self`, mesas em comum sem espectador/juggernaut, contagem por papel, amigos em comum, reputação, sem e-mail/hash, 429).
