import type { NudgeCategory, NudgeLine, Persona } from '../types';

/**
 * All nudge content ships bundled with the app — there is no backend and no
 * network call anywhere in the nudge pipeline. Adding a persona is purely a
 * matter of appending to this array.
 */

const line = (
  id: string,
  category: NudgeCategory,
  text: string,
): NudgeLine => ({ id, text, category });

export const CATEGORY_LABELS: Record<NudgeCategory, string> = {
  posture: 'Posture',
  hydration: 'Hydration',
  movement: 'Movement',
  social: 'Social',
  random: 'Random chaos',
  work: 'Work breaks',
};

export const CATEGORY_EMOJI: Record<NudgeCategory, string> = {
  posture: '🪑',
  hydration: '💧',
  movement: '🏃',
  social: '💬',
  random: '🎲',
  work: '💻',
};

export const CATEGORY_BLURBS: Record<NudgeCategory, string> = {
  posture: 'Sit-up-straight callouts',
  hydration: 'Reminders to actually drink water',
  movement: 'Pushups, squats, stretching, walking',
  social: 'Text a friend, call someone back',
  random: 'Breathe, blink, unclench your jaw',
  work: 'Step away from the screen',
};

export const ALL_CATEGORIES: NudgeCategory[] = [
  'posture',
  'hydration',
  'movement',
  'social',
  'random',
  'work',
];

const drillSergeant: Persona = {
  id: 'drill-sergeant',
  name: 'Drill Sergeant',
  emoji: '🫡',
  description: 'Volume: maximum. Sympathy: none. Results: undeniable.',
  isPremium: false,
  dismissLabel: 'SIR YES SIR',
  sound: 'drill_sergeant',
  theme: {
    gradient: 'from-red-600 via-red-700 to-neutral-900',
    accent: 'bg-red-600',
    onAccent: 'text-white',
    soft: 'bg-red-500/10',
    hex: '#DC2626',
  },
  lines: [
    line('ds-1', 'posture', 'YOUR SPINE LOOKS LIKE A QUESTION MARK, SOLDIER. THE ANSWER IS SIT UP.'),
    line('ds-2', 'posture', 'SHOULDERS BACK. CHIN UP. YOU ARE NOT A SHRIMP. DO NOT BECOME A SHRIMP.'),
    line('ds-3', 'posture', 'I HAVE SEEN WET NOODLES WITH BETTER POSTURE. CORRECT IT. NOW.'),
    line('ds-4', 'posture', 'THAT CHAIR IS NOT A BEANBAG AND YOU ARE NOT A PUDDLE. SIT UP STRAIGHT.'),
    line('ds-5', 'posture', 'ONE MORE INCH OF SLOUCH AND YOU GET LEGALLY RECLASSIFIED AS FURNITURE.'),
    line('ds-6', 'hydration', 'DRINK WATER SOLDIER. HYDRATION IS NOT OPTIONAL.'),
    line('ds-7', 'hydration', 'YOUR BLOOD IS BASICALLY GRAVY AT THIS POINT. WATER. NOW.'),
    line('ds-8', 'hydration', 'COFFEE IS NOT WATER. COFFEE IS A LIE WITH CAFFEINE IN IT. DRINK THE REAL THING.'),
    line('ds-9', 'hydration', 'THAT BOTTLE ON YOUR DESK IS DECORATION AT THIS POINT. USE IT.'),
    line('ds-10', 'hydration', 'I WILL NOT WATCH YOU TURN INTO A RAISIN ON MY WATCH. HYDRATE.'),
    line('ds-11', 'movement', 'TEN PUSHUPS. RIGHT NOW. THE FLOOR IS RIGHT THERE AND IT IS JUDGING YOU.'),
    line('ds-12', 'movement', 'DROP AND GIVE ME FIFTEEN SQUATS. THE CHAIR WILL WAIT. IT ALWAYS WAITS.'),
    line('ds-13', 'movement', 'STAND UP AND STRETCH. YOU HAVE BEEN FOLDED LIKE A LAWN CHAIR FOR HOURS.'),
    line('ds-14', 'movement', 'MARCH IN PLACE FOR SIXTY SECONDS. YES, IN FRONT OF PEOPLE. OWN IT.'),
    line('ds-15', 'movement', 'YOUR LEGS ARE LOAD-BEARING EQUIPMENT, NOT DECORATION. USE THEM.'),
    line('ds-16', 'social', 'TEXT ONE PERSON WHO MISSES YOU. THAT IS AN ORDER, NOT A SUGGESTION.'),
    line('ds-17', 'social', 'CALL YOUR MOTHER. SHE OUTRANKS ME AND SHE ABSOLUTELY OUTRANKS YOU.'),
    line('ds-18', 'social', 'SEND A FRIEND A TERRIBLE PHOTO OF YOURSELF. MORALE IS A WEAPON.'),
    line('ds-19', 'social', 'YOU HAVE BEEN ALONE IN THIS ROOM TOO LONG. DEPLOY A MESSAGE.'),
    line('ds-20', 'social', 'REPLY TO THAT TEXT YOU HAVE BEEN IGNORING SINCE TUESDAY. I SAW IT.'),
    line('ds-21', 'random', 'LOOK OUT A WINDOW. CONFIRM THE OUTSIDE STILL EXISTS. REPORT BACK.'),
    line('ds-22', 'random', 'ONE DEEP BREATH. WITH THE WHOLE CHEST. THAT IS THE DRILL.'),
    line('ds-23', 'random', 'UNCLENCH YOUR JAW, SOLDIER. YOU ARE NOT CHEWING THROUGH STEEL.'),
    line('ds-24', 'random', 'BLINK. I HAVE BEEN WATCHING AND YOU HAVE NOT BLINKED IN SOME TIME.'),
    line('ds-25', 'random', 'PICK ONE THING UP OFF THE FLOOR. ONE. THE BASE MUST BE CLEAN.'),
    line('ds-26', 'work', 'STEP AWAY FROM THAT SCREEN FOR FIVE MINUTES. IT WILL SURVIVE WITHOUT YOU.'),
    line('ds-27', 'work', 'YOU HAVE READ THE SAME SENTENCE NINE TIMES. TAKE THE BREAK.'),
    line('ds-28', 'work', 'SAVE YOUR WORK. THEN WALK AWAY. BOTH ORDERS. IN THAT SEQUENCE.'),
    line('ds-29', 'work', 'THAT MEETING COULD HAVE BEEN AN EMAIL AND YOU KNOW IT. GO OUTSIDE.'),
    line('ds-30', 'work', 'TWENTY SECONDS. LOOK AT SOMETHING FAR AWAY. YOUR EYES ARE TROOPS TOO.'),
  ],
};

