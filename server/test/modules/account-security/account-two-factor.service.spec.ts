import { beforeEach, describe, expect, it } from 'vitest';
import { AccountTwoFactorService } from '../../../src/modules/account-security/account-two-factor.service';
import { CurrentPasswordService } from '../../../src/modules/account-security/current-password.service';
import { SecurityNoticesService } from '../../../src/modules/account-security/security-notices.service';
import { TwoFactorCheckService } from '../../../src/modules/auth/two-factor-check.service';
import { MailerFake, QrCodeFake, RecoveryCodeFake } from '../../support/account-security-fakes';
import {
  ClockFake,
  DataCipherFake,
  PasswordHasherFake,
  UsersDaoFake,
} from '../../support/auth-fakes';
import { ANA_ID, userPo } from '../../support/auth-factories';
import { RecoveryCodesDaoFake, TotpFake, TwoFactorDaoFake } from '../../support/two-factor-fakes';

const NOW = new Date('2026-10-14T12:00:00Z');
const CURRENT_STEP = Math.floor(NOW.getTime() / 30_000);
const PASSWORD = 'senha-da-ana';
const CHROME_ON_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

describe('AccountTwoFactorService', () => {
  let twoFactor: TwoFactorDaoFake;
  let recoveryCodes: RecoveryCodesDaoFake;
  let totp: TotpFake;
  let mailer: MailerFake;
  let service: AccountTwoFactorService;

  beforeEach(() => {
    const users = new UsersDaoFake([userPo({ passwordHash: `hashed:${PASSWORD}` })]);
    twoFactor = new TwoFactorDaoFake();
    recoveryCodes = new RecoveryCodesDaoFake();
    totp = new TotpFake();
    mailer = new MailerFake();
    const cipher = new DataCipherFake();
    const clock = new ClockFake(NOW);
    service = new AccountTwoFactorService({
      users,
      currentPassword: new CurrentPasswordService(users, new PasswordHasherFake()),
      twoFactor,
      recoveryCodes,
      check: new TwoFactorCheckService({ twoFactor, recoveryCodes, totp, cipher, clock }),
      totp,
      qr: new QrCodeFake(),
      codes: new RecoveryCodeFake(),
      cipher,
      clock,
      notices: new SecurityNoticesService(mailer, () => undefined),
      appPublicUrl: 'https://mesa.example.com',
    });
    totp.stepsByCode.set('111111', CURRENT_STEP);
  });

  async function turnOn(): Promise<string[]> {
    await service.setup(ANA_ID, PASSWORD);
    return service.enable(ANA_ID, '111111', CHROME_ON_WINDOWS);
  }

  describe('setup', () => {
    it('returns the secret, the URI with the @ and its QR, and stores the secret sealed and pending', async () => {
      expect(await service.setup(ANA_ID, PASSWORD)).toEqual({
        secret: 'SECRET1',
        otpauthUri: 'otpauth://totp/Lorkarium:ana?secret=SECRET1&issuer=Lorkarium',
        qrImage:
          'data:image/png;base64,qr:otpauth://totp/Lorkarium:ana?secret=SECRET1&issuer=Lorkarium',
      });
      expect(twoFactor.rows.get(ANA_ID)).toMatchObject({
        secretCipher: `sealed:totp-secret:${ANA_ID}:SECRET1`,
        enabledAt: null,
      });
    });

    it('a wrong password is CURRENT_PASSWORD_INVALID and nothing is stored', async () => {
      await expect(service.setup(ANA_ID, 'errada')).rejects.toMatchObject({
        code: 'CURRENT_PASSWORD_INVALID',
      });
      expect(twoFactor.rows.size).toBe(0);
    });

    it('a second setup before enabling starts over with a new secret', async () => {
      await service.setup(ANA_ID, PASSWORD);
      await service.setup(ANA_ID, PASSWORD);
      expect(twoFactor.rows.get(ANA_ID)?.secretCipher).toBe(`sealed:totp-secret:${ANA_ID}:SECRET2`);
    });

    it('with 2FA already on it is TWO_FACTOR_ALREADY_ENABLED', async () => {
      await turnOn();
      await expect(service.setup(ANA_ID, PASSWORD)).rejects.toMatchObject({
        code: 'TWO_FACTOR_ALREADY_ENABLED',
      });
    });
  });

  describe('enable', () => {
    it('the right code turns 2FA on with its step and returns 10 codes kept by index', async () => {
      const codes = await turnOn();
      expect(codes).toHaveLength(10);
      expect(new Set(codes).size).toBe(10);
      expect(twoFactor.rows.get(ANA_ID)).toMatchObject({ enabledAt: NOW, lastStep: CURRENT_STEP });
      expect(recoveryCodes.rows.map((row) => row.codeIndex)).toEqual(
        codes.map((code) => `idx:recovery-code:${code}`),
      );
    });

    it('the code is checked against the secret opened from its seal', async () => {
      await turnOn();
      expect(totp.secretsAsked).toEqual(['SECRET1']);
    });

    it('a wrong code is TWO_FACTOR_CODE_INVALID and the setup stays pending', async () => {
      await service.setup(ANA_ID, PASSWORD);
      await expect(service.enable(ANA_ID, '000000', CHROME_ON_WINDOWS)).rejects.toMatchObject({
        code: 'TWO_FACTOR_CODE_INVALID',
      });
      expect(twoFactor.rows.get(ANA_ID)?.enabledAt).toBeNull();
      expect(recoveryCodes.rows).toEqual([]);
    });

    it('without a setup it is TWO_FACTOR_NOT_STARTED', async () => {
      await expect(service.enable(ANA_ID, '111111', CHROME_ON_WINDOWS)).rejects.toMatchObject({
        code: 'TWO_FACTOR_NOT_STARTED',
      });
    });

    it('tells the account e-mail that 2FA was turned on', async () => {
      await turnOn();
      expect(mailer.sent.map((mail) => [mail.to, mail.subject])).toEqual([
        ['ana@mesa.com', 'Verificação em duas etapas ligada'],
      ]);
    });

    it('the notice greets the nickname, names the @ and says the device of the request', async () => {
      await turnOn();
      const [mail] = mailer.sent;
      expect(mail?.text).toContain(
        'Oi, Ana! A verificação em duas etapas está ligada na conta @ana.',
      );
      expect(mail?.text).toContain('De onde: Chrome no Windows');
    });

    it('a mailer failure does not undo the 2FA already turned on', async () => {
      mailer.failWith = new Error('smtp down');
      await turnOn();
      expect(twoFactor.rows.get(ANA_ID)?.enabledAt).toEqual(NOW);
    });
  });

  describe('disable', () => {
    it('password + a new app code turns 2FA off, drops the codes and tells the e-mail', async () => {
      await turnOn();
      totp.stepsByCode.set('222222', CURRENT_STEP + 1);
      await service.disable(
        ANA_ID,
        { currentPassword: PASSWORD, code: '222222' },
        CHROME_ON_WINDOWS,
      );
      expect(twoFactor.rows.has(ANA_ID)).toBe(false);
      expect(recoveryCodes.rows).toEqual([]);
      expect(mailer.sent.at(-1)?.subject).toBe('Verificação em duas etapas desligada');
    });

    it('the code that turned it on cannot turn it off (replay)', async () => {
      await turnOn();
      const replay = service.disable(
        ANA_ID,
        { currentPassword: PASSWORD, code: '111111' },
        CHROME_ON_WINDOWS,
      );
      await expect(replay).rejects.toMatchObject({ code: 'TWO_FACTOR_CODE_INVALID' });
      expect(twoFactor.rows.get(ANA_ID)?.enabledAt).toEqual(NOW);
    });

    it('a recovery code also serves', async () => {
      const [code = ''] = await turnOn();
      await service.disable(ANA_ID, { currentPassword: PASSWORD, code }, CHROME_ON_WINDOWS);
      expect(twoFactor.rows.has(ANA_ID)).toBe(false);
    });

    it('a wrong password is CURRENT_PASSWORD_INVALID even with a right code', async () => {
      await turnOn();
      totp.stepsByCode.set('222222', CURRENT_STEP + 1);
      const attempt = service.disable(
        ANA_ID,
        { currentPassword: 'errada', code: '222222' },
        CHROME_ON_WINDOWS,
      );
      await expect(attempt).rejects.toMatchObject({ code: 'CURRENT_PASSWORD_INVALID' });
    });

    it('with 2FA off it is TWO_FACTOR_NOT_ENABLED', async () => {
      const attempt = service.disable(
        ANA_ID,
        { currentPassword: PASSWORD, code: '111111' },
        CHROME_ON_WINDOWS,
      );
      await expect(attempt).rejects.toMatchObject({ code: 'TWO_FACTOR_NOT_ENABLED' });
    });
  });

  describe('regenerateCodes', () => {
    it('gives 10 new codes and the old ones stop working', async () => {
      const [oldCode = ''] = await turnOn();
      totp.stepsByCode.set('222222', CURRENT_STEP + 1);
      const fresh = await service.regenerateCodes(ANA_ID, {
        currentPassword: PASSWORD,
        code: '222222',
      });
      expect(fresh).toHaveLength(10);
      expect(fresh).not.toContain(oldCode);
      const withOld = service.regenerateCodes(ANA_ID, { currentPassword: PASSWORD, code: oldCode });
      await expect(withOld).rejects.toMatchObject({ refusal: 'the recovery code is unknown' });
    });
  });
});
