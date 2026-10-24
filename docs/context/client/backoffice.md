# Client · Backoffice (Usuários)

Hub: [`../client.md`](../client.md). A tela em que o admin convida gente nova e cuida das contas. Plano de origem: `docs/plans/2026-10-24-tela-backoffice-usuarios.md` (fases 8–11); mockup: `docs/pages/backoffice/usuarios/Backoffice.dc.html` (base, não lei). Server: [`../user-admin.md`](../user-admin.md) e [`../account-links.md`](../account-links.md).

## Rotas (`src/features/admin/admin-routes.tsx`)

- `/admin` — filha do root, **fora do shell**, guarda `admin`; `lazy` carrega `adminLayoutRoute(deps)` (o pedaço fica fora do bundle de quem joga). Filhos: `index` → `redirect('/admin/users')`, `users` (também `lazy`) → `usersRoute(deps)` e `emails` (`lazy`) → `mailTestRoute(deps)`.
- `usersRoute`: `loader` (`userAdminApi.directory()`; `unauthenticated` → `signedOut` + `/login?next=%2Fadmin%2Fusers`; `forbidden` → `dropAdminRole` (a sessão perde o papel, o menu para de oferecer o Backoffice) + `AdminForbiddenError`; o resto → `ApiLoadError`), `action` = `usersAction(deps)`, `shouldRevalidate` (mudar só a busca/filtros da URL **não** recarrega a lista; ação e "Tentar de novo" sim), `ErrorBoundary` = `AdminErrorScreen` (login pelo `SignedOutRedirect`, "Sem acesso" + "Você não tem mais acesso ao backoffice." + "Voltar para o app", ou o `LoadErrorScreen` com "Não deu para carregar os usuários.").
- O `now` é fixado uma vez por visita (os "há N" não andam com a página aberta).

## Moldura (`admin-layout.tsx`)

Lateral `bg-panel` (240 px a partir de `md`; abaixo, faixa no topo): cristal + LORKARIUM + "BACKOFFICE" em dourado; `nav` "Backoffice" com **Usuários** e **E-mails** (`AdminNavLink` sobre o `NavLink`, ativo = traço dourado de 2 px à esquerda); no pé "Voltar para o app" (→ `/`) e quem está logado (`UserAvatar`, apelido, papel). As outras seções do mock (Visão geral, Mesas, Convites, Armazenamento, Registro, Configurações) só entram quando tiverem plano.

## E-mails (`/admin/emails`)

- `mailTestRoute(deps)` (em `admin-routes.tsx`, `lazy`): `loader` = `userAdminApi.mailSamples()` (as recusas pelo mesmo `refusedLoad` dos usuários), `action` = `mail-test-action.ts` (`{ sampleId, to }` → `sendMailSample`; sessão caída e papel perdido vão ao `ErrorBoundary`), `ErrorBoundary` = `AdminErrorScreen` com "Não deu para carregar os e-mails do sistema.".
- `mail-test-page.tsx`: "E-mails" + "Mande um exemplo de cada e-mail do sistema…"; campo "E-mail de destino" (começa com o e-mail do admin; validado pelo `sendMailSampleRequestDto`, erro inline e foco); lista "E-mails do sistema" com nome, assunto e "Enviar" (`aria-label` "Enviar <nome>"); o que vai mostra "Enviando…" e os outros esperam; `role="status"` "“<assunto>” enviado para <e-mail>."; `mail_delivery_failed` → "O servidor de e-mail recusou ou não respondeu. Confira o SMTP_URL do server e tente de novo.".
- Spec: `client/test/features/admin/mail-test-route.spec.tsx`; fake `MAIL_SAMPLES` no `user-admin-api-fake.ts`.

## Página (`users-page.tsx`)

