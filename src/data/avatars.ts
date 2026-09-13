/**
 * Preset profile pictures.
 *
 * Stored as an id (`preset:sunset-fox`), not as image data — the picture is
 * rendered from the gradient and emoji below. That keeps a chosen avatar a few
 * bytes in Preferences instead of a base64 blob, and it stays crisp at any size
 * because nothing is rasterised.
 *
 * A custom photo, by contrast, is stored as a bounded `data:` URI — see
 * src/lib/image.ts.
 */

export interface AvatarPreset {
  id: string;
  emoji: string;
  /** Tailwind gradient stops. */
  gradient: string;
  /** Short label, read out by screen readers. */
  label: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'gremlin', emoji: '👹', gradient: 'from-rose-500 to-orange-500', label: 'Gremlin' },
  { id: 'goblin', emoji: '👺', gradient: 'from-red-500 to-rose-700', label: 'Goblin' },
  { id: 'alien', emoji: '👽', gradient: 'from-lime-400 to-emerald-600', label: 'Alien' },
  { id: 'robot', emoji: '🤖', gradient: 'from-slate-400 to-slate-700', label: 'Robot' },
  { id: 'ghost', emoji: '👻', gradient: 'from-indigo-400 to-violet-600', label: 'Ghost' },
  { id: 'cat', emoji: '🐱', gradient: 'from-amber-400 to-orange-600', label: 'Cat' },
  { id: 'frog', emoji: '🐸', gradient: 'from-green-400 to-teal-600', label: 'Frog' },
  { id: 'shark', emoji: '🦈', gradient: 'from-sky-400 to-blue-700', label: 'Shark' },
  { id: 'unicorn', emoji: '🦄', gradient: 'from-fuchsia-400 to-purple-600', label: 'Unicorn' },
  { id: 'dragon', emoji: '🐲', gradient: 'from-emerald-400 to-cyan-600', label: 'Dragon' },
  { id: 'fire', emoji: '🔥', gradient: 'from-orange-400 to-red-600', label: 'Fire' },
  { id: 'star', emoji: '⭐', gradient: 'from-yellow-300 to-amber-500', label: 'Star' },
  { id: 'skull', emoji: '💀', gradient: 'from-neutral-400 to-neutral-700', label: 'Skull' },
  { id: 'brain', emoji: '🧠', gradient: 'from-pink-400 to-rose-600', label: 'Brain' },
  { id: 'rocket', emoji: '🚀', gradient: 'from-blue-400 to-indigo-700', label: 'Rocket' },
  { id: 'donut', emoji: '🍩', gradient: 'from-pink-300 to-fuchsia-500', label: 'Donut' },
];

const PRESET_PREFIX = 'preset:';

export function presetRef(id: string): string {
  return `${PRESET_PREFIX}${id}`;
}

export function isPresetRef(photo: string | null): boolean {
  return !!photo && photo.startsWith(PRESET_PREFIX);
}

export function getPreset(photo: string | null): AvatarPreset | null {
  if (!isPresetRef(photo)) return null;
  const id = photo!.slice(PRESET_PREFIX.length);
  return AVATAR_PRESETS.find((p) => p.id === id) ?? null;
}

/** A different suggestion each time the profile screen opens. */
export function randomPreset(): AvatarPreset {
  return AVATAR_PRESETS[Math.floor(Math.random() * AVATAR_PRESETS.length)];
}

/** Up to two letters from the name, for the fallback avatar. */
export function initialsOf(name: string | null): string {
  if (!name) return '🙂';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '🙂';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}
