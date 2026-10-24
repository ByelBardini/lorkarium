# Member cards

A ficha da mesa: o que o card de cada jogador na aba "Na mesa" mostra além do token principal — nome do personagem, CA, CD e duas anotações. É **da mesa e do membro** (não da cena nem do token): sobrevive à troca de cena e de token principal. É o passo intermediário antes do `Character` do spec §6. Vive em `server/src/modules/member-cards/`. Plano de origem: `docs/plans/2026-10-22-tela-na-mesa.md`. Contrato em [`contracts/tabuleiro.md`](contracts/tabuleiro.md) (`member-card.dto.ts`).

## Tabela (`member-cards.po.ts`, migração `0032_member_cards`)

- `member_cards`: `campaign_id`, `user_id` (PK nos dois), `character_name` / `note_one` / `note_two` (`text` nulos, `CHECK` de `char_length` 40 / 80 / 80), `armor_class` / `difficulty_class` (`smallint` nulos, `CHECK` `BETWEEN 0 AND 999`: `member_cards_armor_class_range`, `member_cards_difficulty_class_range`), `updated_at`.
- `anchor_token_id` (migração `0036_token_anchor`): a âncora do personagem do membro no elenco (→ `tokens`, set null, único). Gravada pelo `token:linkToCard` (ver [`tokens/character.md`](tokens/character.md)); `toMemberCardDto` a leva (`memberCardDto.anchorTokenId`); `MemberCardsDao.findOfMember(campaignId, userId)` lê uma ficha.
- **FK composta** `member_cards_member_fk` → `campaign_members(campaign_id, user_id)` `on delete cascade`: só membro tem ficha, e sair da mesa (ou apagar a mesa) apaga a ficha.
- A linha só existe depois que alguém grava algo; ausente = ficha vazia (todos `null`).
- `MemberCardChangesPo`: as chaves que um `save` escreve (ausente mantém, `null` limpa).

## DAO (`member-cards.dao.ts`)

- `MemberCardsDao(db | tx)`: `listOfCampaign(campaignId)` → `MemberCardPo[]` (por `user_id`; `inner join` com `campaign_members` pelo par da PK e `role <> 'spectator'`: a ficha de quem virou espectador fica guardada e escondida até ele voltar a jogador); `save(campaignId, userId, changes)` → a linha inteira depois da escrita (`insert … onConflictDoUpdate` escrevendo só as chaves recebidas + `updated_at`: é um patch).

## Regra (`member-card.bo.ts`)

- `MemberCardBo(access, { memberId, role })` (`role` = o papel do alvo, `null` fora da mesa).`requireEdit()`: o próprio membro e o mestre editam; a mesa toda vê (nada a redigir). `memberId` fora da mesa **ou espectador** → `MEMBER_NOT_FOUND` (`MemberNotFoundError`, de `campaigns/campaigns.error.ts` — um código, uma classe, a mesma da troca de papel e do `CharacterLinkBo`; cita a mesa e o id); um jogador na ficha de outro → `FORBIDDEN` "user <Caio> may not edit the card of <Bia> … requires being that member or the master role". Quem não é membro continua `CAMPAIGN_NOT_FOUND` (pelo `memberAccessOf`).

## Mapper e service

- `member-cards.mapper.ts`: `toMemberCardDto(row)` (a ficha sem `campaignId`/`updatedAt`) e `toMemberCardChangesPo(changes)` (só as chaves presentes; `null` vira escrita de `null`, `undefined` não escreve).
- `MemberCardsService({ members, transaction, publisher, clock })`.`update(userId, campaignId, { memberId, changes })` → versão nova: `memberAccessOf` (fora da mesa → `CAMPAIGN_NOT_FOUND`, sem travar a cena) → `inLockedCast(transaction, campaignId, work)` (`scenes/locked-cast.ts`; trava o **elenco**, qualquer que seja o `sceneId` do comando) → `findMembership(alvo)` → BO → `save` → `bumpVersion` do elenco → **depois do commit** `BoardPublisherPort.memberCardChanged` com a ficha inteira. A ficha é da mesa: a mudança soma a versão do elenco e vai às salas dele, com o `sceneId` dele (como a lista de condições e a ficha ligada pelo `token:linkToCard`), numa ordem só com os eventos das âncoras. Ativar outro grid não perde nem reordena a ficha. Recusa não grava, não soma nem publica.
- `MemberCardTransactionRunner` entrega `{ scenes, members, memberCards }` presos ao `tx` (`MemberCardWriteDaos` = `CastOnlyLockDaos` (`lockCastOf`, `bumpVersion`) + membros + fichas).
- `inLockedCast` (B8): trava o elenco → `work` devolve `CastChange { value, changed }` → soma o elenco só se `changed` → `SavedInScene { value, version, sceneId: elenco }` (abre o evento pelo `gridEventBase`). Também usado pelo `ConditionsService.define` (nome repetido = `changed: false`, sem soma).
- O driver do `/desenvolver-server` acusa `identidade-do-payload` no `memberId`: falso positivo (é o alvo; quem pede vem da conexão), o mesmo do `playerId` do `main-token.service.ts`.

