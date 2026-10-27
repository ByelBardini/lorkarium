# Client — papéis na mesa: dono, co-mestre, juggernaut

Quem troca o papel de quem na aba "Na mesa" e o modo juggernaut do admin. A aba em si (seções, card, linha do mestre) fica em [`table-people.md`](table-people.md); a regra do server em [`../campaigns/papeis.md`](../campaigns/papeis.md). Hub: [`../client.md`](../client.md).

## Quem é quem

- **Dono:** `campaign.ownerId` (o criador, fixo; `masterName` é o nome dele). Ninguém troca o papel dele.
- **Co-mestre:** outro membro `master`. Tem as ferramentas de mestre e as configurações; não promove nem rebaixa mestres e não exclui a mesa.
- **Juggernaut:** admin com o modo ligado na mesa (`sessionMemberDto.juggernaut`, `campaignSummaryDto.juggernaut`): é `master` enquanto ligado, com poder de dono, papel travado. O roster o traz só enquanto online.
- O assento do leitor numa mesa em que está: `readerSeatOf(campaign, readerId)` (`src/lib/campaign-seat.ts`, de `myRole`, `ownerId` e `juggernaut` do resumo/detalhe); o "Excluir mesa" e o menu do juggernaut leem dele.
- A regra é o `table-seats.ts` do game-core (`TableSeat`, `hasOwnerPowers`, `isRoleLocked`, `assignableRolesOf(ator, alvo)`): o client monta os menus com ela, o server recusa com ela. Nunca reescrita no client.

## Rede (`src/services/campaigns-api.ts`)

- `setMemberRole(campaignId, userId, role)` (`role` = `MemberRole` = o `updateMemberRoleRequestDto`: `'master' | 'player' | 'spectator'`) → `PATCH /api/campaigns/:campaignId/members/:userId` `{ role }`; o 200 é o `campaignMemberDto` validado (fora do DTO → `unexpected`). 403 `FORBIDDEN` → `forbidden`; 404 `MEMBER_NOT_FOUND` → `member_not_found` (o 404 sem esse código continua `not_found`); sem rede → `offline`.
- `startJuggernaut(campaignId)` → `POST /api/campaigns/:campaignId/juggernaut`; 200 = `campaignResponseDto` (o detalhe com `myRole: 'master'`, `juggernaut: true`). 403 `FORBIDDEN_ROLE` (conta comum) → `forbidden`; 409 `ALREADY_OWNER` (o dono pedindo) → `already_owner` (o 409 sem esse código → `unexpected`); 404 → `not_found`.
- `endJuggernaut(campaignId)` → `DELETE …/juggernaut`; 200 = `endJuggernautResponseDto` (`{ myRole }`: o papel de antes, ou `null` = não era membro e saiu da mesa). Fora do DTO → `unexpected`.
- Fake `CampaignsApiFake`: `setMemberRole` grava `{ campaignId, userId, role }`; `startJuggernaut`/`endJuggernaut` gravam o `campaignId` (padrão: o detalhe da QUELM como juggernaut; `{ myRole: null }`).

## Seções e presença

- `tableRosterOf({ …, ownerId })` (ver [`table-people.md`](table-people.md)): `juggernauts` (`RosterRow`: só os `juggernaut` online, fora de `masters`), `masters` (`RosterMaster` = `RosterRow & { owner }`; o dono primeiro, depois os co-mestres na ordem do server). O `SessionPresencePanel` recebe `ownerId` (`RoomSidePanel` ← `PlayRoomPage`, `campaign.ownerId`).
- `table-presence-store.ts` (`isListable`): o juggernaut que sai (`memberLeft`) ou chega offline no `memberUpdated` some da lista, como o espectador.
- `campaignMeta(campaign, readerId)` (`src/lib/campaign-meta.ts`): "Mestre: X" para todo leitor que não é o dono (`ownerId !== readerId`), co-mestre incluído; `readerId` vem do `user.id` da home, da sessão no detalhe (`campaign-routes.tsx`) e do loader do Explorar (`readerId`); o `PublicCampaignDialog` passa `null` (o leitor não está na mesa).

## Mudar o papel na aba