- Cabeçalho "Usuários" + "Quem tem acesso ao Lorkarium e como entrou." + **Convidar** (dourado). `<title>Lorkarium · Usuários</title>`.
- `users-toolbar.tsx`: busca (`searchbox` "Buscar usuário", apelido, @ ou e-mail, sem acento nem caixa), abas de status em texto com a contagem (`aria-pressed`, traço dourado no ativo: Todos · Ativos · Convidados · Suspensos) e o papel no `SegmentField` (Todos · Admin · Usuário). Busca e filtros na URL (`?q=&status=&role=`, `replace`); o texto digitado vive num estado local que a URL segue (uma navegação por tecla é assíncrona e perdia letras).
- Uma linha `role="status"` acima da tabela com o que o último comando fez (fica até o próximo): "@biaflor agora é admin.", "@biaflor não é mais admin.", "O acesso de @biaflor foi suspenso.", "O acesso de @biaflor voltou.", "A conta @biaflor foi excluída.", "Convite para marina@exemplo.com cancelado.".
- `users-table.tsx`: tabela reta com fio (`caption` só para leitor de tela "Usuários"; `overflow-x-auto` em tela estreita): Usuário (avatar, apelido, @; a própria linha diz "você" e **não tem menu**), E-mail, Papel e Status em caixa alta espaçada (`user-status-label.tsx`: ponto quadrado + texto — Ativo, Convidado, Convite vencido, Suspenso), Mesas, Último acesso. Convite: envelope + "Convite pendente". Pé: "N usuários" ou "N de M usuários".
- Vazio: só o próprio admin → "Só você por aqui. Convide alguém para começar." + "Convidar"; filtro sem linha → "Ninguém com esse filtro." + "Limpar filtros".

## Comandos

- `users-action.ts` — corpo JSON `{ intent, … }` validado por um `z.discriminatedUnion` (intenções `invite`, `invitation-resend`, `invitation-cancel`, `role`, `suspend`, `reactivate`, `password-reset`, `deletion-check`, `delete`); despacho por `switch`. `unauthenticated` → `signedOut` + `AdminSignedOutError`; `forbidden` → `dropAdminRole` + `AdminForbiddenError` (os dois para o `ErrorBoundary`, porque fetcher não pode redirecionar — ver armadilhas). O router recarrega a lista depois de cada ação.
- `use-users-fetcher.ts` — `useUsersFetcher()` (`busy`, `settled` só depois da revalidação, `send`, `reset`), `useOnUsersSettled`, `usersFailureOf`.
- `row-menus.tsx` — `UserRowMenu` ("Ações de <apelido>": "Mandar link de nova senha" (só ativa), "Tornar admin" | "Tirar acesso de admin", "Suspender acesso" | "Reativar acesso", "Excluir usuário") e `InvitationRowMenu` ("Ações do convite para <e-mail>": "Reenviar convite" — também o vencido — e "Cancelar convite").
- Sem diálogo (consequência baixa): tirar admin, reativar, cancelar convite (`useQuickCommand` na página; recusa num `Alert`).
- `users-dialog.tsx` escolhe o diálogo aberto (um por vez):
  - `confirm-command-dialog.tsx` (`AlertDialog`, a consequência por extenso, rótulo específico, fica aberto enquanto roda): "Dar acesso de admin a @biaflor?" / "A pessoa poderá convidar, suspender e excluir contas." / "Tornar admin" ("Salvando…"); "Suspender o acesso de @biaflor?" / "@biaflor sai de todas as sessões agora e não consegue entrar até o acesso voltar." / "Suspender" (perigo, "Suspendendo…").
  - `link-result-dialog.tsx` (emite o link ao abrir, uma vez — `useOnceOnMount`): "Link de nova senha para @biaflor" (campo "Link de nova senha", "Vale 1 hora.") e "Convite reenviado" (campo "Link do convite").
  - `delete-user-dialog.tsx`: confere ao abrir (`deletion-check`); **bloqueada** → "@ana criou mesas em que outras pessoas jogam:" + lista "Vharn (3 outras pessoas)" + "Suspender em vez disso" (troca para o diálogo de suspender), sem botão de excluir; **livre** → `deletionConsequence` ("A conta de @biaflor e as 2 mesas só dela somem para sempre.") + "Digite @biaflor para confirmar" que destrava "Excluir" ("Excluindo…"). Um `owns_shared_campaigns` na hora de excluir (alguém entrou no meio) vira a vista bloqueada.