## Snapshot

- `board:sync`: `boardStateDto.memberCards` (as fichas gravadas da mesa, iguais para todo público; mesa sem ficha → `[]`) pelo `BoardService` (dep `memberCards: Pick<MemberCardsDao, 'listOfCampaign'>`, lida no `tablePiecesOf` junto com a lista de condições: é da mesa, não da cena) e o `toBoardStateDto`.
- Fixtures com `memberCards: []`: `vharnBoard` (`client/test/support/table-session-fixtures.ts`) e o estado do `board.dto.spec.ts`.

## Contrato e borda

| Comando             | Quem                      | Ack                                                                                                                                | Evento                                                                                                     |
| ------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `member:updateCard` | o próprio membro e mestre | `{ ok: true, version }` (versão do elenco) · `FORBIDDEN`, `MEMBER_NOT_FOUND`, `CAMPAIGN_NOT_FOUND`, `INVALID_BODY`, `RATE_LIMITED` | `member:cardChanged` `{ campaignId, sceneId: elenco, version, at, card }` às salas do elenco (todo membro) |

- Payload `updateMemberCardCommandDto` `{ actionId, campaignId, memberId, changes }` (estrito: `userId` forjado → `INVALID_BODY`; quem pede vem da conexão, §7.3).
- `board.gateway.ts`: `socket.on('member:updateCard', mutate(updateMemberCardCommandDto, memberCards.update))` (dep `memberCards: Pick<MemberCardsService, 'update'>`); o `MemberNotFoundError` é um `CampaignError` (já entre os erros conhecidos; o `member-cards.error.ts` saiu) e `MEMBER_NOT_FOUND: 'Member not found'` no `PUBLIC_MESSAGE`.
- `BoardPublisherPort.memberCardChanged` → `SocketIoBoardPublisher` emite `member:cardChanged` à `sceneRoom` do `sceneId` do evento — o elenco (nada a redigir).
- `member-cards.plugin.ts` (`createMemberCardsModule({ db, publisher, clock })` → `{ service }`), montado no `wireRealtime` (`server/src/app/build-app.ts`) e entregue ao `createBoardModule`.

## Testes

- Integração `server/test/integration/member-cards-dao.spec.ts`: grava e lê, patch mantém o resto, `null` limpa só o campo, `save` devolve a linha, duas fichas na mesa, `CHECK` recusa CA 1000, FK recusa a ficha de quem não é membro, cascata por sair da mesa e por apagar a mesa, isolamento (a ficha da Vharn não sai na Quelm).
- Unit `server/test/modules/member-cards/{member-card.bo,member-cards.mapper,member-cards.service}.spec.ts` (diário `lock cast → save → bump cast → commit → publish`; `FORBIDDEN` e `MEMBER_NOT_FOUND` param no `lock cast`; `CAMPAIGN_NOT_FOUND` sem trava; com a Torre no comando, nem a Torre nem o grupo travam ou somam).
- Fakes `server/test/support/member-cards-fakes.ts`: `MemberCardsDaoFake(journal, rows)` (escreve `'save'`) e `MemberCardTransactionRunnerFake(scenes, members, memberCards)` (escreve `'commit'`); fábrica `memberCardPo()` (a ficha vazia da Bia na Vharn) em `member-cards-factories.ts`; `BoardPublisherFake.memberCardChanges`.
- Integração `server/test/integration/board.spec.ts` (`member cards in the snapshot`): a ficha da Bia no sync de Ana, Bia e Caio; mesa sem ficha → `[]`; o sync da Quelm não traz a ficha da Vharn.
- Integração `server/test/integration/member-cards.spec.ts` (`useTokenTable()`): a Bia muda a própria CA e Ana e Caio ouvem a ficha inteira, o sync traz; a Ana mestre escreve a anotação da Bia; apelido só de espaços vira `null`; reinício mantém (critério 13); o Caio na ficha da Bia → `FORBIDDEN` sem evento; `memberId` fora da Vharn → `MEMBER_NOT_FOUND` "Member not found"; `userId` forjado → `INVALID_BODY`; `campaignId` da Quelm → `CAMPAIGN_NOT_FOUND` e a sala da Quelm não ouve nada; (B8) o Caio com a Torre pública aberta ouve a CA da Bia com o `sceneId` do elenco e a versão do ack = a do snapshot do elenco; a Ana leva o grupo à Torre e a ficha continua (sync da Torre traz, a mudança seguinte vem do elenco, versão 2). `grid-pieces.spec.ts` e `scene-activation.spec.ts` também esperam o elenco; `activateGrid` saiu para `test/support/grids.ts`.
- `truncateAllTables` (`server/test/support/test-database.ts`) inclui `member_cards`.
