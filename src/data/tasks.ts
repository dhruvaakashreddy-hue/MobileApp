import type { NudgeCategory } from '../types';

/**
 * The task pool.
 *
 * Nudges are composed, not listed: every nudge is one action placed inside one
 * of the active persona's phrasings. 100 actions x 50 phrasings gives 5,000
 * distinct nudges per persona, which is why you can go a very long time without
 * seeing a repeat — see src/lib/nudgePool.ts for the no-repeat queue.
 *
 * Actions are bare imperative phrases ("drink a full glass of water") so they
 * slot into both phrasing shapes: standalone ("{t}. NOW.") and infinitive
 * ("I need you to {t}.").
 */

export interface TaskAction {
  id: string;
  text: string;
  category: NudgeCategory;
}

/**
 * The chaotic half of every this-or-that.
 *
 * Deliberately short — a couple of words next to a full exercise drill, so the
 * two options never read as the same kind of ask and the choice is obvious at
 * a glance.
 *
 * They stay cheeky rather than harmful: every one is something you do to
 * yourself or to your own day. Nothing unsafe, nothing that damages anything,
 * and nothing that makes another person the punchline or lands them with the
 * consequences.
 */
export interface ChaosAction {
  id: string;
  text: string;
}

const a = (id: string, category: NudgeCategory, text: string): TaskAction => ({
  id,
  category,
  text,
});

/**
 * The healthy half: exercises, mobility and breathing drills, and small resets
 * that leave you looser and in a better mood than they found you.
 */
