# Nudge 🫡

Random, in-character reminders to sit up, drink water and move — delivered by a
persona you pick, at times you can't predict.

Cross-platform (Android + iOS) via Capacitor. **Local-first: the nudge engine
makes no network calls at all**, and all 90 lines ship bundled in the app.

**Nudge is a paid app: ₹99/month.** The profile and the subscription belong to
the account, not the device — signing out and back in with the same number
restores both, and a different number on the same phone gets neither.
 Sign in, subscribe, then the app opens —
there is no free tier and no guest mode, because a subscription needs an
identity to attach to or it cannot be restored on a new phone. Sign-in and
payment are the only networked features; everything about your actual day stays
on the device. See `docs/AUTH_SETUP.md` and `docs/BILLING_DECISION.md`.

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

### This or that

Every nudge is a choice between two things to do. Making it a decision turns a
notification people swipe away into a five-second choice they act on — and
either answer gets them off the chair, which is the whole point.

**The good one** is an exercise or a reset: stretching, a quick set of squats,
slow breathing, water, eye rest, daylight. Something that leaves you looser and
in a better mood than it found you.

**The mischievous one** is short and social: compliment whoever's beside you,
start a staring contest, pull an ugly face in a selfie, insist on a high five.
A handful of words next to a full drill, so the two never read as the same kind
of ask and the choice is obvious at a glance.

These involve other people on purpose — mischief performed alone is just
another chore. The line they hold is that the other person is in on the joke,
never the butt of it: nothing that insults how someone looks, nothing aimed at
a stranger that would unsettle them, and no touching anyone who has not
obviously invited it. A nudge that embarrasses the user is funny; one that
embarrasses a bystander is something the user has to apologise for.

Answering is mandatory. There is no dismiss, tapping outside does nothing, and
the Android back gesture is swallowed while the card is up — the only way past
it is to pick a side. Trying to escape shakes the card rather than ignoring the
tap, because silence would read as the app being frozen.

Which side people pick is tracked and shown on Home as a split bar.

### The nudge pool: 5,000 per persona, no repeats

A nudge is one task action rendered through one of the persona's phrasings, so
the pool is every pairing: 100 actions x 50 phrasings = **5,000 distinct nudges
per persona on each side** — 5,000 healthy and 5,000 mischievous. Composing them
beats listing them — writing 5,000 lines by hand would mean 5,000 chances to
write a dull one.

The two sides run independent cursors. Sharing one would lock every task to the
same partner for good; separate cursors mean the pairing reshuffles even though
both pools are now the same size.

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

- A nudge every **30 minutes** by default, adjustable from **10 minutes** to
  **3 hours** in Settings. The stored value is clamped on read as well as on
  write, so an out-of-range or corrupt value can never produce a nonsense
  schedule.
- If one would land outside active hours, it's pushed to the next window open.
- Windows that wrap past midnight (22:00 → 06:00) work correctly.
- Disabled categories are excluded from the pool.

### Does it work with the app closed and the screen locked?

Yes, and that is the normal case. Nudges are scheduled with the OS as real
alarms, not kept alive by the app — they fire with the app backgrounded, killed
or the phone locked, and survive a reboot (`LocalNotificationRestoreReceiver`).
The Android channel is created at importance 5 with public lock-screen
visibility, so the nudge appears as a heads-up banner and its text is readable
on the lock screen. `allowWhileIdle` lets them through Doze.

The thing that decides how long it keeps working is how many are queued, since
whatever is queued is all the user gets until they next open the app. That is
sized in days of coverage rather than as a fixed number — at the default
30 minutes the queue spans roughly **2.5 days** of not opening the app, and it
is topped up on every delivery, resume and settings change.

Two limits are the platform's, not ours:

- **iOS discards anything past 64 pending local notifications**, so the queue
  caps at 60. At a 10-minute cadence that is about a day of coverage; at an hour
  or more it is the full three days.
- **Aggressive battery savers kill alarms** on some Android OEMs (Xiaomi, Oppo,
  Vivo, Samsung). No amount of code fixes this — the user has to exempt the app.
  See the device checklist in `docs/MANUAL_SETUP.md`.

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
  data/tasks.ts        100 exercise/reset drills + 100 short social dares
  data/personas.ts     3 personas (Drill Sergeant, Nagging Mom, Mischievous
                       Bestie), 50 in-character phrasings each
  lib/
    nudgePool.ts       pool maths + the no-repeat queue
    auth.ts            phone OTP — stubbed, see docs/AUTH_SETUP.md
    image.ts           profile photo capture + bounded re-encode
    sound.ts           in-app nudge audio
    scheduling.ts      pure time maths (no side effects)
    notifications.ts   scheduling, channels, listeners, reconciliation
    storage.ts         typed Preferences wrapper
    platform.ts        native vs web
    billing.ts         Razorpay subscription — see docs/RAZORPAY_SETUP.md
    deeplink.ts        the return trip from checkout
  state/AppContext.tsx single source of truth
  screens/             Login, ProfileSetup, Home, Personas, Settings,
                       Paywall, Onboarding
  components/          UI primitives + the animated nudge card
api/                   Razorpay subscription server (`npm run api`)
docs/                  the decisions and manual steps left for you
```

---

## ⚠️ Before you ship

**Billing works, but it needs your Razorpay account.** Subscribe opens Razorpay
Checkout — UPI Autopay, cards, netbanking, wallets — as soon as
`VITE_API_BASE_URL` points at a deployed `api/`. Until then the paywall falls
back to a development stub that unlocks for free and says so in a visible
banner. **`docs/RAZORPAY_SETUP.md`** is the hour it takes to switch on,
including test cards.

**Sign-in is stubbed.** `src/lib/auth.ts` sends no SMS and accepts the code
`123456` for any number that passes format validation. The OTP screen shows a developer-build banner while
it's active. `docs/AUTH_SETUP.md` has the Firebase setup, and flags three things
that bite at launch: account deletion is required by both stores once you have
login, nothing syncs across devices yet, and "collects nothing" stops being true
in your privacy labels.

**There's still an open decision about the stores** — Apple and Google require
their own billing for in-app digital subscriptions, which rules out Razorpay
inside a store build. The Razorpay flow is ready for direct Android
distribution and the web; for the App Store and Play you'd add RevenueCat
behind the same interface. Both options are laid out in
**`docs/BILLING_DECISION.md`**; I deliberately didn't pick one.

Everything else outstanding is in **`docs/MANUAL_SETUP.md`** — Razorpay KYC,
real notification sounds, icons, and the on-device test checklist.

---

## Scripts

| Command                       | Does                                       |
| ----------------------------- | ------------------------------------------ |
| `npm run dev`                 | Vite dev server                            |
| `npm run api`                 | Subscription API on :5060 (see api/README) |
| `npm run build`               | Typecheck + production build               |
| `npm run test`                | Logic, billing and webhook tests           |
| `npm run lint`                | oxlint                                     |
| `node scripts/gen-sounds.mjs` | Regenerate placeholder notification sounds |
