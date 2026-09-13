/**
 * Generates the placeholder notification sounds.
 *
 * These are deliberately simple synthesised tones — just enough that each
 * persona is distinguishable when a nudge lands, so the app is testable end to
 * end. TODO: replace with real recorded audio (see docs/MANUAL_SETUP.md);
 * re-running this script will overwrite whatever is there, so swap the files
 * rather than re-running once you have the real ones.
 *
 * Usage: node scripts/gen-sounds.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLE_RATE = 44100;

/** Each persona gets a motif that matches its temperament. */
const VOICES = {
  // Two blunt, martial square-wave barks.
  drill_sergeant: {
    duration: 0.9,
    wave: 'square',
    notes: [
      { at: 0.0, len: 0.18, freq: 233.08 },
      { at: 0.26, len: 0.34, freq: 174.61 },
    ],
    gain: 0.34,
  },
  // A gentle, slightly reproachful two-note sigh, falling.
  mom: {
    duration: 1.1,
    wave: 'sine',
    notes: [
      { at: 0.0, len: 0.36, freq: 587.33 },
      { at: 0.34, len: 0.52, freq: 440.0 },
    ],
    gain: 0.28,
  },
  // Three chaotic ascending blips.
  bestie: {
    duration: 0.85,
    wave: 'triangle',
    notes: [
      { at: 0.0, len: 0.14, freq: 659.25 },
      { at: 0.16, len: 0.14, freq: 880.0 },
      { at: 0.32, len: 0.26, freq: 1174.66 },
    ],
    gain: 0.3,
  },
  // Neutral fallback, used by the default channel.
  nudge_default: {
    duration: 0.7,
    wave: 'sine',
    notes: [
      { at: 0.0, len: 0.16, freq: 523.25 },
      { at: 0.2, len: 0.3, freq: 783.99 },
    ],
    gain: 0.28,
  },
};

function sample(wave, phase) {
  switch (wave) {
    case 'square':
      return Math.sign(Math.sin(phase));
    case 'triangle':
      return (2 / Math.PI) * Math.asin(Math.sin(phase));
    default:
      return Math.sin(phase);
  }
}

function render({ duration, wave, notes, gain }) {
  const total = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(total);

  for (const note of notes) {
    const start = Math.floor(note.at * SAMPLE_RATE);
    const len = Math.floor(note.len * SAMPLE_RATE);
    for (let i = 0; i < len && start + i < total; i++) {
      const t = i / SAMPLE_RATE;
      // Short attack and a decaying tail, so nothing clicks at the edges.
      const attack = Math.min(1, t / 0.008);
      const decay = Math.exp(-3.2 * (i / len));
      const phase = 2 * Math.PI * note.freq * t;
      out[start + i] += sample(wave, phase) * attack * decay * gain;
    }
  }
  return out;
}

/** 16-bit mono PCM WAV — the format both Android and iOS accept directly. */
function toWav(samples) {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // format: PCM
  buf.writeUInt16LE(1, 22); // channels: mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buf;
}

// Android reads sounds from res/raw; iOS from the app bundle root.
const targets = [
  join(root, 'android/app/src/main/res/raw'),
  join(root, 'ios/App/App/sounds'),
];
targets.forEach((d) => mkdirSync(d, { recursive: true }));

for (const [name, spec] of Object.entries(VOICES)) {
  const wav = toWav(render(spec));
  for (const dir of targets) {
    writeFileSync(join(dir, `${name}.wav`), wav);
  }
  console.log(`generated ${name}.wav (${(wav.length / 1024).toFixed(1)} KB)`);
}
console.log(`\nWritten to:\n  ${targets.join('\n  ')}`);