- Injeção: `MemberRoleContext` (`use-member-role-change.ts`) com o `MemberRoleChanger` (= `Pick<CampaignsApi, 'setMemberRole' | 'startJuggernaut' | 'endJuggernaut'>`); o `MemberRoleProvider` (`member-role-provider.tsx`) envolve o `PlayRoomPage` no `tableRoute` (`campaign-routes.tsx`, `deps.campaignsApi`). Fora dele (harness do card, specs sem provider) não há comando de papel — sem botão nem "⋯".
- `useMemberRoleChange(campaignId, userId)` → `{ pending, failure, change(role) }` ou `null` sem provider. O sucesso não muda nada local: o `session:memberUpdated` que o server publica move a pessoa de seção. Recusa → `roleChangeFailureMessage` (`member_not_found` → "Essa pessoa não está mais na mesa."; o resto pelo `commandFailureMessage`).
- **O que cada linha oferece vem do roster:** `tableRosterOf` põe em cada linha `assignable` = `assignableRolesOf(assento do viewer, assento da pessoa)` (`seatOfMember(member, ownerId)`; o viewer pelo próprio membro no roster — fora dele, nenhum papel). Nada de `isMaster` para decidir menu. Na prática: o dono e o juggernaut tornam mestre o jogador e o espectador e rebaixam o co-mestre; o co-mestre só troca jogador ↔ espectador; ninguém mexe no dono, no juggernaut nem na própria linha; o jogador e o espectador não veem controle nenhum.
- `useRoleChangeFlow(campaignId, userId)` (`use-member-role-change.ts`) → `RoleChangeFlow` (= `MemberRoleChange` + `asking`, `pick(role)`, `confirm`, `cancel`) ou `null` sem provider: `pick('player')` manda na hora; `master` e `spectator` (`ConfirmedRole`) perguntam antes.
- `RoleActionsMenu({ name, roles, disabled, onPick })` (`role-actions-menu.tsx`): o "⋯" ("Mais ações de Bia"), um item por papel na ordem do game-core — "Tornar mestre" (coroa), "Mover para jogadores", "Mover para espectadores"; sem papel, não aparece. `DropdownMenu modal={false}` e o foco não volta ao "⋯" ao fechar (`onCloseAutoFocus` prevenido), senão roubaria o "Cancelar".
- `RoleChangeConfirm` / `RoleChangeFeedback` (`role-change-confirm.tsx`): a pergunta no lugar, embaixo da linha (`alertdialog`, Esc cancela, "Cancelar" com foco): "Tornar Bia mestre?" · "Bia passa a ver grids privados, tokens ocultos e rolagens secretas." · "Tornar mestre" (caixa `primary/10`); "Mover Bia para espectadores?" · "Tokens, ficha e personagem ficam guardados e voltam numa nova promoção." · "Mover" (caixa `destructive/10`). Depois, a recusa em `role="alert"` na linha.
- Onde: no card do jogador, o "⋯" ao lado do "Achar no mapa" ("Tornar mestre", "Mover para espectadores"); na `MasterRow`, o "⋯" do co-mestre ("Mover para jogadores" na hora, "Mover para espectadores" com pergunta); na `SpectatorRow`, o botão "Promover" (nome "Promover Duda a jogador"; "Promovendo…" e `disabled` enquanto vai) e o "⋯" com "Tornar mestre".

## Modo juggernaut (admin)

- **Explorar:** "Entrar como juggernaut" no card (ver [`home.md`](home.md)) → `startJuggernaut` pela ação do Explorar → o detalhe da mesa (`/campaigns/:id`, "Entrar na mesa"); recusa no `role="alert"` do card.
- **Sala:** "Mais ações da mesa" no topo (`RoomMoreMenu`, `room-more-menu.tsx`), só para `user.role === 'admin'` que não é o dono. `useJuggernautMode({ campaign, reader, openTables, interaction })` (`use-juggernaut-mode.ts`) usa o `MemberRoleChanger` do `MemberRoleProvider`: "Ativar modo juggernaut" → `startJuggernaut` e revalida a rota (o detalhe volta `myRole: 'master'`, `juggernaut: true`; a presença o move para a seção "Juggernaut" e o `useViewerRole` pede os snapshots); "Sair do modo juggernaut" → `endJuggernaut`: `myRole` de volta → revalida e a sala segue no papel de antes; `myRole: null` → vai a "Explorar mesas" (`EXPLORE_PATH`) e fecha a mesa na aba. Recusa → a linha de status do tabuleiro (`juggernautFailureMessage`: "Só um admin entra como juggernaut.", "Você já é o dono desta mesa.", o resto pelo `commandFailureMessage`).
- **Saiu por outra aba:** `session:removedFromTable` fecha a mesa com "Você saiu da mesa “Vharn”." (ver [`realtime.md`](realtime.md)).

## Specs

- `client/test/services/campaigns-api.spec.ts` (`setMemberRole`, `juggernaut`), `client/test/lib/table-roster.spec.ts` (`owner and juggernaut`), `client/test/stores/table-presence-store.spec.ts` (o juggernaut que sai), `client/test/lib/campaign-meta.spec.ts` (co-mestre lê "Mestre: Ana"), `session-presence-panel.spec.tsx` (`spectators and roles`), `session-presence-panel-roles.spec.tsx` (seção do juggernaut, "Dono"/"Mestre", "Tornar mestre" com pergunta e Esc, rebaixar o co-mestre e a recusa, o co-mestre sem menu de mestre, ninguém no juggernaut, a espectadora sem controle), `client/test/features/sessions/use-member-role-change.spec.tsx` (`useRoleChangeFlow`).
- Modo juggernaut: `client/test/features/explore/explore-route.spec.tsx` (`"Entrar como juggernaut" (admin)`), `client/test/features/board/room-more-menu.spec.tsx` (ativar, sair de volta a jogador, sair sem ser membro, recusa na linha de status, o dono e a conta comum sem menu), `client/test/features/campaigns/campaign-messages.spec.ts`, `client/test/features/campaigns/campaign-settings-danger.spec.tsx` ("Excluir mesa" da Ana e do Root, não da Bia), `client/test/lib/campaign-seat.spec.ts`.
- Fixtures: `duda(overrides)` (Duda espectadora online; o mesmo id do `campaigns-api-fake.ts`) e `rootJuggernaut(overrides)` (Root, admin `ROOT_ADMIN` do `auth-api-fake.ts`, `master` com `juggernaut: true`, online) em `table-session-fixtures.ts`; `VHARN.ownerId` = Ana, `QUELM.ownerId` e `PUBLIC_VHARN.ownerId` = Bia.
