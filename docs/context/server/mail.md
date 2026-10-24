# Server · e-mail

Detalhe do hub [`server.md`](../server.md) (seção Env): como o server manda e-mail em cada ambiente. Quem manda e o quê: [`../account-security.md`](../account-security.md).

## Env → mailer

- `readEnv` entrega `mailer: MailerConfig` — `{ kind: 'smtp', url, from }` quando há `SMTP_URL`, `{ kind: 'log', from }` sem ele — e `appPublicUrl` (sem a barra final). Em produção o schema exige `SMTP_URL` e `APP_PUBLIC_URL` (o log e o `localhost` nunca valem lá). `SMTP_URL` leva a senha: é redigida no erro de boot, e o `SmtpMailer` só cita o host.
- `wireAccountSecurity` (`src/app/wire-account-security.ts`) cria o `SmtpMailer` (`nodemailer`, fechado no `onClose`) ou o `LogMailer` (escreve `{ mail: { from, to, subject, text } }` no pino, com o link dentro — por isso só fora de produção). `AppDependencies.mailer` vence os dois.

## Por ambiente

| Ambiente   | `SMTP_URL`                               | Para onde vai                                                                       |
| ---------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| dev        | `smtp://localhost:1025` (`.env.example`) | Mailpit do `pnpm db:up` (`axllent/mailpit:v1.27.0`); caixa em http://localhost:8025 |
| integração | não definida (`LogMailer`, logger mudo)  | os specs passam um `MailerFake` ao `buildApp`                                       |
| CI         | não definida no job de integração        | idem; o `smtp-mailer.spec.ts` usa o Mailpit da action `.github/actions/mailpit`     |
| e2e        | forçada vazia no `playwright.config.ts`  | log do server (`LogMailer`), mesmo com o `server/.env` apontando para o Mailpit     |
| produção   | obrigatória                              | o relay SMTP do provedor                                                            |

- `smtp-mailer.spec.ts` lê `MAILPIT_SMTP_URL`/`MAILPIT_API_URL` (no CI, 1025/8025 da action; sem eles, 1026/8026, o Mailpit descartável da receita do `/testar`) e confere a entrega pela API HTTP do Mailpit (`/api/v1/messages`, `/api/v1/message/<id>`).
- `APP_PUBLIC_URL` sem valor fora de produção vale `http://localhost:5173` (o client do `pnpm dev`): o link do e-mail de dev abre a tela local.
