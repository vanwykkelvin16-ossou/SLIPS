import { getEnv } from '@/lib/env';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailAdapter {
  readonly name: string;
  send(message: EmailMessage): Promise<{ delivered: boolean; detail?: string }>;
}

/**
 * Development adapter. Writes a one-line notice plus any action link to the
 * server console so flows can be completed locally without an SMTP server.
 * Message bodies are not logged.
 */
class ConsoleEmailAdapter implements EmailAdapter {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<{ delivered: boolean; detail?: string }> {
    const link = message.text.match(/https?:\/\/\S+/)?.[0];
    // eslint-disable-next-line no-console
    console.info(`[email:console] to=${maskEmail(message.to)} subject="${message.subject}"${link ? ` link=${link}` : ''}`);
    return { delivered: true, detail: 'logged to console' };
  }
}

class SmtpEmailAdapter implements EmailAdapter {
  readonly name = 'smtp';

  async send(message: EmailMessage): Promise<{ delivered: boolean; detail?: string }> {
    const env = getEnv();
    if (!env.SMTP_HOST) return { delivered: false, detail: 'SMTP_HOST is not configured' };

    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER && env.SMTP_PASSWORD ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
    });

    try {
      await transport.sendMail({
        from: env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return { delivered: true };
    } catch (error) {
      return { delivered: false, detail: error instanceof Error ? error.message : 'send failed' };
    }
  }
}

let adapter: EmailAdapter | null = null;

export function getEmailAdapter(): EmailAdapter {
  if (adapter) return adapter;
  adapter = getEnv().EMAIL_PROVIDER === 'smtp' ? new SmtpEmailAdapter() : new ConsoleEmailAdapter();
  return adapter;
}

/** Test seam. */
export function setEmailAdapter(next: EmailAdapter | null) {
  adapter = next;
}

export async function sendEmail(message: EmailMessage) {
  return getEmailAdapter().send(message);
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}
