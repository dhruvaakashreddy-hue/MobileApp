import type { NudgeCategory } from '../types';

/**
 * The task pool.
 *
 * Nudges are composed, not listed: every nudge is one TASK_ACTION placed inside
 * one of the active persona's phrasings. 100 actions x 50 phrasings gives 5,000
 * distinct nudges per persona, which is why you can go a very long time without
 * seeing a repeat — see src/lib/nudgePool.ts for the no-repeat queue.
 *
 * Writing 5,000 lines by hand would mean 5,000 chances to write a dull one.
 * Composing them keeps every part good: each action is a real, specific thing
 * to do, and each phrasing is in character.
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
 * Rules these all follow, because a nudge that gets someone in trouble is a bad
 * nudge: nothing unsafe, nothing that damages anything, nothing that makes a
 * stranger the punchline, and nothing you couldn't do in a shared house or an
 * open-plan office. Mild self-embarrassment is the whole point; anyone else's
 * embarrassment is not.
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

export const TASK_ACTIONS: TaskAction[] = [
  // ── posture ──────────────────────────────────────────────────────────
  a('p1', 'posture', 'sit up straight'),
  a('p2', 'posture', 'roll your shoulders back'),
  a('p3', 'posture', 'pull your chin back over your spine'),
  a('p4', 'posture', 'plant both feet flat on the floor'),
  a('p5', 'posture', 'lift your screen to eye level'),
  a('p6', 'posture', 'stop craning down at your phone'),
  a('p7', 'posture', 'straighten out your lower back'),
  a('p8', 'posture', 'drop your shoulders away from your ears'),
  a('p9', 'posture', 'uncross your legs'),
  a('p10', 'posture', 'sit back into the chair properly'),
  a('p11', 'posture', 'lengthen your neck'),
  a('p12', 'posture', 'stop leaning on one elbow'),
  a('p13', 'posture', 'square your hips in that seat'),
  a('p14', 'posture', 'straighten your wrists at the keyboard'),
  a('p15', 'posture', 'stand up tall for ten seconds'),
  a('p16', 'posture', 'line your ears up over your shoulders'),
  a('p17', 'posture', 'stop slouching toward the monitor'),

  // ── hydration ────────────────────────────────────────────────────────
  a('h1', 'hydration', 'drink a full glass of water'),
  a('h2', 'hydration', 'refill your water bottle'),
  a('h3', 'hydration', 'take three big sips of water'),
  a('h4', 'hydration', 'swap that coffee for water'),
  a('h5', 'hydration', 'drink water before you do anything else'),
  a('h6', 'hydration', 'finish whatever is left in that bottle'),
  a('h7', 'hydration', 'get a glass of water and actually drink it'),
  a('h8', 'hydration', 'hydrate before the headache turns up'),
  a('h9', 'hydration', 'put a glass of water on your desk'),
  a('h10', 'hydration', 'drink something without caffeine in it'),
  a('h11', 'hydration', 'have a glass of water with no sugar in it'),
  a('h12', 'hydration', 'get through half a bottle of water'),
  a('h13', 'hydration', 'drink water, then drink a bit more'),
  a('h14', 'hydration', 'work out whether you have drunk anything today'),
  a('h15', 'hydration', 'pour yourself a proper glass of water'),
  a('h16', 'hydration', 'rehydrate before you get cranky'),
  a('h17', 'hydration', 'take a water break'),

  // ── movement ─────────────────────────────────────────────────────────
  a('m1', 'movement', 'do ten pushups'),
  a('m2', 'movement', 'do fifteen squats'),
  a('m3', 'movement', 'stand up and stretch'),
  a('m4', 'movement', 'walk to the end of the room and back'),
  a('m5', 'movement', 'do twenty jumping jacks'),
  a('m6', 'movement', 'reach down and touch your toes'),
  a('m7', 'movement', 'stretch your arms above your head'),
  a('m8', 'movement', 'take one lap around the building'),
  a('m9', 'movement', 'hold a plank for thirty seconds'),
  a('m10', 'movement', 'roll out your ankles and wrists'),
  a('m11', 'movement', 'walk up and down one flight of stairs'),
  a('m12', 'movement', 'do ten calf raises'),
  a('m13', 'movement', 'shake out your whole body'),
  a('m14', 'movement', 'stretch your hamstrings'),
  a('m15', 'movement', 'march in place for a minute'),
  a('m16', 'movement', 'do five lunges on each leg'),
  a('m17', 'movement', 'get up and move for two minutes'),

  // ── social ───────────────────────────────────────────────────────────
  a('s1', 'social', 'text a friend something stupid'),
  a('s2', 'social', "call someone who'd be glad to hear from you"),
  a('s3', 'social', 'reply to that message you left on read'),
  a('s4', 'social', 'send someone a meme'),
  a('s5', 'social', "check in on a friend you haven't seen lately"),
  a('s6', 'social', 'ring a family member'),
  a('s7', 'social', 'tell someone you appreciate them'),
  a('s8', 'social', 'send a voice note instead of typing'),
  a('s9', 'social', 'make plans with someone for this week'),
  a('s10', 'social', 'answer the group chat'),
  a('s11', 'social', 'pay someone a compliment out loud'),
  a('s12', 'social', 'share the thing that made you laugh today'),
  a('s13', 'social', 'ask a friend how they actually are'),
  a('s14', 'social', "send a photo of whatever you're looking at"),
  a('s15', 'social', 'thank someone who helped you recently'),
  a('s16', 'social', 'say hello to a person nearby'),
  a('s17', 'social', "message someone you've been meaning to"),

  // ── random ───────────────────────────────────────────────────────────
  a('r1', 'random', 'unclench your jaw'),
  a('r2', 'random', 'blink properly a few times'),
  a('r3', 'random', 'take one slow, deep breath'),
  a('r4', 'random', 'look out of a window for ten seconds'),
  a('r5', 'random', 'pick one thing up off the floor'),
  a('r6', 'random', 'put your phone down for a minute'),
  a('r7', 'random', 'look at something twenty feet away'),
  a('r8', 'random', 'relax your forehead'),
  a('r9', 'random', 'stretch your fingers out'),
  a('r10', 'random', 'notice three things you can hear'),
  a('r11', 'random', 'straighten one messy pile'),
  a('r12', 'random', 'open a window for some air'),
  a('r13', 'random', 'close your eyes for fifteen seconds'),
  a('r14', 'random', 'move somewhere with better light'),
  a('r15', 'random', 'bin one piece of rubbish near you'),
  a('r16', 'random', 'put one thing back where it belongs'),

  // ── work ─────────────────────────────────────────────────────────────
  a('w1', 'work', 'step away from that screen for five minutes'),
  a('w2', 'work', 'save your work'),
  a('w3', 'work', "close the tabs you aren't using"),
  a('w4', 'work', 'write down the one thing that matters today'),
  a('w5', 'work', 'take a real break, not a scrolling break'),
  a('w6', 'work', "eat something that didn't come out of a packet"),
  a('w7', 'work', 'finish the task you abandoned earlier'),
  a('w8', 'work', 'put your phone in another room for ten minutes'),
  a('w9', 'work', 'take your lunch properly'),
  a('w10', 'work', 'tidy your desk for sixty seconds'),
  a('w11', 'work', 'mute your notifications for one focused block'),
  a('w12', 'work', "write down whatever is stuck in your head"),
  a('w13', 'work', 'finish one small thing and cross it off'),
  a('w14', 'work', 'take a break before you need one'),
  a('w15', 'work', 'stand up before your next meeting'),
  a('w16', 'work', 'look away from the screen for twenty seconds'),
];

const c = (id: string, text: string): ChaosAction => ({ id, text });

export const CHAOS_ACTIONS: ChaosAction[] = [
  c('c1', 'do your best evil laugh, out loud'),
  c('c2', 'give the nearest object a full name and backstory'),
  c('c3', 'narrate the next thirty seconds like a nature documentary'),
  c('c4', 'walk to the next room like you\'re in a music video'),
  c('c5', 'text a friend the worst photo of yourself you own'),
  c('c6', 'speak in an accent for the next two minutes'),
  c('c7', 'declare war on a houseplant, verbally'),
  c('c8', 'compliment an inanimate object, sincerely'),
  c('c9', 'do a dramatic slow-motion stretch'),
  c('c10', 'send someone a voice note of you humming, no context'),
  c('c11', 'hold a staring contest with the nearest pet or poster'),
  c('c12', 'introduce yourself to the room like it\'s a talk show'),
  c('c13', 'text someone \'i knew it\' and nothing else'),
  c('c14', 'invent a handshake and practise it alone'),
  c('c15', 'give a two-sentence TED talk to no one'),
  c('c16', 'do one lap of the room walking backwards'),
  c('c17', 'rate the last thing you ate out of ten, out loud'),
  c('c18', 'pick a theme song for the rest of your day'),
  c('c19', 'do a victory pose for no reason'),
  c('c20', 'whisper your to-do list menacingly'),
  c('c21', 'name your chair. commit to it.'),
  c('c22', 'do the worst dance you can for ten seconds'),
  c('c23', 'describe your outfit like an auction lot'),
  c('c24', 'send a friend a photo of your left shoe'),
  c('c25', 'practise your acceptance speech for an award you\'ll never win'),
  c('c26', 'balance something harmless on your head for ten seconds'),
  c('c27', 'read the nearest label in a villain voice'),
  c('c28', 'do a dramatic sigh loud enough to concern someone'),
  c('c29', 'high-five yourself. both hands. count it.'),
  c('c30', 'give the weather a one-star review out loud'),
  c('c31', 'walk somewhere with maximum unearned confidence'),
  c('c32', 'narrate your next three actions in the third person'),
  c('c33', 'hum the same four notes until it becomes a problem'),
  c('c34', 'give your phone a stern talking-to'),
  c('c35', 'do an impression of yourself at 7am'),
  c('c36', 'pick a fight with a mirror, lose it'),
  c('c37', 'text someone a single emoji with total confidence'),
  c('c38', 'do a slow clap for a task you already finished'),
  c('c39', 'explain your job to the nearest wall'),
  c('c40', 'give one household object a promotion'),
  c('c41', 'practise a fake laugh until one real one escapes'),
  c('c42', 'announce your next move like a sports commentator'),
  c('c43', 'take the most unflattering selfie possible and keep it'),
  c('c44', 'salute the fridge'),
  c('c45', 'do a dramatic reading of the last text you received'),
  c('c46', 'stand up and stretch like you just woke up in a film'),
  c('c47', 'name three things in the room as if you\'re a pirate'),
  c('c48', 'give yourself a nickname and use it once today'),
  c('c49', 'do a lap of honour around your own chair'),
  c('c50', 'apologise to a plant for something you didn\'t do'),
];
