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
 * These involve the people around you — a compliment, a staring contest, a
 * daft selfie — because mischief performed alone is just another chore.
 *
 * The line they hold: the other person is in on the joke, never the butt of it.
 * Nothing that insults how someone looks, nothing aimed at a stranger that
 * would unsettle them, and no touching anyone who has not obviously invited it.
 * A nudge that embarrasses the user is funny; one that embarrasses a bystander
 * is something the user has to apologise for afterwards.
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
  c('c1', 'give a compliment to whoever\'s beside you'),
  c('c2', 'challenge someone to a staring contest'),
  c('c3', 'take a selfie pulling your ugliest face'),
  c('c4', 'ruffle a friend\'s hair'),
  c('c5', 'high-five the nearest person'),
  c('c6', 'tell someone a terrible joke'),
  c('c7', 'compliment a stranger\'s shoes'),
  c('c8', 'lose a staring contest dramatically'),
  c('c9', 'photobomb a friend\'s selfie'),
  c('c10', 'call a friend and say nothing'),
  c('c11', 'give someone an unprompted round of applause'),
  c('c12', 'tell a colleague they\'re doing great'),
  c('c13', 'gasp dramatically at absolutely nothing'),
  c('c14', 'ask someone a very stupid question'),
  c('c15', 'send a friend your worst photo'),
  c('c16', 'compliment someone\'s handwriting'),
  c('c17', 'greet someone like it\'s been ten years'),
  c('c18', 'tell someone your most boring fact'),
  c('c19', 'wave at someone across the room'),
  c('c20', 'give a pep talk to whoever\'s nearest'),
  c('c21', 'make eye contact and wink'),
  c('c22', 'ask someone to settle a fake argument'),
  c('c23', 'compliment someone\'s laugh'),
  c('c24', 'tell a friend you\'re proud of them'),
  c('c25', 'sing one line out loud'),
  c('c26', 'hand someone an object, no explanation'),
  c('c27', 'ask a friend to rate your posture'),
  c('c28', 'take a group selfie, everyone ugly face'),
  c('c29', 'challenge a friend to ten pushups'),
  c('c30', 'compliment the nearest person\'s outfit'),
  c('c31', 'commentate on what someone\'s doing'),
  c('c32', 'ask someone what they had for breakfast'),
  c('c33', 'give someone a nickname right now'),
  c('c34', 'do a silly walk past someone'),
  c('c35', 'text a friend “come here”, nothing else'),
  c('c36', 'thank someone for something trivial'),
  c('c37', 'challenge someone to rock paper scissors'),
  c('c38', 'mess up your own hair, leave it'),
  c('c39', 'ask a friend to guess your mood'),
  c('c40', 'say “guess what”, then say nothing'),
  c('c41', 'give the nearest person a thumbs up'),
  c('c42', 'tell someone you like their energy'),
  c('c43', 'do a dramatic slow turn toward someone'),
  c('c44', 'insist on a high five'),
  c('c45', 'compliment someone\'s chair, sincerely'),
  c('c46', 'tell a friend a fact you invented'),
  c('c47', 'start a slow clap and commit'),
  c('c48', 'ask someone to arm wrestle'),
  c('c49', 'introduce yourself to someone you know'),
  c('c50', 'offer someone half your snack'),
];
