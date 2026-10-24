# Mail

Os e-mails que o Lorkarium manda às pessoas: um molde único (o de `docs/pages/mails/Emails.dc.html`), o catálogo de templates e a prévia no Mailpit. Plano de origem: `docs/plans/2026-10-24-emails-do-sistema.md`. Como o e-mail sai em cada ambiente (`MailerPort`, `SmtpMailer`/`LogMailer`, `SMTP_URL`, `APP_PUBLIC_URL`): [`server/mail.md`](server/mail.md). Quem dispara os avisos de segurança e a recuperação por link: [`account-security.md`](account-security.md).

## O molde (`server/src/lib/mail/`)

Funções puras, sem dependência e sem React no server.

- `mail-spec.ts` — `MailSpec` = `{ subject, preheader, tone, icon, title, paragraphs, details?, button?, note?, warning?, fallbackLink?, footer }`; `MailTone` (`gold` transacional, `dark` feito, `alert` aja agora, `ok` boa notícia) e `MailIcon` (`mailSwap`, `check`, `lock`, `shield`, `shieldOff`, `user`, `key`, `pause`).
- `mail-palette.ts` — `MAIL_TONES` (as cores do mock, valor por valor), `MAIL_COLORS`, `MAIL_FONTS` (Cormorant/Cinzel com `Georgia, serif`, Hanken Grotesk com `Arial, Helvetica, sans-serif`), `iconUrl(publicUrl, ícone, tom)` → `/email/icon-<kebab>-<tom>.png` e `markUrl`.
- `mail-html.ts` — `renderMailHtml` e `escapeHtml`: tabelas `role="presentation"` aninhadas, estilo inline, `bgcolor` nas células, cartão de 600 px fluido (`max-width`) com raio de 12 px (o Outlook ignora), fundo externo `#EDE7DB`, `<meta name="color-scheme" content="light only">` + `supported-color-schemes`, o preheader num `div` oculto antes de tudo, `<link>` do Google Fonts no `head` (Apple Mail lê; Gmail descarta). Bloco opcional ausente não deixa vestígio. Nunca `<svg>` nem `<script>`.
- `mail-text.ts` — `renderMailText`: título, parágrafos, `Chave: valor` por detalhe, `Rótulo do botão: URL`, aviso, nota e rodapé, separados por linha em branco; `MAIL_BRAND_LINE` ("Lorkarium · mesa virtual de RPG").
- `mail-layout.ts` — `renderMail(spec, publicUrl)` → `{ html, text }`; `href` do botão que não é absoluto (`https?://`) lança citando o valor.
- `mail-validity.ts` — `validityLabel({ minutes | hours | days })` → "30 minutos", "1 hora", "7 dias"; valor que não é inteiro ≥ 1 lança.

Regras de HTML de e-mail (por que é assim): o Outlook desktop usa o motor do Word (tabelas, nada de flex/grid; o botão sai quadrado, sem VML, mas clicável); o proxy do Gmail não serve SVG (logo e ícones em PNG 2x); Gmail iOS e Outlook invertem cores no modo escuro (a faixa escura e o corpo claro aguentam); com imagem bloqueada, "LORKARIUM" continua em texto ao lado da marca.

## Imagens (`client/public/email/`)

`lorkarium-mark.png` (60 × 60, os paths do mock em `#C5A46D`) e um PNG 48 × 48 por combinação ícone × tom do catálogo (`icon-mail-swap-gold`, `icon-mail-swap-alert`, `icon-check-dark`, `icon-check-ok`, `icon-lock-dark`, `icon-shield-ok`, `icon-shield-off-alert`, `icon-user-gold`, `icon-user-dark`, `icon-key-gold`, `icon-pause-alert`), traço na cor `iconFg` do tom, fundo transparente. Servidos pelo client em `APP_PUBLIC_URL/email/…`.

Receita (gerados uma vez; ícone ou tom novo = gerar de novo): um script Node com o `sharp` do server (`createRequire(server/package.json)`) monta o SVG de cada path do `EM_ICON` do mock (`viewBox 0 0 24 24`, `stroke-width 1.8`, pontas e junções redondas) e grava `sharp(Buffer.from(svg), { density: 288 }).resize(48, 48).png()`; a marca com `density: 144` e `resize(60, 60)`. Combinação nova entra também no spec do catálogo, que confere que todo `src` existe no disco.

## Catálogo

`pessoa` = `MailRecipient` `{ to, name, username }`; `origem` = `MailOrigin` `{ at, userAgent }` ("Quando" em horário de Brasília fixo, "De onde" = `deviceLabel(deviceOf(userAgent))`, sem cidade nem IP).

