# Card de outra conta (`GET /api/users/:userId/card` e pelo @)

Leitura pública (para quem tem sessão) do perfil de outra conta, no `profileCardResponseDto` de `packages/contracts/src/profiles/profile-card.dto.ts`. Nunca sai e-mail nem hash: o DAO só seleciona as colunas do card.

## Arquivos (`server/src/modules/profiles/`)

- `profile-card.dao.ts` — `ProfileCardDao(db)`, uma consulta por bloco: `accountIdByUsername(username)` (o id do @ exato, já em minúsculas, só de conta ativa), `accountOf(id)` (só conta ativa, `suspended_at is null`; `ProfileCardAccountRow` com `rollsCount`, `natural20Count`, preferências, `role`/`plan`/`lorkariumOwner`), `seatCountsOf(id)` → `{ asMaster, asPlayer }`, `mutualCampaignsOf(a, b)` → `[{ id, name }]` por nome, `mutualFriendsOf(a, b)` → contagem. Assentos contam pelo `playingSeatOf` exportado do `reputation.dao.ts` (mestre ou jogador, sem espectador nem juggernaut) — a mesma regra do "divide mesa" do voto.
- `profile-card.mapper.ts` — `profileCardRelationOf(reading, self)`, `profileCardPresenceOf(relation, visiblyOnline)`, `toProfileCardDto(parts)`. Selo por `accountSealFieldsOf` (campaigns.mapper); `bannerId` só com `customizationAllowed(account)` (senão `null`, a coluna fica); `color` efetiva por `memberColorOf`.
- `profile-card.service.ts` — `ProfileCardService({ cards, friendships, reputation, presence, badges })`. `cardOf(viewerId, targetId)`: conta ausente/suspensa → `ProfileCardNotFoundError` (`PROFILE_NOT_FOUND`, 404, sem distinguir os dois); depois relação (`FriendshipsDao.relationBetween`), assentos, `reputation.summaryOf(target, viewer)`, mesas e amigos em comum e `badges.badgesOf(target)` em paralelo. `cardByUsername(viewerId, username)`: `accountIdByUsername` → sem conta ativa, `ProfileCardNotFoundError('@<username>')` (o mesmo 404) → `cardOf`.
- `account-badges.port.ts` — `AccountBadgesPort.badgesOf(userId)` → `BadgeDto[]` (só com imagem, na ordem do catálogo); quem cumpre é o `BadgesService` (ver [`../badges.md`](../badges.md)). O mapper copia para `profileCardDto.badges`.
- `profile-card-presence.port.ts` — `ProfileCardPresencePort.isVisiblyOnline(userId)`; quem cumpre é o `AccountPresenceService` (o `wireRealtime` o expõe como `accountPresence` nas saídas, e o `buildApp` o passa ao `createProfilesModule`, junto de `reputation.service`).
- `profile-card.routes.ts` — `registerProfileCardRoute(app, cards)` e `registerProfileLookupRoute(app, cards)`, ligados pelo `profiles.plugin.ts` dentro do plugin do `profilesRoutes` (herdam o rate limit e o tratador de erro do módulo). Limite: 60 leituras/minuto por conta no card por id (`RATE_LIMITED` 429 com `retryAfterSeconds`).

## Busca pelo @ (`GET /api/users/by-username/:username/card`)

- Parâmetro pelo `profileLookupParamsDto` (o `typedUsernameDto`: tira o "@" da frente, minúsculas, formato do @). Fora do formato — e-mail incluído — é 400 `INVALID_BODY`: a busca nunca vira teste de e-mail.
- 200 `profileCardResponseDto` (o mesmo card, uma ida só; não há rota de "existe?"). @ inexistente e conta suspensa → o **mesmo** 404 `PROFILE_NOT_FOUND` (corpo idêntico). Sem sessão 401. Ler o próprio @ → `relation: 'self'`; quem bloqueou o leitor aparece com `none`.
- Limite próprio: **30 buscas/minuto por conta**, num contador só dela (não gasta o das 60 leituras do card) → 429 `RATE_LIMITED` com `retryAfterSeconds`. Nunca sai e-mail nem hash (as mesmas colunas do card).

