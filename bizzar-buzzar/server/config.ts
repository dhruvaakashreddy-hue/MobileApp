export type Env = Record<string, string | undefined>;

export interface Config {
  env: 'development' | 'test' | 'production';
  databaseUrl: string | null;
  publicOrigin: string;
  secureCookies: boolean;
  brand: string;
  currency: string;
  locale: string;
  timeZone: string;
  shippingCountries: string[];
  holdSeconds: number;
  /** How long after a hold ends a payment attempt can still be reconciled before its unit is recycled. */
  paymentGraceSeconds: number;
  paymentMode: 'test' | 'live';
  razorpay: { keyId: string; keySecret: string; webhookSecret: string } | null;
  email: {
    provider: 'dev-outbox' | 'resend' | 'none';
    from: string;
    resendApiKey: string | null;
    outboxDir: string;
  };
  vapid: { publicKey: string; privateKey: string; subject: string } | null;
  cronSecret: string | null;
  /** Keys OTP hashing, session tokens and media URL signatures. */
  appSecret: string;
}

const DEV_SECRET = 'development-only-secret-do-not-use-in-production';

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer between ${min} and ${max}, got "${value}".`);
  }
  return parsed;
}

export function loadConfig(env: Env = process.env): Config {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error(`NODE_ENV must be development, test or production, got "${nodeEnv}".`);
  }
  const isProd = nodeEnv === 'production';

  const databaseUrl = env.DATABASE_URL || null;
  if (isProd && !databaseUrl) throw new Error('DATABASE_URL is required in production.');

  const appSecret = env.BB_APP_SECRET || (isProd ? '' : DEV_SECRET);
  if (isProd && appSecret.length < 32) throw new Error('BB_APP_SECRET must be at least 32 characters in production.');

  const publicOrigin = (env.BB_PUBLIC_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');

  const paymentMode = env.BB_PAYMENT_MODE === 'live' ? 'live' : 'test';
  const keyId = env.RAZORPAY_KEY_ID || '';
  const keySecret = env.RAZORPAY_KEY_SECRET || '';
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET || '';
  let razorpay: Config['razorpay'] = null;
  if (keyId || keySecret || webhookSecret) {
    if (!keyId || !keySecret || !webhookSecret) {
      throw new Error('RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET must be set together.');
    }
    const expectedPrefix = paymentMode === 'live' ? 'rzp_live_' : 'rzp_test_';
    if (!keyId.startsWith(expectedPrefix)) {
      throw new Error(`BB_PAYMENT_MODE=${paymentMode} requires a ${expectedPrefix} key.`);
    }
    razorpay = { keyId, keySecret, webhookSecret };
  }

  const emailProvider = (env.EMAIL_PROVIDER || (isProd ? 'none' : 'dev-outbox')) as Config['email']['provider'];
  if (!['dev-outbox', 'resend', 'none'].includes(emailProvider)) {
    throw new Error(`EMAIL_PROVIDER must be dev-outbox, resend or none, got "${emailProvider}".`);
  }
  if (emailProvider === 'dev-outbox' && isProd) {
    throw new Error('EMAIL_PROVIDER=dev-outbox writes to disk and cannot be used in production.');
  }

  const vapidPublicKey = env.BB_VAPID_PUBLIC_KEY || '';
  const vapidPrivateKey = env.BB_VAPID_PRIVATE_KEY || '';
  const vapid = vapidPublicKey && vapidPrivateKey
    ? { publicKey: vapidPublicKey, privateKey: vapidPrivateKey, subject: env.BB_VAPID_SUBJECT || 'mailto:hello@example.com' }
    : null;

  const cronSecret = env.BB_CRON_SECRET || null;
  if (isProd && cronSecret && cronSecret.length < 32) {
    throw new Error('BB_CRON_SECRET must be at least 32 characters.');
  }

  return {
    env: nodeEnv,
    databaseUrl,
    publicOrigin,
    secureCookies: publicOrigin.startsWith('https://'),
    brand: 'Bizzar Buzzar',
    currency: env.BB_CURRENCY || 'INR',
    locale: env.BB_LOCALE || 'en-IN',
    timeZone: env.BB_TIME_ZONE || 'Asia/Kolkata',
    shippingCountries: (env.BB_SHIPPING_COUNTRIES || 'IN').split(',').map((code) => code.trim().toUpperCase()),
    holdSeconds: int(env.BB_HOLD_SECONDS, 120, 30, 600),
    paymentGraceSeconds: int(env.BB_PAYMENT_GRACE_SECONDS, 600, 60, 3600),
    paymentMode,
    razorpay,
    email: {
      provider: emailProvider,
      from: env.EMAIL_FROM || 'Bizzar Buzzar <hello@example.com>',
      resendApiKey: env.RESEND_API_KEY || null,
      outboxDir: env.BB_OUTBOX_DIR || '.data/outbox',
    },
    vapid,
    cronSecret,
    appSecret: appSecret || DEV_SECRET,
  };
}