const naggingMom: Persona = {
  id: 'nagging-mom',
  name: 'Nagging Mom',
  emoji: '🧶',
  description: "Not angry. Just asking. For the fourth time today.",
  isPremium: true,
  dismissLabel: 'fine!! ok!!',
  sound: 'mom',
  theme: {
    gradient: 'from-amber-400 via-orange-400 to-rose-400',
    accent: 'bg-amber-500',
    onAccent: 'text-amber-950',
    soft: 'bg-amber-400/10',
    hex: '#F59E0B',
  },
  lines: [
    line('mom-1', 'posture', "sitting like that is why your back hurts. I'm not saying I told you so. but."),
    line('mom-2', 'posture', "sit up straight, sweetheart. you'll thank me when you're forty."),
    line('mom-3', 'posture', 'your grandmother sat exactly like that and now her spine is A Whole Situation.'),
    line('mom-4', 'posture', 'are you hunched over that phone again? I can feel it from here.'),
    line('mom-5', 'posture', "shoulders back. there. doesn't that feel better? you don't have to answer."),
    line('mom-6', 'hydration', "did you eat today? did you drink water? I'm not mad I'm just asking."),
    line('mom-7', 'hydration', 'water. plain water. not coffee, not that energy drink. I know about the energy drink.'),
    line('mom-8', 'hydration', "you've had three coffees and no water. I counted. a mother counts."),
    line('mom-9', 'hydration', 'drink something before the headache starts. you always get the headache.'),
    line('mom-10', 'hydration', "I bought you that water bottle for a reason, you know. it wasn't cheap."),
    line('mom-11', 'movement', 'stand up and stretch. just for a minute. for me.'),
    line('mom-12', 'movement', 'go for a little walk, the fresh air will do you good. take a jacket.'),
    line('mom-13', 'movement', "ten squats won't kill you. sitting all day might. I read an article."),
    line('mom-14', 'movement', "your father does twenty pushups every morning and he is SIXTY-THREE."),
    line('mom-15', 'movement', "move around a bit, sweetheart. you've been in that chair since I texted."),
    line('mom-16', 'social', 'have you called your friend back? the nice one. you know the one.'),
    line('mom-17', 'social', "text someone who loves you. I'll wait. no I won't, I'm making dinner."),
    line('mom-18', 'social', "would it kill you to send one message? one. I'm not asking for much."),
    line('mom-19', 'social', 'your friend posted something. say something nice. it takes two seconds.'),
    line('mom-20', 'social', 'call me. or call someone. just call SOMEONE. I worry.'),
    line('mom-21', 'random', "have you looked outside today? it's lovely and you're missing it."),
    line('mom-22', 'random', "unclench your jaw. you do that when you're stressed. you've always done that."),
    line('mom-23', 'random', 'take a deep breath. there you go. see? I know you.'),
    line('mom-24', 'random', "did you take your vitamins? no you didn't. I can tell."),
    line('mom-25', 'random', "tidy one little thing. just one. you'll feel so much better, trust me."),
    line('mom-26', 'work', "take a break. the work will still be there. it always is, that's the problem."),
    line('mom-27', 'work', "you've been working since this morning. even your father takes lunch."),
    line('mom-28', 'work', "eat something that isn't from a packet. I'm begging you politely."),
    line('mom-29', 'work', "close the laptop for ten minutes. TEN. I'm setting a timer in my heart."),
    line('mom-30', 'work', "you're doing a good job. now stop for a second. that's an instruction."),
  ],
};