export const TASK_ACTIONS: TaskAction[] = [

  // ── stretch ───────────────────────────────────────────────────────────
  a('s1', 'stretch', 'roll your shoulders back ten times'),
  a('s2', 'stretch', 'reach both arms overhead and hold for ten'),
  a('s3', 'stretch', 'do a slow neck roll each way'),
  a('s4', 'stretch', 'clasp your hands behind you and open your chest'),
  a('s5', 'stretch', 'touch your toes and hang there for fifteen seconds'),
  a('s6', 'stretch', 'do a standing side bend each way'),
  a('s7', 'stretch', 'twist gently through your spine, both directions'),
  a('s8', 'stretch', 'stretch your wrists and fingers right out'),
  a('s9', 'stretch', 'do a doorway chest stretch for twenty seconds'),
  a('s10', 'stretch', 'pull one knee to your chest, then the other'),
  a('s11', 'stretch', 'circle your ankles ten times each way'),
  a('s12', 'stretch', 'drop your ear toward each shoulder and hold'),
  a('s13', 'stretch', 'do five slow cat-cow stretches'),
  a('s14', 'stretch', 'stretch your hamstrings for thirty seconds'),
  a('s15', 'stretch', 'open your hips with a slow lunge each side'),
  a('s16', 'stretch', 'squeeze your shoulder blades together ten times'),
  a('s17', 'stretch', 'let your arms hang and your head drop forward'),

  // ── movement ──────────────────────────────────────────────────────────
  a('m1', 'movement', 'do ten squats'),
  a('m2', 'movement', 'do ten pushups'),
  a('m3', 'movement', 'hold a plank for thirty seconds'),
  a('m4', 'movement', 'do twenty jumping jacks'),
  a('m5', 'movement', 'march in place for one minute'),
  a('m6', 'movement', 'do ten calf raises'),
  a('m7', 'movement', 'do five lunges on each leg'),
  a('m8', 'movement', 'walk a full lap of the room'),
  a('m9', 'movement', 'climb one flight of stairs'),
  a('m10', 'movement', 'do fifteen seconds of high knees'),
  a('m11', 'movement', 'do ten glute bridges'),
  a('m12', 'movement', 'shadow box for thirty seconds'),
  a('m13', 'movement', 'do five slow sit-to-stands from your chair'),
  a('m14', 'movement', 'balance on one leg for twenty seconds each side'),
  a('m15', 'movement', 'do ten arm circles each direction'),
  a('m16', 'movement', 'jog on the spot for forty-five seconds'),
  a('m17', 'movement', 'do five burpees — badly is fine'),

  // ── breathe ───────────────────────────────────────────────────────────
  a('b1', 'breathe', 'take five slow breaths, out longer than in'),
  a('b2', 'breathe', 'breathe in for four, hold four, out for four'),
  a('b3', 'breathe', 'take one deep breath with your whole chest'),
  a('b4', 'breathe', 'unclench your jaw and let it hang loose'),
  a('b5', 'breathe', 'drop your shoulders away from your ears'),
  a('b6', 'breathe', 'close your eyes and just breathe for thirty seconds'),
  a('b7', 'breathe', 'sigh out loud, twice, properly'),
  a('b8', 'breathe', 'relax your forehead and your eyebrows'),
  a('b9', 'breathe', 'breathe out slowly through pursed lips'),
  a('b10', 'breathe', 'put a hand on your belly and breathe into it'),
  a('b11', 'breathe', 'soften your tongue off the roof of your mouth'),
  a('b12', 'breathe', 'take three breaths before you do anything else'),
  a('b13', 'breathe', 'inhale slowly, then count to six on the way out'),
  a('b14', 'breathe', 'let your whole body go heavy for ten seconds'),
  a('b15', 'breathe', 'breathe slowly until your shoulders drop'),
  a('b16', 'breathe', 'unclench your hands and shake them out'),
  a('b17', 'breathe', 'breathe out twice as long as you breathe in'),

  // ── hydration ─────────────────────────────────────────────────────────
  a('h1', 'hydration', 'drink a full glass of water'),
  a('h2', 'hydration', 'refill your water bottle'),
  a('h3', 'hydration', 'take five big sips of water'),
  a('h4', 'hydration', 'swap your next coffee for water'),
  a('h5', 'hydration', 'drink some water before your next task'),
  a('h6', 'hydration', 'finish whatever is left in that bottle'),
  a('h7', 'hydration', 'have a glass of water with nothing added'),
  a('h8', 'hydration', 'drink something warm and caffeine-free'),
  a('h9', 'hydration', 'put a glass of water within arm\'s reach'),
  a('h10', 'hydration', 'sip water slowly for a full minute'),
  a('h11', 'hydration', 'rehydrate before the headache turns up'),
  a('h12', 'hydration', 'drink half a bottle of water now'),
  a('h13', 'hydration', 'make yourself a herbal tea'),
  a('h14', 'hydration', 'drink a glass of water and actually finish it'),
  a('h15', 'hydration', 'work out whether you have drunk anything today'),
  a('h16', 'hydration', 'pour a proper glass of water, not a sip'),
  a('h17', 'hydration', 'take a real water break'),

  // ── eyes ──────────────────────────────────────────────────────────────
  a('e1', 'eyes', 'look at something twenty feet away for twenty seconds'),
  a('e2', 'eyes', 'blink slowly, ten times'),
  a('e3', 'eyes', 'close your eyes and cover them with your palms'),
  a('e4', 'eyes', 'find the furthest thing you can see and look at it'),
  a('e5', 'eyes', 'roll your eyes in a slow circle each way'),
  a('e6', 'eyes', 'focus on something near, then far, five times'),
  a('e7', 'eyes', 'step away from the screen for two minutes'),
  a('e8', 'eyes', 'turn your screen brightness down a notch'),
  a('e9', 'eyes', 'look left, right, up and down, slowly'),
  a('e10', 'eyes', 'rest your eyes shut for fifteen seconds'),
  a('e11', 'eyes', 'find something green and look at it'),
  a('e12', 'eyes', 'blink hard five times to reset your eyes'),
  a('e13', 'eyes', 'give your eyes a full minute off the screen'),
  a('e14', 'eyes', 'move your screen a little further away'),
  a('e15', 'eyes', 'look out of a window and let your eyes relax'),
  a('e16', 'eyes', 'stop squinting and soften your gaze'),

  // ── mood ──────────────────────────────────────────────────────────────
  a('d1', 'mood', 'stand in daylight for one minute'),
  a('d2', 'mood', 'open a window and breathe the outside air'),
  a('d3', 'mood', 'put on one song you love and finish it'),
  a('d4', 'mood', 'wash your face with cold water'),
  a('d5', 'mood', 'step outside for two minutes'),
  a('d6', 'mood', 'stand up and shake your whole body out'),
  a('d7', 'mood', 'name three things you can hear right now'),
  a('d8', 'mood', 'roll your neck and smile, even if it\'s fake'),
  a('d9', 'mood', 'tidy one small thing near you'),
  a('d10', 'mood', 'put your phone down for two minutes'),
  a('d11', 'mood', 'stretch and yawn on purpose'),
  a('d12', 'mood', 'move somewhere brighter and sit there'),
  a('d13', 'mood', 'run cold water over your wrists'),
  a('d14', 'mood', 'stand tall and take up space for ten seconds'),
  a('d15', 'mood', 'take a short walk, even if it\'s indoors'),
  a('d16', 'mood', 'do absolutely nothing for thirty seconds'),
];

