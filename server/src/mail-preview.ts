import { readEnv } from './config/env';
import { readProcessEnv } from './config/process-env';
import { SystemClock } from './infrastructure/clock/system-clock';
import { SmtpMailer } from './infrastructure/mailer/smtp-mailer';
import { MailPreviewService } from './modules/dev-seed/mail-preview.service';

const DEFAULT_INBOX = 'preview@lorkarium.dev';

const env = readEnv(readProcessEnv());
if (env.mailer.kind === 'log') {
  process.stderr.write(
    'a prévia precisa de um SMTP: defina SMTP_URL=smtp://localhost:1025 e suba o Mailpit com pnpm db:up\n',
  );
  process.exit(1);
}

const inbox = process.argv[2] ?? DEFAULT_INBOX;
const mailer = new SmtpMailer(env.mailer.url, env.mailer.from);
try {
  const sent = await new MailPreviewService(mailer, new SystemClock()).send(
    env.nodeEnv,
    inbox,
    env.appPublicUrl,
  );
  process.stdout.write(`${sent} e-mails enviados para ${inbox}; abra http://localhost:8025\n`);
} finally {
  mailer.close();
}
