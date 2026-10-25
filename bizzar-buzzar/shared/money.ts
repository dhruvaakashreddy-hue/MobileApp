/**
 * Money is always an integer count of minor units (paise for INR).
 * Floats never touch a stored or calculated amount.
 */

export interface MoneyFormat {
  currency: string;
  locale: string;
}

export function formatMoney(paise: number, { currency, locale }: MoneyFormat): string {
  const whole = paise % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(paise / 100);
}

/** Parses a rupee string such as "1499" or "1499.50" into paise. Returns null when malformed. */
export function parseRupeesToPaise(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