| #   | Template (arquivo)                                  | Tom · ícone       | Botão                                   | Quem dispara                                    |
| --- | --------------------------------------------------- | ----------------- | --------------------------------------- | ----------------------------------------------- |
| 1   | `emailConfirmationMail` (`security-mail.mapper.ts`) | gold · mailSwap   | "Confirmar novo e-mail" + link reserva  | `EmailChangeService.request` (ao endereço novo) |
| 2   | `emailChangeRequestedMail`                          | alert · mailSwap  | "Não fui eu, cancelar a troca"          | `EmailChangeService.request` (ao atual)         |
| 3   | `emailChangedMail`                                  | dark · check      | "Não fui eu, recuperar a conta"         | `EmailChangeService.confirm` (ao antigo)        |
| 4   | `passwordChangedMail`                               | dark · lock       | "Não fui eu, recuperar a conta"         | `AccountSecurityService.changePassword`         |
| 5   | `twoFactorChangedMail` (ligado)                     | ok · shield       | "Ver a segurança da conta" → `/account` | `AccountTwoFactorService.enable`                |
| 6   | `twoFactorChangedMail` (desligado)                  | alert · shieldOff | "Ligar de novo" → `/account`            | `AccountTwoFactorService.disable`               |
| 7   | `invitationMail` (`admin-mail.mapper.ts`)           | gold · user       | "Criar minha conta" + link reserva      | `InvitationsService.invite` e `resend`          |
| 8   | `passwordLinkMail`                                  | gold · key        | "Criar nova senha" + link reserva       | `PasswordResetsService.issue`                   |
| 9   | `accessSuspendedMail`                               | alert · pause     | — (nota "fale com quem administra")     | `UserAdminService.suspend`                      |
| 10  | `accessRestoredMail`                                | ok · check        | "Entrar no Lorkarium" → `/login`        | `UserAdminService.reactivate`                   |
| 11  | `promotedToAdminMail`                               | dark · user       | "Abrir o backoffice" → `/admin`         | `UserAdminService.changeRole` (virar admin)     |

- Os avisos 2 a 4 levam o link de recuperação de 7 dias (`/account/recover#token=…`, ver `account-security.md`). O 2 também leva "Novo e-mail" mascarado (`maskEmail`).
- Rodapés: avisos de segurança "Aviso de segurança da sua conta. Este tipo de e-mail não pode ser desligado."; 9 e 11 "Aviso sobre o estado da sua conta. Este tipo de e-mail não pode ser desligado."; 10 só a primeira frase. Nenhum texto pede "responda": o remetente é no-reply (`MAIL_FROM`).
- **Nenhum e-mail diz quem fez a ação** (pedido do produto): o convite ("Seu convite para o Lorkarium") e o "Agora é admin" ("A conta @x passou a ter acesso ao backoffice") são neutros; quem fez fica só no backoffice e no log. Suspensão e link de nova senha falam de "um administrador", sem nome.
- O convite também não diz o @ nem o apelido: a pessoa escolhe o @ ao abrir o link (o mock mostrava "Lucas te chamou…" e "Seu usuário: @marina").
- Tom: a voz do app ("Oi, Ana!", imperativo, "para"), sem gíria nos avisos de segurança.
- `toMailMessage(to, spec, publicUrl)`, `recipientOf(linha, cifra)`, `originDetails`, `whenLabel` e `greeting` ficam no `security-mail.mapper.ts` e servem os dois mappers.

## Prévia

- `pnpm mail:preview [caixa]` (raiz → `server/src/mail-preview.ts`, a quinta raiz do server) manda um exemplar de cada e-mail (os dados do mock: Lucas `@lucas.rola20` e Pedro `@pedrinho` como **destinatários**, nunca como quem agiu; tokens inventados; o "Quando" é a hora do envio) para a caixa (padrão `preview@lorkarium.dev`). Recusa o `LogMailer` ("defina SMTP_URL=smtp://localhost:1025 e suba o Mailpit com pnpm db:up") e produção (`MAIL_PREVIEW_REFUSED`). Precisa do env do server inteiro (o `readEnv` exige `DATA_ENCRYPTION_KEY` mesmo sem usar).
- `account-security/mail-samples.mapper.ts` (`mailSamples(to, publicUrl, at)` → `{ id, name, message }[]`, `at` = o "Quando" dos avisos, vindo do `clock.now()` de quem manda, o catálogo de amostras; o `id` é estável: `email-confirmation`, `email-change-requested`, `email-changed`, `password-changed`, `two-factor-on`, `two-factor-off`, `invitation`, `password-link`, `access-suspended`, `access-restored`, `promoted-to-admin`) e `dev-seed/mail-preview.service.ts` (`MailPreviewService(mailer, clock).send(nodeEnv, caixa, publicUrl)`; falha para no item com `MAIL_PREVIEW_FAILED` citando o assunto).
- Ler no Mailpit (http://localhost:8025): a mensagem, a aba **HTML Check** (suporte de cada propriedade por cliente; o que o Outlook ignora — raio, `max-width` — é esperado) e a **Link Check**. As imagens só carregam com o client de pé no `APP_PUBLIC_URL`.
- **No backoffice:** `/admin/emails` ("E-mails" na lateral) manda uma amostra por vez ao endereço digitado, pelo mailer real (ver `user-admin.md`, Teste de e-mail, e `client/backoffice.md`).

## Testes

- Unit: `server/test/lib/mail/{mail-layout,mail-validity}.spec.ts`; `server/test/modules/account-security/{security-mail,admin-mail}.mapper.spec.ts`; `server/test/modules/account-security/mail-samples.mapper.spec.ts`, `server/test/modules/dev-seed/mail-preview.service.spec.ts` — o do catálogo confere, para cada e-mail, assunto e preheader, nada de `<svg`/`undefined`/`null`/`NaN`/`[object`, todo `href`/`src` sobre o `publicUrl`, toda imagem existente em `client/public/email/` e o texto com todo link. **Template novo entra na lista escrita à mão desse spec.**
- Integração: os specs de cada fluxo leem o `text` pelo `MailerFake` (`confirmationTokenFor`, `recoveryTokenFor`, `lastTokenFor(to, regex)`).
