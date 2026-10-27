# Client · peças da mesa: capa, status, avisos, tags, prévia, edição e ao vivo

O que o client tem para mostrar e editar a mesa com o contrato ampliado (plano `docs/plans/2026-10-24-tela-detalhes-configuracoes-e-nova-mesa.md`). As telas que usam isto (diálogo "Nova mesa" e visão geral do detalhe) ficam em [`home.md`](home.md); a página "Configurações da mesa", na sala, em [`campaign-settings.md`](campaign-settings.md). Contrato em [`../contracts.md`](../contracts.md).

## Textos (`src/lib/`)

- `campaign-status.ts` — `CAMPAIGN_STATUSES` (ordem do contrato: `building`, `recruiting`, `ongoing`, `finished`), `CAMPAIGN_STATUS_LABEL` ("Em construção", "Recrutando", "Em andamento", "Finalizada"), `CAMPAIGN_STATUS_HINT` (uma linha por status, para o formulário) e `statusToneClass(status)` → a classe de cor (tabela em [`design-system.md`](design-system.md)).
- `content-warnings.ts` — `CONTENT_WARNINGS` (ordem do contrato), `CONTENT_WARNING_LABEL` ("+18", "Violência", "Terror", "Gore", "Linguagem forte", "Temas sensíveis"), `TAG_SUGGESTIONS` (9 sugestões fixas), `sortedContentWarnings(avisos)` (na ordem do formulário) e `toggleContentWarning(avisos, aviso)` (liga/desliga mantendo a ordem).
- `campaign-tags.ts` — `addTag(tags, digitado)` (trim; ignora vazio, acima de `CAMPAIGN_TAG_MAX_LENGTH`, repetida pelo `campaignTagKey` do contracts — sem caixa nem acento — e acima de `CAMPAIGN_TAGS_MAX`; sem mudança devolve o mesmo array), `removeLastTag(tags)` (Backspace no campo vazio), `removeTag(tags, tag)` e `hasRoomForTag(tags)`. A normalização é a do contracts, nunca repetida.
- `campaign-cover.ts` — `fallbackCoverOf(id)` → `{ kind: 'drawn', ...defaultCoverOf(id) }` (game-core): a capa de uma mesa reaberta de uma lista gravada antes de a capa existir. O `coverFor` antigo saiu.
- `campaign-meta.ts` — o `campaignMeta` **não traz mais o status** (ele tem o `StatusBadge`); traz "Mestre: X" (o dono, `masterName`) a todo leitor que não é o dono — `campaignMeta(campaign, readerId)` compara o `ownerId`; o co-mestre lê o dono. `ROLE_LABEL`: Mestre · Jogador · Espectador.

## Componentes (`src/components/`)

- `campaign-cover.tsx` — `CampaignCover({ cover: CampaignCoverDto, className? })`: `image` → `<img src="/api/assets/<id>" alt="">` (`object-cover`) sobre `bg-panel`; `drawn` → um dos 3 desenhos (anel, costa, serra) no tom `chart-<tone>` sobre a grade dourada fraca. Sempre `aria-hidden`; o desenhado leva `data-cover-drawing`/`data-cover-tone` (o que o teste lê, a arte não tem texto). Usado na linha, na faixa "Continuar", no trilho (`OpenTable.cover`) e na prévia.
- `cover-picker.tsx` — `CoverPicker({ value, onChange, image?, hint?, disabled?, className? })`: dois `radiogroup` do Radix, "Desenho" (Masmorra, Costa, Montanhas: miniatura do `CampaignCover` no tom atual) e "Tom" (Dourado, Aço, Brasa, Musgo: amostra `bg-chart-N`); setas trocam a escolha. Com capa `image`, nada marcado; escolher desenho ou tom volta à última capa desenhada com a mudança. `image` é o lugar do `ImagePicker` (a página "Configurações da mesa" liga com `purpose="cover"`, ver [`campaign-settings.md`](campaign-settings.md)); `hint` é uma linha embaixo.
- `status-badge.tsx` — `StatusBadge({ status, className? })`: ponto (`bg-current`, `aria-hidden`) + rótulo em caixa alta espaçada, na cor do status. Na linha da home (antes da meta) e na faixa "Continuar".
- `campaign-preview-card.tsx` — `CampaignPreviewCard({ campaign: CampaignPreview, label?, className? })`, com `CampaignPreview` = `{ name, system, status, description, visibility, hasPassword, cover, contentWarnings, tags }` (rascunho ou mesa gravada). `section` nomeada pela sobrelinha (padrão "Assim ela aparece no hub"); capa 16:10 com "Mestre" e o `StatusBadge` em faixas `bg-panel/85`; nome em display (vazio → "Sua mesa nova" em `text-placeholder`); meta "Sistema · privada|pública · com senha" (sem sistema → "Sistema a definir"); descrição em até 3 linhas; lista "Avisos e tags": os avisos (na ordem do formulário) antes de no máximo 3 tags.

