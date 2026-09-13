import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AVATAR_PRESETS,
  getPreset,
  initialsOf,
  isPresetRef,
  presetRef,
  randomPreset,
} from './avatars.ts';

describe('avatar presets', () => {
  it('ships a usable number of distinct presets', () => {
    assert.ok(AVATAR_PRESETS.length >= 12);
    assert.equal(new Set(AVATAR_PRESETS.map((p) => p.id)).size, AVATAR_PRESETS.length);
  });

  it('every preset has an emoji, gradient and label', () => {
    for (const p of AVATAR_PRESETS) {
      assert.ok(p.emoji.length > 0, `${p.id} needs an emoji`);
      assert.match(p.gradient, /^from-.+ to-.+$/, `${p.id} needs a gradient`);
      assert.ok(p.label.length > 0, `${p.id} needs a label`);
    }
  });

  it('round-trips a preset reference', () => {
    for (const p of AVATAR_PRESETS) {
      const ref = presetRef(p.id);
      assert.equal(isPresetRef(ref), true);
      assert.equal(getPreset(ref)?.id, p.id);
    }
  });

  it('does not mistake a photo for a preset', () => {
    const photo = 'data:image/jpeg;base64,abc';
    assert.equal(isPresetRef(photo), false);
    assert.equal(getPreset(photo), null);
    assert.equal(getPreset(null), null);
  });

  it('returns null for an unknown preset id rather than throwing', () => {
    assert.equal(getPreset('preset:does-not-exist'), null);
  });

  it('randomPreset only ever returns a real preset', () => {
    for (let i = 0; i < 200; i++) {
      assert.ok(AVATAR_PRESETS.includes(randomPreset()));
    }
  });
});

describe('initials fallback', () => {
  it('takes first and last initials', () => {
    assert.equal(initialsOf('Ada Lovelace'), 'AL');
    assert.equal(initialsOf('Ada Byron Lovelace'), 'AL');
  });

  it('handles a single name', () => {
    assert.equal(initialsOf('Dhruva'), 'D');
  });

  it('falls back to an emoji when there is no name', () => {
    assert.equal(initialsOf(null), '🙂');
    assert.equal(initialsOf('   '), '🙂');
  });
});