const unhingedBestie: Persona = {
  id: 'unhinged-bestie',
  name: 'Unhinged Bestie',
  emoji: '💅',
  description: 'No indoor voice, no impulse control, genuinely wants the best for you.',
  isPremium: true,
  dismissLabel: 'ok bestie',
  sound: 'bestie',
  theme: {
    gradient: 'from-fuchsia-500 via-purple-500 to-indigo-500',
    accent: 'bg-fuchsia-500',
    onAccent: 'text-white',
    soft: 'bg-fuchsia-500/10',
    hex: '#D946EF',
  },
  lines: [
    line('bff-1', 'posture', 'bro your spine is doing a whole interpretive dance rn, sit up'),
    line('bff-2', 'posture', 'not you folded into that chair like a gas station phone charger 💀'),
    line('bff-3', 'posture', 'posture check bestie. you look like a comma. be a period.'),
    line('bff-4', 'posture', 'your neck is doing the vulture thing again. chin back. thank you.'),
    line('bff-5', 'posture', "you're giving 'discovered in a bog in 2000 years'. straighten up."),
    line('bff-6', 'hydration', 'drink water or stay dusty. those are the options. there is no third option.'),
    line('bff-7', 'hydration', "you're 60% water and running on like 12% rn. refill bestie."),
    line('bff-8', 'hydration', "hydrate or diedrate. I don't make the rules I just scream them"),
    line('bff-9', 'hydration', "that iced coffee is not hydration it's a personality. drink actual water."),
    line('bff-10', 'hydration', 'your skin just texted me asking for help. WATER. now.'),
    line('bff-11', 'movement', '10 squats right now. no thoughts. just legs. go go go'),
    line('bff-12', 'movement', "get up and do a silly little stretch and a silly little walk. you've earned it."),
    line('bff-13', 'movement', "we're doing 5 pushups. I'm not doing them but YOU are. accountability king."),
    line('bff-14', 'movement', "shake it out. full body shake. scare your roommate. it's fine."),
    line('bff-15', 'movement', "stand UP!! you've been sat so long the chair filed a formal complaint"),
    line('bff-16', 'social', "text a friend something unhinged rn. they're bored too. I promise."),
    line('bff-17', 'social', 'send the meme. do not overthink the meme. the meme is ready.'),
    line('bff-18', 'social', 'someone is thinking about you and being weird about it. text them first.'),
    line('bff-19', 'social', "annoy one (1) friend today. it's good for the ecosystem."),
    line('bff-20', 'social', "you've been unreachable for hours, people think you've ascended"),
    line('bff-21', 'random', "unclench your jaw babe, you're not fighting anyone (yet)"),
    line('bff-22', 'random', "blink!! you're doing the dead-eyed screen stare and it's haunting me"),
    line('bff-23', 'random', "go look outside for 10 seconds. there's a whole sky happening out there."),
    line('bff-24', 'random', 'take a deep breath. a REAL one. that last one was pathetic.'),
    line('bff-25', 'random', "pick ONE thing up off your floor. one. we're not doing a whole project."),
    line('bff-26', 'work', "close the tab you've been avoiding. or don't. but at least stand up."),
    line('bff-27', 'work', "that task isn't gonna do itself but also you need a snack. priorities."),
    line('bff-28', 'work', "you've been working for HOURS. log off. touch a wall. something."),
    line('bff-29', 'work', 'stare at something far away for 20 seconds. your eyeballs are begging.'),
    line('bff-30', 'work', 'break time!! non negotiable!! I will be so annoying about this!!'),
  ],
};

export const PERSONAS: Persona[] = [drillSergeant, naggingMom, unhingedBestie];

export const DEFAULT_PERSONA_ID = drillSergeant.id;

export function getPersona(id: string): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}

/** A representative line used as the preview on the persona picker. */
export function previewLine(persona: Persona): string {
  return persona.lines[0].text;
}