const c = (id: string, text: string): ChaosAction => ({ id, text });

export const CHAOS_ACTIONS: ChaosAction[] = [
  c('c1', 'steal a biscuit'),
  c('c2', 'eat the snack you were saving'),
  c('c3', 'take the last one — no guilt'),
  c('c4', 'leave the washing up'),
  c('c5', 'ignore one email on purpose'),
  c('c6', 'reply with just “k”'),
  c('c7', 'mute the group chat'),
  c('c8', 'eat dessert first'),
  c('c9', 'take the good mug'),
  c('c10', 'use the fancy pen'),
  c('c11', 'claim the comfy seat'),
  c('c12', 'open the biscuits early'),
  c('c13', 'take the bigger half'),
  c('c14', 'leave your desk messy'),
  c('c15', 'skip one chore tonight'),
  c('c16', 'take a slightly longer lunch'),
  c('c17', 'say no to one small thing'),
  c('c18', 'cancel something you don\'t want to do'),
  c('c19', 'declare an early weekend'),
  c('c20', 'take the scenic route back'),
  c('c21', 'turn the music up a notch'),
  c('c22', 'leave one thing undone today'),
  c('c23', 'postpone one boring thing'),
  c('c24', 'let a notification go unread'),
  c('c25', 'read it and don\'t reply yet'),
  c('c26', 'put your phone face down'),
  c('c27', 'take a break you didn\'t earn'),
  c('c28', 'wear the good socks'),
  c('c29', 'eat the nice chocolate'),
  c('c30', 'hide your to-do list for five minutes'),
  c('c31', 'stare into space on purpose'),
  c('c32', 'take the shortcut'),
  c('c33', 'leave a plate for future you'),
  c('c34', 'keep the last good pen'),
  c('c35', 'ignore the doorbell'),
  c('c36', 'rename a friend in your phone'),
  c('c37', 'send one emoji, no context'),
  c('c38', 'take a photo of yourself mid-yawn'),
  c('c39', 'abandon one tab forever'),
  c('c40', 'treat yourself, unreasonably'),
  c('c41', 'take a biscuit for later too'),
  c('c42', 'skip the boring bit'),
  c('c43', 'leave the camera off'),
  c('c44', 'take a nap-length pause'),
  c('c45', 'start the good snack early'),
  c('c46', 'stop working two minutes early'),
  c('c47', 'take the window seat'),
  c('c48', 'pretend you\'re busy for a minute'),
  c('c49', 'dodge one small errand'),
  c('c50', 'do it tomorrow instead'),
];
