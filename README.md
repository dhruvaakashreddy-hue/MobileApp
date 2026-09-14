# Nudge 🫡

Random, in-character reminders to sit up, drink water and move — delivered by a
persona you pick, at times you can't predict.

Cross-platform (Android + iOS) via Capacitor. **Local-first: the nudge engine
makes no network calls at all**, and all 90 lines ship bundled in the app.

Sign-in (phone OTP) is the one networked feature, and it is deliberately
optional — "continue without an account" gives a fully functional, fully
offline app. See `docs/AUTH_SETUP.md`.

---

## Quick start

```bash
npm install
npm run dev          # browser preview at localhost:5173
```

The browser preview is genuinely useful — every screen works, and because there
are no OS notifications on web, "Send me one right now" shows the in-app persona
card directly so you can see the alert without a device.

### Running on a device

```bash
npm run build
npx cap sync
npx cap run android      # or: npx cap open android
npx cap run ios          # macOS + Xcode only
```

Android needs the Android SDK and JDK 17+. iOS needs macOS, Xcode and
CocoaPods.

---

## How it works

### The nudge pool: 5,000 per persona, no repeats

A nudge is one task action rendered through one of the persona's phrasings, so
the pool is every pairing: 100 actions x 50 phrasings = **5,000 distinct nudges
per persona**. Composing them beats listing them — writing 5,000 lines by hand
would mean 5,000 chances to write a dull one.

Every one is used before any repeats. The order is a seeded shuffle, so only a
seed and a cursor are stored rather than a 5,000-entry list, and the permutation
is recomputed on demand. Exhausting the pool reshuffles with a new seed, so the
next cycle isn't the same order again. Changing persona or categories changes
the pool, which starts a fresh cycle.

### Scheduling

`src/lib/scheduling.ts` holds the time maths as pure functions — no Capacitor,
no ambient `Date.now()`. That's deliberate: overnight active-hour windows and
"push this nudge to tomorrow morning" are the fiddly parts, and they're much
easier to reason about (and test) in isolation.

- A nudge every **30 minutes**, fixed.
- If one would land outside active hours, it's pushed to the next window open.
- Windows that wrap past midnight (22:00 → 06:00) work correctly.
- Disabled categories are excluded from the pool.

### Delivering a nudge while the app is open

Three paths, all ending at the same persona card:

1. **App backgrounded or closed** — the OS notification fires, and tapping it
   reopens the app onto the card.
2. **App open, native** — the plugin's foreground listener catches delivery.
3. **App open, any platform** — a watcher ticks every 15s and shows anything
   that has come due.

The third exists because the first two don't cover an open app on the web at
all, and are not guaranteed on every native foreground case: without it the
countdown reaches zero and nothing happens.

### Why a rolling buffer, not a strict chain

The original spec called for chain scheduling — schedule one, and when it fires,
schedule the next. **That breaks as soon as the OS evicts the app**, which for
an app like this is most of the time: no JS is running to observe the delivery,
so nothing re-arms and the nudges stop permanently.

Instead, `src/lib/notifications.ts` keeps a rolling buffer of the next 12
nudges, topped back up on every delivery, every app resume and every settings
change. Twelve is far below iOS's hard cap of 64 pending local notifications,
so the limit the spec was worried about is never approached. Each buffered nudge
still gets its own independent random gap — the unpredictability is identical,
it just survives the app being killed.

### Stats that stay honest

Because nudges are delivered while the app is dead, "nudges today" can't be
counted by listening for events. Each scheduled nudge is mirrored to
Preferences, and on resume `reconcileDelivered()` credits every planned nudge
whose fire time has passed — so the counter and the streak are right even if you
never open the app while one arrives.

### Profile

After a first sign-in, users set a name (required), an optional email, and a
picture — one of 16 presets, a camera shot, or something from the gallery.

Presets are stored as an id (`preset:unicorn`) and rendered from a gradient and
emoji, so a chosen avatar costs a few bytes rather than a base64 blob. A custom
photo is centre-cropped and re-encoded to a 256px JPEG before storage
(`src/lib/image.ts`) — Preferences is built for small values, and a phone
camera produces several MB, so this bound is not optional.

Guests skip the mandatory profile: they explicitly declined to hand over
details, and demanding a name straight afterwards would contradict that. They
can still set one from Settings.

### Sound

Each persona has its own notification sound. When a nudge is delivered to a
backgrounded app the OS plays it; when the app is already open the system
suppresses its banner, so the in-app persona card plays the same sound itself
(`src/lib/sound.ts`). Both paths honour the Settings sound toggle.

The bundled sounds are synthesised placeholders — a short motif per persona,
generated by `scripts/gen-sounds.mjs`. Swap in real audio before release.

### Layout

```
src/
  data/tasks.ts        100 task actions across 6 categories
  data/personas.ts     3 personas, 50 in-character phrasings each
  lib/
    nudgePool.ts       pool maths + the no-repeat queue
    auth.ts            phone OTP — stubbed, see docs/AUTH_SETUP.md
    image.ts           profile photo capture + bounded re-encode
    sound.ts           in-app nudge audio
    scheduling.ts      pure time maths (no side effects)
    notifications.ts   scheduling, channels, listeners, reconciliation
    storage.ts         typed Preferences wrapper
    billing.ts         subscription — stubbed, see docs/BILLING_DECISION.md
    deeplink.ts        Razorpay return trip
  state/AppContext.tsx single source of truth
  screens/             Login, ProfileSetup, Home, Personas, Settings,
                       Paywall, Onboarding
  components/          UI primitives + the animated nudge card
api/                   minimal Razorpay server (not deployed)
docs/                  the decisions and manual steps left for you
```

---

## ⚠️ Before you ship

**Billing is stubbed.** `stubProvider` in `src/lib/billing.ts` unlocks premium
for free, locally, to anyone who taps the button. The paywall shows a visible
developer-build warning while it's active.

**Sign-in is stubbed.** `src/lib/auth.ts` sends no SMS and accepts the code
`123456` for any number that passes format validation. The OTP screen shows a developer-build banner while
it's active. `docs/AUTH_SETUP.md` has the Firebase setup, and flags three things
that bite at launch: account deletion is required by both stores once you have
login, nothing syncs across devices yet, and "collects nothing" stops being true
in your privacy labels.

**There's an open decision about how to charge at all** — Apple and Google
require their own billing for in-app digital subscriptions, which rules out
Razorpay inside a store build. Both options are laid out in
**`docs/BILLING_DECISION.md`**; I deliberately didn't pick one.

Everything else outstanding is in **`docs/MANUAL_SETUP.md`** — Razorpay KYC,
real notification sounds, icons, and the on-device test checklist.

---

## Scripts

| Command                       | Does                                       |
| ----------------------------- | ------------------------------------------ |
| `npm run dev`                 | Vite dev server                            |
| `npm run build`               | Typecheck + production build               |
| `npm run test`                | Scheduling logic tests                     |
| `npm run lint`                | oxlint                                     |
| `node scripts/gen-sounds.mjs` | Regenerate placeholder notification sounds |