- `invite-sheet.tsx` + `invite-form.tsx` — gaveta "Convidar pessoa": "E-mail" focado (validado pelo `createInvitationRequestDto`; endereço já da lista → "Esse e-mail já é de @pedrinho (suspenso)." sem pedido) e "Papel" (`radiogroup`, Usuário marcado); "Convidar" → "Convidando…" + `aria-busy` → "Convite enviado" com `share-link-panel.tsx` (campo só de leitura "Link do convite", `CopyCodeButton` "Copiar link" → "Link copiado.", "O link vale 7 dias e só funciona uma vez. Ele não aparece de novo depois que você fechar.") + "Convidar outra pessoa" (`fetcher.reset()`) e "Fechar". `already_invited` → "Já existe um convite para esse e-mail." + "Reenviar convite" (abre o diálogo de reenviar).
- Mensagens: `admin-messages.ts` (`adminFailureMessage`, `ROLE_LABEL`, `deletionConsequence`).

## Serviço e conta pura

- `services/user-admin-api.ts` — `UserAdminApi` / `HttpUserAdminApi`: `directory`, `invite`, `resendInvitation`, `cancelInvitation`, `changeRole`, `suspend`, `reactivate`, `sendPasswordLink`, `deletionCheck`, `deleteUser`, `mailSamples`, `sendMailSample`. Falhas `UserAdminFailure`: `unauthenticated`, `forbidden` (403 `FORBIDDEN_ROLE`), `self_action`, `owns_shared_campaigns` (+ `blockingCampaigns` do corpo), `email_taken`, `already_invited` (+ `invitationId`), `account_suspended`, `not_found` (também `MAIL_SAMPLE_NOT_FOUND`), `mail_delivery_failed`, `invalid`, `rate_limited`, `offline`, `unexpected`.
- `lib/user-directory.ts` — `directoryRows(diretório, agora)` (contas e convites juntos, do mais novo; convite `invited` ou `invite-expired` por `expiresAt ≤ agora`), `filterDirectory`, `statusCounts` (sobre a busca e o papel, nunca a própria aba), `lastAccessLabel` ("agora", "há 3 h", "nunca entrou", "convite há 2 dias", "venceu há 1 dia"), `filtersOf(URLSearchParams)`.
- `lib/use-once-on-mount.ts` — `useOnceOnMount(run)`: uma vez por montagem, mesmo no StrictMode (um segundo link emitido mataria o primeiro).
- `components/copy-code-button.tsx` aceita `copiedMessage` (o "Link copiado." do convite).

## Testes

- `client/test/lib/user-directory.spec.ts`, `test/lib/use-once-on-mount.spec.tsx`, `test/services/user-admin-api.spec.ts`.
- Pelo router: `test/features/admin/users-route.spec.tsx` (moldura, tabela, busca/filtros/URL, vazios, falhas de carga), `invite-sheet.spec.tsx` (gaveta e menu do convite) e `user-row-actions.spec.tsx` (menu e diálogos de cada conta). Os subcomponentes não têm spec próprio.
- Fake: `test/support/user-admin-api-fake.ts` — `UserAdminApiFake(now)` guarda o diretório como o server (`users`, `invitations` mutáveis; links `…#token=tok-N`), roteirizável por `answers`; contas `lucasAdmin` (o id do `ROOT_ADMIN`: a própria linha), `bia`, `pedroSuspended`; convites `marinaInvited` e `joaoExpired` (admin).

## Armadilhas

- Campo de busca controlado direto pela URL perde teclas: cada `setSearchParams` é uma navegação assíncrona e a próxima tecla parte do valor velho. O texto fica num estado local e a URL o segue.
- Ler o rodapé ou a tabela logo depois de mudar um filtro: a lista segue a navegação; no spec, `findBy…`.
