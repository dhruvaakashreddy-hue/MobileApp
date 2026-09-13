# Nudge 🫡

Random, in-character reminders to sit up, drink water and move — delivered by a
persona you pick, at times you can't predict.

Cross-platform (Android + iOS) via Capacitor. **Local-first: no backend, no
accounts, no analytics, and no network calls anywhere in the nudge path.** All
90 lines ship bundled in the app.

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

### Scheduling

`src/lib/scheduling.ts` holds the time maths as pure functions — no Capacitor,
no ambient `Date.now()`. That's deliberate: overnight active-hour windows and
"push this nudge to tomorrow morning" are the fiddly parts, and they're much
easier to reason about (and test) in isolation.

- Each nudge gets a random gap inside the user's min/max range.
- If it would land outside active hours, it's pushed to the next window open.
- Windows that wrap past midnight (22:00 → 06:00) work correctly.
- The same line never fires twice in a row.
- Disabled categories are excluded from the pool.

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

### Layout

```
src/
  data/personas.ts     90 in-character lines across 3 personas, 6 categories
  lib/
    scheduling.ts      pure time maths (no side effects)
    notifications.ts   scheduling, channels, listeners, reconciliation
    storage.ts         typed Preferences wrapper
    billing.ts         subscription — stubbed, see docs/BILLING_DECISION.md
    deeplink.ts        Razorpay return trip
  state/AppContext.tsx single source of truth
  screens/             Home, Personas, Settings, Paywall, Onboarding
  components/          UI primitives + the animated nudge card
api/                   minimal Razorpay server (not deployed)
docs/                  the decisions and manual steps left for you
```

---

## ⚠️ Before you ship

**Billing is stubbed.** `stubProvider` in `src/lib/billing.ts` unlocks premium
for free, locally, to anyone who taps the button. The paywall shows a visible
developer-build warning while it's active.

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