## Regras

- Relação: `self` (ler a si) → `blocked` (o leitor bloqueou) → `friend` → `outgoing` (pedido do leitor) → `incoming` → `none`. Ser bloqueado pelo outro lê `none` (o bloqueio já desfaz amizade e pedidos dele); o pedido pendente do próprio leitor continua `outgoing`, como a tela de amigos mostra (o pedido "silencioso").
- Presença só entre amigos: `online` se visível, invisível/desconectado → `offline`; qualquer outra relação (inclusive `self`) → `null`.
- Reputação como o leitor a vê (`myVote` dele; `percent` `null` abaixo do mínimo de votos — ver `reputation.md`).

- Insígnias: `badges` é o que a `AccountBadgesPort` devolve; conta sem insígnia → `[]`.

## Denúncia (client)

"Denunciar" no menu do card abre o `ReportUserDialog` (`client/src/features/profile-card/report-user-dialog.tsx`), com o servidor em [`../reports.md`](../reports.md):

- Motivo (obrigatório), detalhes (opcional, até 1000), **mesa onde aconteceu** (um `<select>` com "Nenhuma" e as `mutualCampaigns` do card; sem mesa em comum o campo não aparece) e **prints** (`ScreenshotShotsField` de `client/src/components/screenshot-shots/`: até 5, PNG/JPEG/WebP de até 5 MB, miniatura por object URL e "Remover print N").
- `components/screenshot-shots/use-screenshot-shots.ts` — `useScreenshotShots({ upload, limitText })` e `screenshotRefusalOf(file, kept, limitText)` (o diálogo passa o `uploadReportAttachment` e "Até 5 prints por denúncia."; o relato de bug usa o mesmo): o 6º, o tipo errado e o acima de 5 MB são recusados **antes de subir**, com uma frase só ("Até 5 prints por denúncia.", "Envie um PNG, JPEG ou WebP.", "O print passa de 5 MB."). O object URL sai ao remover o print ou fechar o diálogo.
- Enviar: os prints sobem **primeiro**, um por vez, pela `ProfileCardApi.uploadReportAttachment` (`POST /api/reports/attachments`, validado pelo `userReportAttachmentResponseDto`); o que falha mostra o erro **no próprio print** (`reportShotFailureText`) e a denúncia não sai. O que subiu guarda o id: enviar de novo só tenta os outros. Depois, `report(userId, { reason, details, campaignId?, attachmentIds? })` (os dois só quando há).
- Recusas da denúncia pelo `cardCommandFailureText`: `campaign_not_shared` ("Vocês não jogam juntos nessa mesa."), `attachment_not_found` ("Um dos prints não foi encontrado. Anexe de novo."), além das que já existiam.
- Specs: `client/test/components/screenshot-shots/use-screenshot-shots.spec.ts` (as recusas e as bordas de 5 prints e 5 MiB) e `report-user-dialog.spec.tsx` (o `ProfileCardApiFake` guarda os ids em `uploads` e recusa um arquivo pelo nome com `refuseUploadOf`).

## Testes

- Unit: `server/test/modules/profiles/profile-card.mapper.spec.ts`, `profile-card.service.spec.ts` (insígnias só do alvo, `cardByUsername` igual ao `cardOf`, `self`, @ desconhecido sem ler bloco nenhum; fakes nomeados em `server/test/support/profile-card-fakes.ts`, com `AccountBadgesFake`).
- Integração: `server/test/integration/profile-card.spec.ts` (401, 404 de suspensa/inexistente, bloqueio lido como `none`, amigo/`self`, mesas em comum sem espectador/juggernaut, contagem por papel, amigos em comum, reputação, sem e-mail/hash, 429) e `profile-lookup.spec.ts` (o @ em qualquer caixa e com "@", `self`, bloqueio `none`, suspensa e inexistente com o mesmo corpo 404, e-mail e `b` → 400, 401, a 31ª → 429, sem e-mail/hash; as insígnias no card pelo @ e por id na ordem do catálogo, sem a que não tem imagem, e em `GET /account/profile`).
