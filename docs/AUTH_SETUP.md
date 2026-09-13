# Wiring up real phone sign-in

Sign-in is **phone OTP only**. The login screen is fully built and works end to
end — but against a **stub**. It sends no SMS and talks to no server: any
correctly-formatted number is accepted with the code `123456`, and the OTP
screen shows a developer-build banner saying so while the stub is active.

Making it real is one provider swap plus native configuration.

---

## Why Firebase

Sending an SMS and verifying the code back needs a provider — it cannot be done
from the app alone. Firebase Auth has a maintained Capacitor plugin and a
generous phone-auth free tier.

Alternatives that slot into the same `AuthProvider` interface if you prefer:
Supabase Auth, Auth0, or Twilio Verify (which tends to be cheaper for Indian
SMS at volume — worth pricing if sign-in becomes mandatory).

---

## 1. Create the Firebase project

1. https://console.firebase.google.com → add a project.
2. **Authentication → Sign-in method** → enable **Phone**.
3. Register both apps under Project Settings:
   - Android — package name **`com.nudge.app`** (must match `appId` in
     `capacitor.config.ts`)
   - iOS — bundle ID **`com.nudge.app`**

## 2. Download the config files

These are **not** secrets in the usual sense — they ship inside the app by
design — but they are project-identifying, so treat them as yours.

| File | Goes in |
| --- | --- |
| `google-services.json` | `android/app/google-services.json` |
| `GoogleService-Info.plist` | `ios/App/App/GoogleService-Info.plist` (add to the Xcode target) |

> Until both files exist, **do not install the plugin** — the native build will
> fail at compile time. That is exactly why the plugin is not a dependency yet.

## 3. Android: SHA fingerprints (phone auth will not work without these)

Firebase verifies the app itself via the Play Integrity API before it will send
an SMS, and that check is tied to your signing certificate. Add the SHA-1 and
SHA-256 of **every** keystore you use — debug and release — under Project
Settings → Your apps → Android → Add fingerprint.

```bash
# debug
keytool -list -v -alias androiddebugkey \
  -keystore ~/.android/debug.keystore -storepass android -keypass android

# release
keytool -list -v -alias <your-alias> -keystore <your-release.keystore>
```

Re-download `google-services.json` after adding them.

**If you use Play App Signing**, Google re-signs your app, so you must also add
the SHA-256 from Play Console → Release → Setup → App signing. Forgetting this
is the single most common reason phone auth works in testing and then fails for
everyone in production.

## 4. iOS: APNs for app verification

iOS phone auth verifies the device with a silent push, so APNs must be set up —
there is no way around it:

1. Upload an **APNs auth key** (.p8) under Project Settings → Cloud Messaging.
2. In Xcode, enable the **Push Notifications** capability and **Background
   Modes → Remote notifications** on the App target.

`GoogleService-Info.plist` must be added to the Xcode target as a bundle
resource (drag it in, tick "Copy items if needed") — Capacitor's sync will not
do this for you.

Leave the existing `nudgeapp` URL scheme in `Info.plist` alone; it is the
Razorpay return trip and unrelated to auth.

## 5. Install the plugin and flip the provider

```bash
npm install @capacitor-firebase/authentication firebase
npx cap sync
```

Then in `src/lib/auth.ts`, at the bottom:

```ts
export const activeProvider: AuthProvider = stubProvider;  // → firebaseProvider
```

Delete `stubProvider`, the `STUB_OTP_CODE` export, and the `void
firebaseProvider;` line. The login screen's developer banner disappears on its
own once the provider id is no longer `'stub'`.

Also add the plugin's Firebase config to `capacitor.config.ts`:

```ts
plugins: {
  FirebaseAuthentication: {
    skipNativeAuth: false,
    providers: ['phone'],
  },
}
```

## 6. Test on a device

Phone auth cannot be tested in a browser — it needs Play Integrity (Android) or
APNs (iOS).

- [ ] Real SMS arrives and the code verifies.
- [ ] Wrong code shows the error, right code signs in.
- [ ] Works on a **release-signed** build, not just debug (see the SHA note).
- [ ] Sign out, then sign back in with the same number — same account.
- [ ] Airplane mode shows the network error rather than hanging.
- [ ] An invalid number shows "Please enter a valid phone number" before any
      SMS is attempted.

Add **test numbers** under Authentication → Sign-in method → Phone → "Phone
numbers for testing" so you can develop without burning your SMS quota or
getting rate-limited.

---

## Things worth deciding before launch

**Quota and cost.** Firebase phone auth is free up to a monthly limit, then
billed per SMS. Indian SMS is not the cheapest route, and phone OTP is now the
*only* sign-in path, so every account costs you at least one SMS. If sign-in is
optional (as it is now), most users will tap guest and never trigger one. If
you make it mandatory, model the cost first and price Twilio Verify against
Firebase.

**Is sign-in mandatory?** Currently no — the login screen offers "continue
without an account", and a guest session is a first-class state. To make it
required, remove the guest button in `src/screens/Login.tsx` and drop
`continueAsGuest` from `src/state/AppContext.tsx`.

Be deliberate about this. Nudge's pitch is that nothing leaves your device, and
right now that is still true for anyone who taps guest. A mandatory account on
an app that stores nothing server-side is friction users notice and reviewers
comment on.

**Nothing syncs yet.** The session is stored, but settings, streak and premium
status are still device-local — signing in on a new phone gives you an empty
app. Real cross-device sync needs a backend (Firestore would be the natural
pairing). The login screen currently promises settings "follow you to a new
phone"; either build that sync or soften the copy before release.

**Account deletion.** Both stores require an in-app way to delete an account
once you have sign-in (Apple Guideline 5.1.1(v), Google's equivalent). There is
no delete-account flow yet — add one before submitting.

**Privacy policy.** Collecting a phone number or email means your store listing
needs a privacy policy URL and accurate data-safety declarations. The "collects
nothing" answer stops being true the moment real auth ships.
