import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NUDGES_PER_PERSONA,
  PERSONAS,
  getPersona,
  resolvePersonaId,
} from './personas.ts';

describe('persona rename migration', () => {
  it('carries the old id across to the renamed persona', () => {
    // Anyone whose stored persona is the old id must keep it, not be dropped
    // back to the default one.
    assert.equal(resolvePersonaId('unhinged-bestie'), 'mischievous-bestie');
    assert.equal(getPersona('unhinged-bestie').name, 'Mischievous Bestie');
  });

  it('leaves current ids alone', () => {
    for (const p of PERSONAS) {
      assert.equal(resolvePersonaId(p.id), p.id);
      assert.equal(getPersona(p.id).id, p.id);
    }
  });

  it('still falls back for a genuinely unknown id', () => {
    assert.equal(getPersona('does-not-exist').id, PERSONAS[0].id);
  });
});

describe('every persona is complete', () => {
  it('has the fields the UI and notifications depend on', () => {
    for (const p of PERSONAS) {
      assert.ok(p.name.length > 0, `${p.id} name`);
      assert.ok(p.emoji.length > 0, `${p.id} emoji`);
      assert.ok(p.description.length > 0, `${p.id} description`);
      assert.ok(p.dismissLabel.length > 0, `${p.id} dismissLabel`);
      assert.ok(p.sound.length > 0, `${p.id} sound`);
      assert.ok(p.theme.hex.startsWith('#'), `${p.id} theme hex`);
      assert.equal(p.wrappers.length, 50, `${p.id} wrappers`);
      assert.equal(new Set(p.wrappers).size, 50, `${p.id} duplicate wrappers`);
    }
  });

  it('keeps 5,000 nudges per persona after the rewrite', () => {
    assert.equal(NUDGES_PER_PERSONA, 5000);
  });

  it('every phrasing has a task slot', () => {
    for (const p of PERSONAS) {
      for (const w of p.wrappers) {
        assert.ok(w.includes('{t}'), `${p.id}: "${w}" has no slot`);
      }
    }
  });
});
