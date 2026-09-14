export type NudgeCategory =
  | 'posture'
  | 'hydration'
  | 'movement'
  | 'social'
  | 'random'
  | 'work';

export interface PersonaTheme {
  /** Tailwind gradient stops for the persona's hero surfaces. */
  gradient: string;
  /** Solid accent used for buttons, rings and active states. */
  accent: string;
  /** Readable text colour to place on top of `accent`. */
  onAccent: string;
  /** Soft tinted background for cards in this persona's colourway. */
  soft: string;
  /** Hex accent, for the native notification LED / icon tint. */
  hex: string;
}

export interface Persona {
  id: string;
  name: string;
  emoji: string;
  description: string;
  isPremium: boolean;
  /** Label shown on the dismiss button of the in-app alert, in-character. */
  dismissLabel: string;
  /** Bundled notification sound filename (without extension on iOS). */
  sound: string;
  theme: PersonaTheme;
  /**
   * In-character phrasings with a `{t}` slot for the task. Combined with the
   * shared task list this is what produces thousands of distinct nudges — see
   * src/lib/nudgePool.ts.
   */
  wrappers: string[];
}
