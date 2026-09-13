import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNTRIES,
  formatE164ForDisplay,
  formatNationalNumber,
  isValidE164,
  isValidNationalNumber,
  normalizeNationalNumber,
  toE164,
  type Country,
} from './auth.ts';

const byCode = (code: string): Country => {
  const c = COUNTRIES.find((x) => x.code === code);
  if (!c) throw new Error(`no country ${code}`);
  return c;
};

const IN = byCode('IN');
const SG = byCode('SG');
const GB = byCode('GB');

describe('phone validation rejects plausible-looking junk', () => {
  it('rejects 1234567890 for +91 — right length, impossible prefix', () => {
    // Indian mobile numbers start with 6-9. This is the case that shipped
    // broken when validation was only a digit count.
    assert.equal(isValidNationalNumber(IN, '1234567890'), false);
  });

  it('rejects repeated-digit placeholders', () => {
    // 9999999999 fits India's numbering plan, so libphonenumber alone accepts
    // it — the extra guard is what rejects these.
    for (const n of ['0000000000', '1111111111', '9999999999', '8888888888']) {
      assert.equal(isValidNationalNumber(IN, n), false, `${n} should be invalid`);
    }
    assert.equal(isValidE164('+919999999999'), false, 'guard applies to E.164 too');
  });

  it('rejects Indian numbers starting 0-5', () => {
    for (const first of ['0', '1', '2', '3', '4', '5']) {
      assert.equal(
        isValidNationalNumber(IN, `${first}876543210`),
        false,
        `+91 ${first}... should be invalid`,
      );
    }
  });

  it('rejects the right length for the wrong country', () => {
    // 10 digits is valid in India, but Singapore numbers are 8.
    assert.equal(isValidNationalNumber(SG, '9876543210'), false);
  });

  it('rejects a UK landline — it cannot receive an SMS', () => {
    assert.equal(isValidNationalNumber(GB, '2012345678'), false);
  });

  it('rejects empty and partial input', () => {
    for (const n of ['', '9', '98765']) {
      assert.equal(isValidNationalNumber(IN, n), false, `"${n}" should be invalid`);
    }
  });
});

describe('phone validation accepts real mobile numbers', () => {
  it('accepts Indian mobiles across every valid prefix', () => {
    for (const first of ['6', '7', '8', '9']) {
      assert.equal(
        isValidNationalNumber(IN, `${first}876543210`),
        true,
        `+91 ${first}876543210 should be valid`,
      );
    }
  });

  it('accepts a valid number for each listed country', () => {
    const samples: Record<string, string> = {
      IN: '9876543210',
      US: '4155552671',
      GB: '7911123456',
      AE: '501234567',
      SG: '91234567',
      AU: '412345678',
      CA: '4165550123',
      DE: '15123456789',
    };
    for (const country of COUNTRIES) {
      const sample = samples[country.code];
      assert.equal(
        isValidNationalNumber(country, sample),
        true,
        `${country.code} sample ${sample} should be valid`,
      );
    }
  });

  it('accepts each country’s own placeholder example', () => {
    // The placeholder must never show a number the field would reject.
    for (const country of COUNTRIES) {
      assert.equal(
        isValidNationalNumber(country, country.example),
        true,
        `${country.code} placeholder "${country.example}" should be valid`,
      );
    }
  });

  it('ignores spaces, dashes and brackets', () => {
    for (const n of ['98765 43210', '98765-43210', '(98765) 43210']) {
      assert.equal(isValidNationalNumber(IN, n), true, `"${n}" should be valid`);
    }
  });
});

describe('isValidE164', () => {
  it('matches the national check', () => {
    assert.equal(isValidE164('+919876543210'), true);
    assert.equal(isValidE164('+911234567890'), false);
    assert.equal(isValidE164('not a number'), false);
    assert.equal(isValidE164(''), false);
  });
});

describe('helpers', () => {
  it('strips non-digits', () => {
    assert.equal(normalizeNationalNumber('(987) 65-43210'), '9876543210');
  });

  it('builds E.164', () => {
    assert.equal(toE164(IN, '98765 43210'), '+919876543210');
  });

  it('groups Indian numbers 5 + 5', () => {
    assert.equal(formatNationalNumber(IN, '9876543210'), '98765 43210');
  });

  it('formats E.164 back for display', () => {
    assert.equal(formatE164ForDisplay('+919876543210'), '+91 98765 43210');
  });
});
