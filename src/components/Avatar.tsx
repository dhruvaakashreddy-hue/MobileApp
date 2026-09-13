import { AVATAR_PRESETS, getPreset, initialsOf, isPresetRef } from '../data/avatars';

/**
 * Renders whichever kind of profile picture the user has: a preset (gradient +
 * emoji), a photo they took or picked (a `data:` URI), or their initials as a
 * fallback when neither is set.
 */
export function Avatar({
  photo,
  name,
  size = 64,
  className = '',
}: {
  photo: string | null;
  name: string | null;
  size?: number;
  className?: string;
}) {
  const preset = getPreset(photo);
  const isPhoto = !!photo && !isPresetRef(photo);

  const box = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.45),
  };

  if (isPhoto) {
    return (
      <img
        src={photo!}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  if (preset) {
    return (
      <span
        aria-hidden
        style={box}
        className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br ${preset.gradient} ${className}`}
      >
        {preset.emoji}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      style={{ ...box, fontSize: Math.round(size * 0.36) }}
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-700 font-display ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}

export { AVATAR_PRESETS };
