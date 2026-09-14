import type { NudgeCategory, Persona } from '../types';
import { TASK_ACTIONS } from './tasks.ts';
import { renderNudge } from '../lib/nudgePool.ts';

/**
 * All nudge content ships bundled with the app — there is no backend and no
 * network call anywhere in the nudge pipeline. Adding a persona is purely a
 * matter of appending to this array.
 */

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
  wrappers: [
    '{t}. THAT IS AN ORDER.',
    'I SAID {t}. NOW.',
    'ON YOUR FEET — {t}.',
    '{t}, SOLDIER. NO EXCUSES.',
    'YOU HAVE TEN SECONDS TO {t}. GO.',
    'DO NOT MAKE ME ASK TWICE: {t}.',
    '{t}. THIS IS NOT A NEGOTIATION.',
    'MOVE IT! {t}!',
    '{t}. I AM WATCHING.',
    'DROP EVERYTHING AND {t}.',
    '{t}. AND DO IT PROPERLY.',
    'I NEED YOU TO {t}. RIGHT NOW.',
    '{t}! WHAT ARE YOU WAITING FOR?',
    'ATTENTION! {t} IMMEDIATELY.',
    '{t}. NO ONE IS COMING TO DO IT FOR YOU.',
    '{t}. THE CLOCK IS RUNNING.',
    'YOU WILL {t}, AND YOU WILL LIKE IT.',
    '{t}. THAT IS THE WHOLE MISSION.',
    'STOP STALLING AND {t}.',
    '{t}. DISCIPLINE IS A CHOICE.',
    'NOBODY LEAVES THIS ROOM UNTIL YOU {t}.',
    '{t}. EXCUSES ARE FOR CIVILIANS.',
    '{t}. I HAVE SEEN RECRUITS DO IT FASTER.',
    'LISTEN UP: {t}.',
    '{t}. THEN REPORT BACK.',
    'YOUR ORDERS ARE SIMPLE. {t}.',
    '{t}. THIS IS BASIC MAINTENANCE, SOLDIER.',
    'GET UP AND {t}. NO DEBATE.',
    '{t}. FUTURE YOU IS COUNTING ON IT.',
    'I DID NOT STUTTER. {t}.',
    '{t}. EVERY SECOND YOU WAIT IS A SECOND WASTED.',
    '{t} BEFORE I COUNT TO FIVE.',
    '{t}. THAT BODY IS EQUIPMENT. MAINTAIN IT.',
    'NO MORE SITTING AROUND. {t}.',
    '{t}. THAT IS AN ORDER FROM THE TOP.',
    '{t}. YOU ARE CAPABLE OF MORE THAN THIS.',
    'EYES UP. {t}.',
    '{t}. THE HARD PART IS STARTING.',
    'I WILL NOT ASK AGAIN: {t}.',
    '{t}. SMALL DRILLS WIN LONG WARS.',
    '{t}. THAT IS TODAY\'S ASSIGNMENT.',
    'YOU ARE NOT TIRED. {t}.',
    '{t}. AND NO COMPLAINING.',
    'REPORT FOR DUTY: {t}.',
    '{t}. THAT IS THE STANDARD AROUND HERE.',
    '{t}. THEN WE TALK ABOUT A BREAK.',
    '{t}. YOU KNEW THIS WAS COMING.',
    'ENOUGH. {t}.',
    '{t}. I EXPECT NOTHING LESS.',
    '{t}. DISMISSED WHEN IT IS DONE.',
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
  wrappers: [
    'sweetheart, {t}. for me.',
    'would it kill you to {t}? honestly.',
    '{t}. I\'m not asking again, I\'m just asking.',
    'I\'m not nagging, but please {t}.',
    'be a good one and {t}.',
    '{t}. you\'ll thank me later, you always do.',
    'your father would want you to {t}.',
    'just {t}, and then I\'ll leave you alone.',
    '{t}. is that so much to ask?',
    'I know you\'re busy, but {t}.',
    '{t}. I worry about you, you know.',
    'promise me you\'ll {t}.',
    '{t}. it takes two seconds.',
    'have you eaten? no? well at least {t}.',
    '{t}, love. please.',
    'I read an article about this. {t}.',
    'don\'t roll your eyes — {t}.',
    '{t}. I raised you better than this.',
    'if you won\'t do it for you, {t} for me.',
    '{t}. and put a jumper on while you\'re up.',
    '{t}. you never listen, but I keep trying.',
    'one small thing: {t}.',
    '{t}. I\'ll stop texting once you have.',
    'you used to {t} without being told.',
    '{t}. that\'s all I want, that\'s it.',
    'I\'m only saying this because I love you: {t}.',
    '{t}. your cousin does it every day, apparently.',
    'be honest — when did you last {t}?',
    '{t}. I\'ve been thinking about it all morning.',
    'just this once, {t}.',
    '{t}. you\'ll feel so much better, trust me.',
    'I\'m making tea. while I do, {t}.',
    '{t}. and text me back, it\'s been days.',
    'for goodness\' sake, {t}.',
    '{t}. I\'m not upset, I\'m just disappointed.',
    'you\'re an adult now, so {t} like one.',
    '{t}. that\'s my whole request, sweetheart.',
    'I\'ll say it once more: {t}.',
    '{t}. you know I\'m right, that\'s the annoying part.',
    'before you forget again, {t}.',
    '{t}. I\'ve asked nicely twice now.',
    'do it now, {t}, and I\'ll stop.',
    '{t}. you\'re doing so well otherwise.',
    'humour your mother and {t}.',
    '{t}. I\'d do it for you if I could.',
    'that\'s enough sitting about — {t}.',
    '{t}. I\'ll know if you didn\'t.',
    'look after yourself and {t}.',
    '{t}. that\'s the only thing on my list for you today.',
    'and another thing — {t}.',
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
  wrappers: [
    'bestie {t} rn. no thoughts.',
    'not you refusing to {t} 💀',
    'ok but seriously {t}. I\'ll wait.',
    '{t} challenge. you have to. rules are rules.',
    'girl. {t}. immediately.',
    '{t} or I\'m telling everyone you didn\'t',
    'the vibes are off. {t}.',
    '{t} bestie it\'s giving self care',
    'unserious behaviour. {t}.',
    'hear me out: {t}. revolutionary.',
    '{t} and thank me in like 10 mins',
    'this is your sign to {t} ✨',
    '{t}!! why are you still sitting there!!',
    'no bc {t}. I\'m being so normal about this.',
    '{t}. that\'s the tweet.',
    'bestie I love you but {t}.',
    '{t} before I start being annoying about it',
    'you WILL {t} and you WILL feel better',
    '{t}. I don\'t make the rules I just enforce them',
    'quick one: {t}. go.',
    '{t} bestie, main character energy',
    'stop scrolling and {t} 🫵',
    '{t}. it\'s not that deep, just do it',
    'help. {t}. right now.',
    '{t} pls I\'m begging (respectfully)',
    'we are NOT doing this today. {t}.',
    '{t} and then you can go back to whatever',
    'new personality unlocked when you {t}',
    '{t}. this is a bestie intervention.',
    'don\'t overthink it just {t}',
    '{t}. it\'s giving \'takes care of themselves\'',
    'bestie the audacity. {t}.',
    '{t} !!!! now !!!!',
    'the people are asking you to {t}',
    '{t}. small win. free dopamine.',
    'genuinely though, {t}.',
    '{t} or we\'re not friends (jk. but {t})',
    'I\'m not your mum but {t}',
    '{t}. you\'ll thank me. probably.',
    'emergency bestie alert: {t}',
    '{t}. no you can\'t finish the episode first',
    'be so serious right now and {t}',
    '{t} bestie. you\'re literally so close.',
    'two seconds. {t}. done.',
    '{t}. slay. that\'s it that\'s the nudge.',
    'ok real talk — {t}.',
    '{t}. future you is already grateful',
    'the girls are saying {t}',
    '{t} and I\'ll stop texting you',
    '{t}. that\'s my final offer.',
  ],
};

export const PERSONAS: Persona[] = [drillSergeant, naggingMom, unhingedBestie];

/** Total distinct nudges available per persona. */
export const NUDGES_PER_PERSONA = TASK_ACTIONS.length * drillSergeant.wrappers.length;

export const DEFAULT_PERSONA_ID = drillSergeant.id;

export function getPersona(id: string): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}

/**
 * A representative nudge for the persona picker and paywall. Deterministic, so
 * the same persona always previews with the same line.
 */
export function previewLine(persona: Persona): string {
  return renderNudge(persona, TASK_ACTIONS[0], 0);
}
