# Modo juggernaut

Detalhe de [`../campaigns.md`](../campaigns.md) e [`papeis.md`](papeis.md). Um admin do Lorkarium (papel global `admin`, ver [`../auth.md`](../auth.md)) liga, **mesa a mesa**, um modo em que tem os poderes do dono: vira `master`, gere os mestres, exclui a mesa e ninguém o rebaixa. Acesso privilegiado de emergência ("break glass"): ativação explícita, aparece para a mesa enquanto online, vai ao log pino e cai quando a conta perde o admin. Plano de origem: `docs/plans/2026-10-26-co-mestres-e-juggernaut.md` (fases 5–8).

## Gravado na linha do membro

- `campaign_members.juggernaut_since` (não nulo = ligado) e `role_before_juggernaut` (o papel a que volta; nulo = não era membro), migração `0064_campaign_juggernaut` com dois `CHECK` (ver [`../campaigns.md`](../campaigns.md), Tabelas). Enquanto ligado o papel é `master`: `isMaster()`, as salas dos mestres, o `requireMaster` de cada módulo e o client funcionam sem mudança.
- `TableSeat.juggernaut` (game-core [`table-seats.ts`](../game-core.md)) sai de `juggernaut_since` no `toTableSeat` do mapper: `hasOwnerPowers` (excluir a mesa, gerir mestres) e `isRoleLocked` (ninguém muda o papel dele, nem o dono: `JuggernautRoleLockedError`, `FORBIDDEN`). O juggernaut também não rebaixa o dono.

## Contrato (prefixo `/api`, `requireRole('admin')`: 401 `UNAUTHENTICATED` · 403 `FORBIDDEN_ROLE`)

| Rota                                       | Saída                                                                                                                  | Erros                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `POST /campaigns/:campaignId/juggernaut`   | 200 `campaignResponseDto` (o detalhe como o admin lê: `myRole: 'master'`, `juggernaut: true`, `joinCode`); idempotente | 400 `INVALID_PARAMS` · 404 `CAMPAIGN_NOT_FOUND` · 409 `ALREADY_OWNER` |
| `DELETE /campaigns/:campaignId/juggernaut` | 200 `endJuggernautResponseDto` `{ myRole }` (o papel de antes; `null` = saiu da mesa); modo desligado → o papel atual  | 400 · 404 `CAMPAIGN_NOT_FOUND` (não membro)                           |

- Vale para **qualquer** mesa, privada ou com senha. Cada chamada vai ao log como `{ adminId, campaignId, action: 'juggernaut:start' | 'juggernaut:end' }` "juggernaut" (nunca e-mail).
- `campaignSummaryDto.juggernaut` (resumo e detalhe) diz se **quem lê** está no modo naquela mesa (`listOfUser` lê `juggernaut_since` da própria linha).

## Regra e service

- `juggernaut.bo.ts` — `JuggernautBo(campaignId, userId, seat | null)` (`JuggernautSeat` = `TableSeat` + `roleBefore`, montado por `toJuggernautBo(campaign, userId, membership)`): `start()` → `{ change: 'started', roleBefore }` · `unchanged` (já ligado) · o dono → `AlreadyOwnerError` (`ALREADY_OWNER`, 409, cita mesa e usuário); `end()` → `{ change: 'ended', restore }` · `{ change: 'unchanged', role }` (desligado) · não membro → `CAMPAIGN_NOT_FOUND`.
- `juggernaut.service.ts` — `JuggernautService({ campaigns, members, memberships, changed, removed, detail, clock })`, persiste antes de avisar:
  - `start(userId, campaignId)`: mesa (`findById`, sumida → `CAMPAIGN_NOT_FOUND`) → BO → `startJuggernaut` → `memberships.forget` → **só se era membro**, `changed.memberRoleChanged({ role: 'master', from })`; quem não era membro não é anunciado (offline não deixa rastro; aparece no `session:join`). Devolve `detail`.
  - `end(userId, campaignId)`: BO → `endJuggernaut` → `forget` → com papel de antes `memberRoleChanged({ role, from: 'master' })` (fecha as abas privadas se o papel não é mestre); sem → `removed.memberRemoved({ campaignId, userId })`.
  - `endAllOf(userId)`: `juggernautCampaignIdsOf` → `end` de cada (o backoffice chama ao tirar o admin, ver [`../user-admin.md`](../user-admin.md)).
- Porta `member-removed.port.ts` (`MemberRemovedPort.memberRemoved`), implementada pelo `TableSessionService` (ver [`../sessions.md`](../sessions.md)): a base do futuro "expulsar".
- Fiação: `pluginWith({ changed, roleChanged, removed })` cria o service; `campaigns.juggernaut()` o entrega ao `wireBackoffice` (só existe depois do `pluginWith`).

## Na mesa ao vivo, sem rastro

- Roster: `TablePresenceBo.lists` trata o juggernaut como o espectador (só enquanto online); `sessionMemberDto.juggernaut: true`, `role: 'master'`.
- Fora de Participantes (`membersOfRecord`), do `memberCount` (subconsulta exclui `juggernaut_since is not null`) e do `lastAccessAtOf`.
- Desligar sem papel de antes: `session:removedFromTable` `{ campaignId, at }` só às conexões dele, que saem de toda sala da mesa (como na exclusão); a mesa ouve `session:memberLeft` (se ele estava online).
- Conta como membro no `otherMembers` do backoffice enquanto ligado (a linha existe): pode bloquear excluir a conta do dono até o modo ser desligado.

## Testes

- Unit: `campaigns/juggernaut.bo.spec.ts`, `juggernaut.service.spec.ts` (fakes `JuggernautMembersFake` e `MemberRemovedFake` em `test/support/juggernaut-fakes.ts`), `campaigns.mapper.masters.spec.ts` (o `describe` do juggernaut), `sessions/table-presence.bo.spec.ts` (`lists`, `remove`), `sessions.mapper.spec.ts`, `sessions.service.member-role.spec.ts` (`memberRemoved`), `socket-io-session-publisher.spec.ts` (`memberRemoved`).
- Integração: `juggernaut.spec.ts` (borda: privada com senha, 401/403/404/409, a trava, gerir mestres, excluir com a mesa aberta, desligar, isolamento), `juggernaut-live.spec.ts` (Socket.IO real: `memberJoined` com `juggernaut`, o oculto no `board:sync`, sem rastro, `removedFromTable` em duas abas, `CAMPAIGN_NOT_FOUND` depois), `campaign-members-dao.spec.ts`, `campaign-juggernaut-migration.spec.ts`, `user-admin.spec.ts` (o juggernaut cai com o papel).
- Admin nos specs: `live.signUp(nome)` e `update users set role = 'admin'` (o guard relê a conta a cada pedido). No dev, o admin é o do `ADMIN_EMAIL`/`ADMIN_PASSWORD` do env (seed no boot).
