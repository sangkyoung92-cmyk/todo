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
5. Verify `오늘`, `음성`, `노트`, `캘린더` bottom tabs render.
6. Add a task in the mobile app and confirm it appears in the web app.
7. Toggle task completion in the mobile app and confirm it updates in the web app.
8. Edit and delete a task in the mobile app and confirm both sync correctly.
9. On the `오늘` tab, tap `현재 위치로 날씨 브리핑 받기` and confirm Android asks for location permission.
10. Confirm the today screen still shows a local briefing when weather/AI briefing data is unavailable.

## Today Briefing UI

- The mobile app now prioritizes the `오늘` screen over the old large hero layout.
- The first screen shows a one-line briefing, location/weather readiness, carry-item chips, top 3 tasks, and the full today task list.
- The app first tries a configured `assistantBriefingEndpoint` from `users/{uid}/data/state`, then reads `users/{uid}/briefings/{YYYY-MM-DD}`, then falls back to a local schedule-based briefing.
- Location is cached in localStorage under `assistant_weather_location` and is sent only to a configured briefing endpoint.
- Audio capture is represented by the `음성` tab and large voice CTA; actual speech recognition/transcription remains follow-up work.

## Known Follow-Up Work

- Android login currently uses Firebase web auth popup/redirect logic.
- For production reliability, replace this with a Capacitor-friendly Google sign-in flow.
- The mobile companion app currently does not have app icons, splash assets, or release signing config.
- The mobile app is schedule-only and intentionally excludes note editing.

## Recommended Next Implementation Step

1. Replace Firebase web login in the Android companion with a native/Capacitor sign-in flow.
2. Verify Firestore auth/session persistence on a real device.
3. Add the server-side weather/AI briefing function that writes `users/{uid}/briefings/{YYYY-MM-DD}`.
4. Replace the current voice CTA placeholder with native speech recognition/transcription.
5. Add app icons, splash assets, and release signing config.
