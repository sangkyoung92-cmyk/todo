# Next Session Prompt

Use this in the next Codex session:

```text
Workspace: C:\Users\sangk\Documents\Playground\todo

Please continue the Android companion app work.

Context:
- Shared schedule logic already exists in `packages/schedule-core`.
- Shared helpers and Firebase config are in `packages/shared`.
- Existing web schedule code was updated to use the shared modules.
- Android companion assets are in `apps/android/capacitor/www`.
- Capacitor Android project already exists in `apps/android/capacitor/android`.
- Runbook is in `docs/android-companion-runbook.md`.
- Data model doc is in `docs/mobile-companion-data-model.md`.

What I want next:
1. Make Android login production-safe by replacing web popup/redirect auth with a Capacitor-friendly Google sign-in flow.
2. Verify the companion app works end-to-end on Android with Firestore sync.
3. Improve mobile UX polish only where needed for schedule viewing and quick add.
4. Keep the existing web app behavior intact.

Constraints:
- Do not remove note features from the web app.
- The mobile app remains schedule-only.
- Reuse the shared schedule modules instead of duplicating logic.
- Prefer minimal, practical changes over a large rewrite.

Before changing code:
- Read `docs/android-companion-runbook.md`
- Read `docs/mobile-companion-data-model.md`
- Inspect `apps/android/capacitor/www/src/main.js`
- Inspect `packages/shared/schedule-repository.js`
- Inspect `packages/schedule-core/tasks.js`

Deliverables:
- Implement the Android auth improvement.
- Run the relevant verification steps you can.
- Summarize what still needs manual device testing.
```
