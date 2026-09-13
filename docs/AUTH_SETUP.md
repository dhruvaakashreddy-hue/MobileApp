# Wiring up real sign-in

The login screen is fully built and works end to end — but against a **stub**.
It sends no SMS and talks to no server: any correctly-formatted number is
accepted with the code `123456`, and the OTP screen shows a developer-build
banner saying so while the stub is active.

Making it real is one provider swap plus native configuration.

---

## Why Firebase

Phone OTP and Google sign-in both need a provider; neither can be done from the
app alone. Firebase Auth is the choice here because it is the only mainstream
option offering **both** on Capacitor through a single maintained plugin, and
its phone-auth free tier is generous.

Alternatives that also work, if you prefer: Supabase Auth (good phone OTP, but
native Google sign-in needs extra wiring) or Auth0. Both would slot into the
same `AuthProvider` interface.

---

## 1. Create the Firebase project

1. https://console.firebase.google.com → add a project.
2. **Authentication → Sign-in method**, enable:
   - **Phone**
   - **Google** (set a support email)
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

## 3. Android: SHA fingerprints (Google sign-in will not work without these)

Google sign-in on Android verifies your signing certificate. Add the SHA-1 and
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
the SHA-1 from Play Console → Release → Setup → App signing. Forgetting this is
the single most common reason Google sign-in works in testing and fails in
production.

## 4. iOS: the reversed client ID URL scheme

Open `GoogleService-Info.plist`, copy the `REVERSED_CLIENT_ID` value
(`com.googleusercontent.apps.123456-abcdef`), and add it as a URL scheme in
`ios/App/App/Info.plist` — **alongside** the existing `nudgeapp` scheme, not
replacing it:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>com.nudge.app</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>nudgeapp</string>
      <string>com.googleusercontent.apps.YOUR-REVERSED-CLIENT-ID</string>
    </array>
  </dict>
</array>
```

Phone auth on iOS also needs **APNs** configured (Firebase uses a silent push to
verify the device). Upload an APNs auth key under Project Settings → Cloud
Messaging, and enable Push Notifications + Background Modes → Remote
notifications in Xcode capabilities.

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
    providers: ['phone', 'google.com'],
  },
}
```

## 6. Test on a device

Phone auth cannot be tested in a browser — it needs Play Integrity (Android) or
APNs (iOS).

- [ ] Real SMS arrives and the code verifies.
- [ ] Wrong code shows the error, right code signs in.
- [ ] Google sign-in works on a **release-signed** build, not just debug.
- [ ] Sign out, then sign back in with the same number — same account.
- [ ] Airplane mode shows the network error rather than hanging.

Add **test numbers** under Authentication → Sign-in method → Phone → "Phone
numbers for testing" so you can develop without burning your SMS quota or
getting rate-limited.

---

## Things worth deciding before launch

**Quota and cost.** Firebase phone auth is free up to a monthly limit, then
billed per SMS. Indian SMS is not the cheapest route. If sign-in is optional
(as it is now), most users will never trigger an SMS, which keeps this near
zero. If you make it mandatory, model the cost first.

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
