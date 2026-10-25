import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config.ts';
import { fail } from '../errors.ts';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailAdapter {
  readonly configured: boolean;
  send(message: EmailMessage): Promise<void>;
}

/**
 * Creates the configured email adapter. `dev-outbox` writes messages to a folder for local
 * sign-in. It is refused in production by loadConfig. `none` fails every send with 503.
 */
export function createEmailAdapter(config: Config['email'], fetchImpl: typeof fetch = fetch): EmailAdapter {
  if (config.provider === 'dev-outbox') {
    const dir = path.resolve(config.outboxDir);
    return {
      configured: true,
      async send(message) {
        await mkdir(dir, { recursive: true });
        const file = path.join(dir, `${Date.now()}-${randomUUID()}.txt`);
        await writeFile(file, `To: ${message.to}\nFrom: ${config.from}\nSubject: ${message.subject}\n\n${message.text}\n`);
      },
    };
  }

  if (config.provider === 'resend' && config.resendApiKey) {
    const apiKey = config.resendApiKey;
    return {
      configured: true,
      async send(message) {
        const response = await fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw fail.unavailable('email_send_failed', `Email provider returned HTTP ${response.status}.`);
      },
    };
  }

  return {
    configured: false,
    async send() {
      throw fail.unavailable('email_not_configured', 'Email sign-in is not configured on this server yet.');
    },
  };
}

/** Test helper: records messages instead of sending them. */
export function createMemoryEmail(): EmailAdapter & { sent: EmailMessage[]; failNext: boolean } {
  const adapter = {
    configured: true,
    sent: [] as EmailMessage[],
    failNext: false,
    async send(message: EmailMessage) {
      if (adapter.failNext) {
        adapter.failNext = false;
        throw fail.unavailable('email_send_failed', 'Simulated email failure.');
      }
      adapter.sent.push(message);
    },
  };
  return adapter;
}