## Serviço (`src/services/campaigns-api.ts`)

- Todas as falhas (`CampaignsFailure`): `unauthenticated` (401), `not_found` (404), `invalid` (400), `password_required` / `password_invalid` / `forbidden` / `not_open` (403 pelo `code`; `CAMPAIGN_NOT_OPEN` = mestre sem a mesa aberta), `rate_limited` (429), `offline`, `unexpected`.
- `update(campaignId, input: UpdateCampaignRequestInput)` → `PATCH /campaigns/:id` → `CampaignDetailDto`. Recebe o **input** do DTO: o tipo inferido de saída do `updateCampaignRequestDto` exige as chaves `system`/`description` (o `transform` do campo opcional), então a tela passa só o que mudou; chave `undefined` some no JSON.
- `regenerateCode(campaignId)` → `POST /campaigns/:id/join-code` → `CampaignDetailDto` com o código novo.
- `remove(campaignId)` → `DELETE /campaigns/:id` → `null` (204).
- Falha nova `forbidden` (403 com `code: FORBIDDEN`: jogador pedindo o que é do mestre); 403 com outro código sem mapa continua `unexpected`. Mensagem: `FORBIDDEN_MESSAGE` ("Só o mestre da mesa pode fazer isso.") pelo `failureMessage`.
- `CampaignsApiFake` (`client/test/support/`): `answer('update' | 'regenerateCode' | 'remove', resultado)`, `hold(...)`; `callsOf('update')` registra `{ campaignId, input }`, os outros dois o `campaignId`. Padrões: `update` → `detailOf(VHARN)`, `regenerateCode` → `detailOf(VHARN, { joinCode: 'QWER5TYU' })`, `remove` → `null`. Fixtures: `VHARN` (`recruiting`, capa desenho 2 tom 1, aviso `horror`, tags "Investigação" e "Masmorra") e `QUELM` (`building`, desenho 0 tom 4, sem avisos nem tags); `detailOf` põe `online: false` em todos, `createdAt` 01/09/2026 e `lastAccessAt` = `lastEnteredAt`.

## Ao vivo (C7)

- `TableSessionUpdate` ganha `campaignUpdated { event: SessionCampaignUpdatedDto }` e `campaignDeleted { event: SessionCampaignDeletedDto }`; a `TableVisit` assina `session:campaignUpdated`/`session:campaignDeleted` e entrega só os válidos pelo DTO e da mesa aberta.
- `table-presence-store` — `campaignUpdated` acima da versão (mesma mesa, depois do snapshot) só move `version` e `at`; membros intactos.
- `open-tables-store` — `OpenTableRef.cover?` (o `useOpenTable` passa a do detalhe); `OpenTable.cover` sempre presente (sem ela, `fallbackCoverOf`), gravada no `sessionStorage` (campo opcional no schema local). `campaignUpdated` troca `name` e `cover` no lugar e regrava. `campaignDeleted` fecha a mesa (`close`: o `session:leave` é inofensivo, o server já tirou o socket) e guarda `deletedNotice = { campaignId, name }`; `dismissDeletedNotice()` limpa; `closeAll`/`suspendAll` também.
- `features/sessions/use-leave-deleted-table.ts` — `useLeaveDeletedTable(openTables)`, no `ShellRoute`: com `deletedNotice`, quem está em `/campaigns/<id>` (ou abaixo: sala, detalhe) vai para `/` (`replace`).
- `app/shell/deleted-table-notice.tsx` — `DeletedTableNotice({ openTables })`, no topo do `main` do `AppShell`: `role="alert"` com "A mesa “X” foi excluída pelo mestre." (`campaignDeletedMessage(nome)`) e "Fechar aviso". Aparece em qualquer tela até ser fechado.
- O `h1` da sala continua o nome do `loader` (o trilho é que troca ao vivo); o detalhe e a sala releem no próximo `loader`.
- Fixtures: `vharnRenamed(overrides)` (nome "Os Sinos Calados", capa imagem, versão 2) e `vharnDeleted(overrides)` em `table-session-fixtures.ts`.

## Testes

`client/test/lib/{campaign-status,content-warnings,campaign-tags,campaign-cover}.spec.ts`, `client/test/components/{campaign-cover,cover-picker,status-badge,campaign-preview-card}.spec.tsx`, `client/test/services/{campaigns-api,table-session-api}.spec.ts`, `client/test/stores/{open-tables-store,table-presence-store}.spec.ts` e, pelo router, `client/test/features/board/play-room-page.spec.tsx` ("campaign changed by the master").
