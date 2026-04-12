# Android Companion Runbook

## Current State

- Shared schedule logic is in `packages/schedule-core`.
- Shared Firebase/date helpers are in `packages/shared`.
- The existing web schedule UI now uses the shared schedule modules.
- The Android companion app web assets live in `apps/android/capacitor/www`.
- The native Android project has been created in `apps/android/capacitor/android`.

## Local Commands

Run from `apps/android/capacitor`:

```bash
npm install
npm run sync
npm run open:android
```

## What To Verify In Android Studio

1. Open an emulator or attach a real Android device.
2. Build and run the app.
3. Confirm the first screen shows the companion login state.
4. Test Google login.
5. Verify `오늘`, `이번 주`, `캘린더`, `빠른 추가` tabs render.
6. Add a task in the mobile app and confirm it appears in the web app.
7. Toggle task completion in the mobile app and confirm it updates in the web app.
8. Edit and delete a task in the mobile app and confirm both sync correctly.

## Known Follow-Up Work

- Android login currently uses Firebase web auth popup/redirect logic.
- For production reliability, replace this with a Capacitor-friendly Google sign-in flow.
- The mobile companion app currently does not have app icons, splash assets, or release signing config.
- The mobile app is schedule-only and intentionally excludes note editing.

## Recommended Next Implementation Step

1. Replace Firebase web login in the Android companion with a native/Capacitor sign-in flow.
2. Verify Firestore auth/session persistence on a real device.
3. Add a lightweight loading/error state for mobile sync.
4. Do one UI pass for Korean copy, spacing, and touch targets.
