# What's left for you to do by hand

Everything here needs an account, a device, a bank, or a design decision, so
none of it could be done from inside this repo.

---

## 1. Decide how you're charging — do this one first

**→ Read `docs/BILLING_DECISION.md`.** It changes what you build next, so it
blocks items 2 and 3.

---

## 1b. Firebase sign-in

Sign-in is phone OTP only, and works against a stub that sends no SMS.
**→ `docs/AUTH_SETUP.md`** covers the Firebase project, the SHA fingerprints
Play Integrity needs on Android, and the APNs key iOS phone auth needs — miss
either and no SMS is ever sent. It also flags the account-deletion flow both
stores require once you ship login.

---

## 2. Razorpay account and KYC (only if you picked Option B, or for a web checkout)

1. Create a Razorpay business account at https://razorpay.com.
2. Complete KYC in **their dashboard**: PAN, GST if applicable, and your bank
   account details. **Bank details go in the Razorpay dashboard only — never in
   this repo, never in the app bundle, never in an environment variable here.**
3. Create a Subscription Plan: ₹99, monthly, with the billing cycle you want.
   Note the **Plan ID** (`plan_...`).
4. From Settings → API Keys, generate a **Key ID** and **Key Secret**.
5. Enable UPI Autopay and/or eNACH as recurring payment methods — without them
   ₹99/month recurring will not work well in India.

## 3. Deploy the subscription server

The app cannot create or verify subscriptions on its own — see `api/README.md`.

1. Deploy the `api/` folder (Vercel, Netlify Functions, Railway, a small VPS —
   anything that runs Node).
2. Set on the host, not in this repo:
   `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_ID`,
   `RAZORPAY_WEBHOOK_SECRET`.
3. In the Razorpay dashboard, add a webhook pointing at `<your-host>/webhook`,
   subscribing to `subscription.activated`, `subscription.charged`,
   `subscription.halted`, `subscription.cancelled`, `subscription.completed`.
4. Put the deployed base URL in `.env` as `VITE_API_BASE_URL`.
5. **Replace the in-memory store in `api/_store.ts` with a real database.** As
   written, every cold start forgets who has paid.
6. Switch `activeProvider` in `src/lib/billing.ts` from `stubProvider` to
   `razorpayProvider`, and delete `stubProvider`.

> ⚠️ **The stub unlocks premium for free.** `stubProvider` grants a 30-day local
> entitlement to anyone who taps the button. The paywall shows a visible
> developer-build warning while it is active. Do not ship a store build until
> this is swapped out.

---

## 4. Custom notification sounds

Placeholders exist and work — `scripts/gen-sounds.mjs` synthesises a short motif
per persona so you can feel the difference when a nudge lands. They are
deliberately plain; real audio will do far more for the app's character.

Replace these files (16-bit PCM WAV, mono, under ~5 seconds — both platforms
reject long sounds):

```
android/app/src/main/res/raw/{drill_sergeant,mom,bestie,nudge_default}.wav
ios/App/App/sounds/{drill_sergeant,mom,bestie,nudge_default}.wav
```

Filenames must stay the same, or update `sound` in `src/data/personas.ts`.

**On iOS**, the sound files must be added to the Xcode project as bundle
resources — drag `ios/App/App/sounds/` into the App target in Xcode and tick
"Copy items if needed". Capacitor's sync does not do this for you.

**On Android**, a notification channel's sound is fixed when the channel is
created. `src/lib/notifications.ts` versions channel ids (`nudge-v1-...`) for
exactly this reason — if you change a sound after users have installed, bump
`v1` to `v2` or existing users keep the old sound forever.

## 5. Icons and splash screens

Currently using Capacitor's defaults, which say "unfinished app" loudly.

```bash
npm install -D @capacitor/assets
# put a 1024x1024 icon.png and 2732x2732 splash.png in ./assets
npx capacitor-assets generate
```

Also replace, by hand:
- `android/app/src/main/res/drawable/ic_stat_nudge.xml` — the status-bar icon.
  Must be a **solid white silhouette on transparency**; Android discards colour
  here, so a full-colour icon renders as a white blob.
- `android/app/src/main/res/drawable/persona_*.xml` — placeholder avatars used
  as the notification large icon.

## 5b. Profile photos: test the permission paths

The camera and gallery need runtime permission on both platforms, and the usage
strings are already in `Info.plist` / `AndroidManifest.xml`. What cannot be
tested in a browser:

- [ ] Take a photo — the system crop UI appears (`allowEditing`) and the result
      is square.
- [ ] Pick from the gallery on Android 13+ (READ_MEDIA_IMAGES) **and** on
      Android 12 or older (READ_EXTERNAL_STORAGE) — these are different grants.
- [ ] **Deny** camera permission, then tap "Take a photo": the app must show the
      explanatory message, not hang or crash.
- [ ] Cancel out of the picker — treated as a no-op, no error shown.
- [ ] A very large photo (50MP phone camera) still saves quickly and the avatar
      stays sharp.

## 6. Test on real devices

The notification behaviour is the app, and none of it can be verified in a
browser:

- [ ] A nudge arrives with the app **killed** (not just backgrounded).
- [ ] A nudge arrives with the **screen locked**, and its text is readable on
      the lock screen without unlocking.
- [ ] Leave the app closed overnight and confirm nudges still arrive the next
      day — this is what the queue depth exists for.
- [ ] Tapping that notification opens the app onto the persona card.
- [ ] The per-persona sound plays, and the sound toggle silences it.
- [ ] Nothing fires outside active hours — set a narrow window and leave it.
- [ ] Nudges survive a **reboot** (the restore receiver is registered).
- [ ] Android 13+ shows the runtime notification permission prompt.
- [ ] Battery optimisation: on Xiaomi, Oppo, Vivo and Samsung, aggressive
      battery savers kill scheduled alarms outright. Test on at least one.
      Code cannot fix this — the app has to ask the user to exempt it, and
      those OEMs are the most common cause of "the notifications just stopped".
- [ ] **Android 13+ exact alarms.** The manifest asks for SCHEDULE_EXACT_ALARM
      and USE_EXACT_ALARM so nudges land on the minute. Play restricts
      USE_EXACT_ALARM to alarm-and-reminder apps; if the listing is rejected
      over it, drop that permission and accept that Doze may delay a nudge by a
      few minutes, which for this app is harmless.
- [ ] iOS: confirm nudges show as alerts rather than silent banners.

## 7. Store listings (if you picked Option A)

- Apple Developer Program — $99/year, plus App Store Connect setup.
- Google Play Developer — $25 one-off.
- Privacy labels: Nudge collects **nothing**. No analytics, no accounts, no
  network calls in the nudge path. Say so plainly — it is a real selling point.
- Content rating: the Bestie persona uses mild slang ("bro", "💀", "dusty").
  Nothing profane, but rate honestly.
- Screenshots: the persona card and the persona picker are the app's best
  pages.

## 8. Before any public release

- [ ] Swap the billing `stubProvider` out (see above).
- [ ] Swap the auth stub out, and add an in-app delete-account flow — both
      stores require one once sign-in exists.
- [ ] Replace the placeholder "Rate the app" URL in `src/screens/Settings.tsx`
      with your real store listing.
- [ ] Generate a signing keystore for Android and configure release signing.
      Back it up somewhere you will not lose it — losing it means you can never
      update the listing.
- [ ] Set a real `appId` if `com.nudge.app` is not what you want on the stores;
      it cannot be changed after publishing.
