# Card de perfil (client)

Clicar no nome de alguém abre o card "Brasão" da conta: popover compacto e, por "Ver perfil completo", o modal. Vale para qualquer conta logada (contrato em [`../contracts.md`](../contracts.md), `profiles/profile-card.dto.ts`). Código em `client/src/features/profile-card/`.

## Fiação

- `ProfileCardApi` (`src/services/profile-card-api.ts`, `HttpProfileCardApi(transport)`; dep `profileCardApi` do `AppDependencies`):
  - `card(userId)` → `GET /api/users/:userId/card`, validado pelo `profileCardResponseDto`; 404 → `user_not_found`, 401 → `unauthenticated`, fora do DTO → `unexpected`.
  - `vote(userId, 1 | -1)` → `PUT …/reputation`; `removeVote(userId)` → `DELETE …/reputation` (204). `REPUTATION_NOT_ALLOWED` → `reputation_not_allowed`.
  - `report(userId, { reason, details })` → `POST …/reports` (201). `REPORT_ALREADY_OPEN` → `report_already_open`; `REPUTATION_TARGET_NOT_FOUND`/`REPORT_TARGET_NOT_FOUND` → `user_not_found`; 429 → `rate_limited { retryAfterSeconds }`.
- `ProfileCardProvider` (`profile-card-provider.tsx`) entra no shell logado (`router.tsx`, dentro do `SavedColorsProvider`) com `profileCardApi`, `friends`, `directMessages` e `viewerId`. `useProfileCardDeps()` (`profile-card-deps.ts`) lê o contexto; sem provider (spec de componente sem shell, tela pública) o `ProfileCardTrigger` vira só o nome em texto.

## Peças

- `profile-card-trigger.tsx` — `ProfileCardTrigger({ userId, name, children?, label?, className? })`: o `PopoverTrigger` (o nome, ou um ícone nomeado por `label`) e o popover `role="dialog"` "Perfil de Bia". "Ver perfil completo" fecha o popover e abre o `ProfileCardDialog` ("Perfil completo de Bia", título `sr-only`). O mesmo `useProfileCard` serve aos dois.
- `use-profile-card.ts` — `useProfileCard(api, userId, ativo)` → `{ state: loading | ready | failed, reload }`: lê ao abrir; `reload()` relê depois de voto e de comando de amizade (o server é a autoridade das contagens); o card na tela fica até a resposta.
- `profile-card-body.tsx` — "Carregando perfil…", o erro (`role="alert"`, `cardLoadFailureText`) com "Tentar de novo", ou a face com as ações. O próprio card (`relation: 'self'` ou `id === viewerId`) não tem ações: só o `ReputationTally` (`reputation-buttons.tsx`), as contagens de 👍 e 👎 como `role="img"` "Aprovações, 1 voto" / "Reprovações, 0 votos" — abaixo de 5 votos a porcentagem some, e sem ele a pessoa não veria voto nenhum.
- `profile-card-face.tsx` + `profile-card-parts.tsx` — moldura dourada, banner (`bannerId` → `<img src="/api/banners/:id">`; sem ele, a cor do perfil como fundo — a cor nunca vira campo), "Desde dd/mm/aaaa", avatar com `PresenceDot` (só com `presence` não nulo), nome em Cinzel, `UserHandle` com o selo, chips da relação ("✓ Amigos", "n mesas em comum", no modal "n amigos em comum"), Online/Offline, os 4 atributos em `dl` (Rolagens, Críticos, "Mestre / joga", Aprovação — `approvalText`: `percent: null` → "Sem votos suficientes") e "Sobre". O modal soma "Sistemas e cenários", "Horários", "Contato" (texto livre; vazio some) e "Mesas em comum".
- `profile-card-seal-watermark.tsx` — o ícone do selo (`PLAN_SEAL_ICONS`, `planSealOf`) grande e a 7% na metade direita, `aria-hidden`; Grátis sem selo, sem marca-d'água.
- `profile-card-text.ts` — `cardCount` (pt-BR, `4.812`), `memberSinceTag`, `approvalText`, `REPORT_REASON_LABELS`, `cardLoadFailureText`, `cardCommandFailureText`.

## Ações (`profile-card-actions.tsx`)

- "Mensagem" — só com amigo online (`relation: 'friend'` e `presence: 'online'`): `navigate(friendPath(id))`, a conversa privada que já existe. Fora disso, desabilitado.
- `reputation-buttons.tsx` — 👍/👎 com as contagens (`aria-label` "Aprovar, 128 votos", `aria-pressed` no voto do leitor); clicar no voto marcado tira (`removeVote`), no outro troca. Sem mesa em comum (`mutualCampaigns` vazio) os dois ficam desabilitados com a dica "Só quem divide uma mesa com a pessoa pode votar." (`aria-describedby` + `title`).
- `profile-card-menu.tsx` ("Mais ações") — o passo de amizade pela relação (`friend` → "Desfazer amizade", `none` → "Adicionar amigo" pelo @, `incoming` → "Aceitar pedido", `blocked` → "Desbloquear"; `outgoing` nenhum), "Bloquear" (fora de `blocked`) e "Denunciar". Desfazer e bloquear pedem confirmação pelo `FriendConfirmDialog` e as frases de `friend-confirmations.ts`. `profile-card-friendship.ts` (`runFriendship`) roda pelo store de amigos, bloquear chama `directMessages.forget`, e relê o card; a frase sai sob a barra (`role="status"`, ou `role="alert"` na recusa, com `friendsFailureText`).
- `report-user-dialog.tsx` — "Denunciar Bia": motivo obrigatório (rádios na ordem de `USER_REPORT_REASONS`) e "Detalhes (opcional)" (até 1000; só espaços → `null`). "Enviar denúncia" desabilitado sem motivo; sucesso → "Denúncia enviada." e "Fechar"; recusa em `Alert` ("Você já tem uma denúncia aberta sobre essa pessoa.", limite com os segundos).

## Onde abre

- Aba "Na mesa": o apelido da `NickLine` (`player-card-parts.tsx`), no lugar do antigo `MemberCardPopover`.
- Chat da mesa: o nome do autor de mensagem própria (`SpeakerName` em `chat-message-row.tsx`); fala como token não abre.
- Amigos: o botão "Perfil de Bia" (ícone `IdCard`) ao lado do link da conversa em `friend-row.tsx` — a linha inteira é um link, então o card não entra dentro dela.

## Testes

`client/test/services/profile-card-api.spec.ts`; `client/test/features/profile-card/profile-card-trigger.spec.tsx` (popover, modal, selo, banner, votos insuficientes, presença, próprio card, carregando e erro) e `profile-card-actions.spec.tsx` (voto, mesa em comum, menu por relação, bloquear, denúncia, 409, Mensagem); entradas em `chat/chat-message-row.spec.tsx` e `friends/friend-row.spec.tsx`. Fake `ProfileCardApiFake` (vota como o server: contagem, `myVote` e `percent` com o mínimo de 5), fixtures `LYRA_CARD`/`lyraCard()`/`ANA_CARD`, `ProfileCardHarness` (`open(card)`, `mount(elemento)`) e `ConversationStub` em `client/test/support/`.
